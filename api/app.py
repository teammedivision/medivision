"""MediVision Flask API - production-hardened.

POST /api/analyze runs the full multi-task pipeline:
  consent check -> validation -> OOD gate -> domain router -> disease
  classifier -> (optional symptom refinement) -> Grad-CAM
and returns a JSON payload the frontend renders directly.

Hardening added on top of the original API:
  * JWT auth (register/login/me) + per-user analysis history
  * SQLite/Postgres database for history + audit logging (no images stored)
  * CORS locked to configured origins (config.py / ALLOWED_ORIGINS)
  * Rate limiting on all routes, stricter on analyze/login/register
  * Consent enforcement before analysis (REQUIRE_CONSENT)
  * Out-of-distribution gate rejects non-medical images
  * Rotating file logs + optional Sentry error tracking

Images are never written to disk - they live in memory as io.BytesIO from
upload through inference.
"""
import io
import json
import logging
import os
import time
from logging.handlers import RotatingFileHandler

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager, get_jwt_identity, jwt_required

from auth import auth_bp, current_user_optional
from config import Config
from db import Analysis, db, init_db, log_event
from extensions import limiter
from utils.ood import check_out_of_distribution
from utils.severity import severity_for
from utils.symptoms import refine_predictions

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend')

MAX_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIME = {'image/jpeg', 'image/png', 'image/webp'}
ALLOWED_EXT = {'.jpg', '.jpeg', '.png', '.webp'}
LOW_CONFIDENCE_THRESHOLD = 0.50
APP_VERSION = '2.0.0'


def _validate_upload(file_storage):
    """Return (ok, error_msg). Validates MIME type, extension, and size."""
    if file_storage is None:
        return False, "Missing 'image' file in form data."
    filename = (file_storage.filename or '').lower()
    ext = os.path.splitext(filename)[1]
    if ext not in ALLOWED_EXT and (file_storage.mimetype or '') not in ALLOWED_MIME:
        return False, "Unsupported file type. Use JPG, PNG, or WEBP."
    file_storage.stream.seek(0, io.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if size > MAX_BYTES:
        return False, f"File too large ({size/1_048_576:.1f} MB). Max 10 MB."
    if size == 0:
        return False, "Empty file."
    return True, None


def _client_ip():
    fwd = request.headers.get('X-Forwarded-For', '')
    return (fwd.split(',')[0].strip() if fwd else '') or request.remote_addr


def _setup_logging(app):
    try:
        log_dir = app.config['LOG_DIR']
        os.makedirs(log_dir, exist_ok=True)
        handler = RotatingFileHandler(
            os.path.join(log_dir, 'medivision.log'),
            maxBytes=1_000_000, backupCount=5, encoding='utf-8',
        )
        handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s %(name)s: %(message)s'))
        handler.setLevel(logging.INFO)
        app.logger.addHandler(handler)
        app.logger.setLevel(logging.INFO)
    except Exception as e:  # logging must never take the app down
        print(f'[app] File logging disabled: {e}')


def create_app(config_object=Config):
    app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
    app.config.from_object(config_object)

    # --- Observability ---------------------------------------------------
    _setup_logging(app)
    if app.config.get('SENTRY_DSN'):
        try:
            import sentry_sdk
            sentry_sdk.init(dsn=app.config['SENTRY_DSN'], traces_sample_rate=0.1)
            app.logger.info('Sentry error tracking enabled.')
        except ImportError:
            app.logger.warning('SENTRY_DSN set but sentry-sdk not installed.')

    # --- Security & platform extensions ----------------------------------
    CORS(app, resources={r'/api/*': {'origins': app.config['ALLOWED_ORIGINS']}})
    JWTManager(app)
    limiter.init_app(app)
    init_db(app)
    app.register_blueprint(auth_bp)

    # --- Models -----------------------------------------------------------
    # Heavy ML imports are done here (not at module top) so tests and CI can
    # exercise the full API contract with MEDIVISION_SKIP_MODELS=1.
    mv = {'ready': False}
    if not app.config.get('SKIP_MODELS'):
        print('[app] Loading models (one-time)...')
        from models.gradcam import generate_gradcam_overlay
        from models.loader import (
            CLASS_LISTS, MODELS, load_all_models, predict_disease,
            predict_domain, warmup_models,
        )
        load_all_models()
        warmup_models()  # pre-build TF graphs so the first prediction is fast
        mv.update(
            ready=True,
            predict_domain=predict_domain,
            predict_disease=predict_disease,
            generate_gradcam_overlay=generate_gradcam_overlay,
            CLASS_LISTS=CLASS_LISTS,
            MODELS=MODELS,
        )
    else:
        print('[app] MEDIVISION_SKIP_MODELS=1 - running without ML models.')

    # --- Error handlers ---------------------------------------------------
    @app.errorhandler(429)
    def ratelimit_handler(e):
        return jsonify({
            'error': 'Too many requests. Please wait a minute and try again.',
            'code': 'RATE_LIMITED',
        }), 429

    # --- Static frontend --------------------------------------------------
    @app.get('/')
    def index():
        return send_from_directory(app.static_folder, 'index.html')

    # --- Meta endpoints ---------------------------------------------------
    @app.get('/api/health')
    def health():
        return jsonify({
            'status': 'ok',
            'version': APP_VERSION,
            'models_loaded': mv['ready'],
        })

    @app.get('/api/model-info')
    def model_info():
        path = os.path.join(os.path.dirname(__file__), 'model_metrics.json')
        try:
            with open(path, encoding='utf-8') as f:
                return jsonify(json.load(f))
        except Exception:
            return jsonify({'error': 'model_metrics.json not found or invalid.'}), 500

    # --- History (auth required) -----------------------------------------
    @app.get('/api/history')
    @jwt_required()
    def history():
        uid = int(get_jwt_identity())
        rows = (Analysis.query.filter_by(user_id=uid)
                .order_by(Analysis.created_at.desc()).limit(50).all())
        return jsonify({'items': [r.to_dict() for r in rows]})

    # --- Analyze ----------------------------------------------------------
    @app.post('/api/analyze')
    @limiter.limit(lambda: app.config['RATE_LIMIT_ANALYZE'])
    def analyze():
        t0 = time.time()
        ip = _client_ip()
        user = current_user_optional()
        uid = user.id if user else None

        # 1. Consent gate (frontend sends consent=true after the disclaimer
        #    is accepted; also enforced server-side so the API can't be used
        #    without acknowledging the terms).
        if app.config['REQUIRE_CONSENT'] and \
                (request.form.get('consent') or '').lower() not in ('true', '1', 'yes'):
            return jsonify({
                'error': 'You must accept the medical disclaimer and terms '
                         'of service before analysis.',
                'code': 'CONSENT_REQUIRED',
            }), 400

        # 2. Upload validation.
        file_storage = request.files.get('image')
        ok, err = _validate_upload(file_storage)
        if not ok:
            return jsonify({'error': err}), 400

        if not mv['ready']:
            return jsonify({'error': 'Models are not loaded on this server.',
                            'code': 'MODELS_UNAVAILABLE'}), 503

        symptoms_raw = (request.form.get('symptoms') or '').strip()
        image_bytes = file_storage.read()  # in-memory, never written to disk

        try:
            # 3. Domain router.
            domain, domain_conf, domain_probs = mv['predict_domain'](image_bytes)

            # 4. Out-of-distribution gate - reject images that don't look
            #    like any supported medical domain.
            is_ood, reason = check_out_of_distribution(
                domain_probs,
                min_confidence=app.config['OOD_MIN_DOMAIN_CONFIDENCE'],
                max_entropy=app.config['OOD_MAX_ENTROPY'],
            )
            if is_ood:
                log_event('analyze_rejected', reason, user_id=uid, ip=ip)
                app.logger.info(f'OOD rejection ({reason}) ip={ip}')
                return jsonify({
                    'error': "This doesn't look like a supported medical image "
                             '(a close-up of skin, an eye, or teeth). Please '
                             'upload a clear, well-lit close-up photo.',
                    'code': 'OUT_OF_DISTRIBUTION',
                    'detail': reason,
                    'domain_probs': domain_probs,
                }), 422

            # 5. Disease classifier for the detected domain.
            raw_uint8, batch, disease_probs, top_class, top_conf = \
                mv['predict_disease'](image_bytes, domain)
        except Exception as e:
            app.logger.exception('Inference failed')
            return jsonify({'error': f'Inference failed: {e}'}), 500

        # 6. Optional symptom refinement.
        symptoms_used = False
        symptom_matches_out = {}
        if symptoms_raw:
            updated_probs, refined_top, refined_conf, refined_matches = \
                refine_predictions(disease_probs, symptoms_raw, domain)
            disease_probs = updated_probs
            top_class = refined_top
            top_conf = refined_conf
            symptoms_used = True
            symptom_matches_out = refined_matches

        all_predictions = sorted(
            ({'label': c, 'probability': float(p)} for c, p in disease_probs.items()),
            key=lambda d: d['probability'], reverse=True,
        )

        # 7. Grad-CAM explanation.
        try:
            classes = mv['CLASS_LISTS'][domain]
            pred_idx = classes.index(top_class)
            gradcam_b64 = mv['generate_gradcam_overlay'](
                mv['MODELS'][domain], batch, pred_idx, original_uint8=raw_uint8,
            )
        except Exception as e:
            app.logger.warning(f'Grad-CAM failed: {e}')
            gradcam_b64 = ''

        severity, recommendation = severity_for(top_class)
        low_confidence = top_conf < LOW_CONFIDENCE_THRESHOLD
        duration_ms = int((time.time() - t0) * 1000)

        # 8. Persist history (metadata only - never the image itself).
        analysis_id = None
        try:
            row = Analysis(
                user_id=uid, domain=domain, domain_confidence=float(domain_conf),
                top_disease=top_class, top_confidence=float(top_conf),
                severity=severity, low_confidence=low_confidence,
                symptoms_used=symptoms_used, duration_ms=duration_ms, client_ip=ip,
            )
            db.session.add(row)
            db.session.commit()
            analysis_id = row.id
        except Exception:
            db.session.rollback()
            app.logger.warning('Failed to persist analysis row')

        log_event('analyze', f'{domain}/{top_class}', user_id=uid, ip=ip)
        app.logger.info(
            f'analyze ok domain={domain} top={top_class} conf={top_conf:.3f} '
            f'user={uid} ms={duration_ms}')

        return jsonify({
            'analysis_id': analysis_id,
            'domain': domain,
            'domain_confidence': float(domain_conf),
            'top_disease': top_class,
            'top_confidence': float(top_conf),
            'all_predictions': all_predictions,
            'symptoms_used': symptoms_used,
            'symptom_matches': symptom_matches_out,
            'gradcam_image': gradcam_b64,
            'low_confidence': low_confidence,
            'severity': severity,
            'recommendation': recommendation,
        })

    return app


if __name__ == '__main__':
    # threaded=False keeps TF graph state predictable on Windows.
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=False)
