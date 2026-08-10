"""Central configuration for MediVision.

Every value can be overridden with an environment variable (a .env file at
the project root is loaded automatically if python-dotenv is installed).
Copy .env.example to .env and fill in real values before deploying.
"""
import os
import secrets

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env'))
except ImportError:
    pass  # dotenv optional - plain environment variables still work


def _bool(name, default):
    return os.environ.get(name, str(default)).strip().lower() in ('1', 'true', 'yes', 'on')


_API_DIR = os.path.dirname(os.path.abspath(__file__))

# Default SQLite database lives in api/data/ (gitignored). Set DATABASE_URL
# to a postgresql:// URL in production.
_default_db = 'sqlite:///' + os.path.join(_API_DIR, 'data', 'medivision.db').replace('\\', '/')
# `or` (not a default arg) so an empty DATABASE_URL= line in .env still
# falls back to SQLite instead of crashing SQLAlchemy.
_db_url = os.environ.get('DATABASE_URL') or _default_db
if _db_url.startswith('postgres://'):  # Render/Heroku style URLs
    _db_url = _db_url.replace('postgres://', 'postgresql://', 1)


class Config:
    # --- Secrets ---------------------------------------------------------
    # WARNING: without SECRET_KEY set, a random key is generated each boot,
    # which invalidates all login tokens on restart. Fine for local dev;
    # ALWAYS set a fixed value in production (see .env.example).
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or SECRET_KEY
    JWT_ACCESS_TOKEN_EXPIRES = 60 * 60 * int(os.environ.get('JWT_EXPIRES_HOURS') or '24')

    # --- Database --------------------------------------------------------
    SQLALCHEMY_DATABASE_URI = _db_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # --- CORS ------------------------------------------------------------
    # Comma-separated list of origins allowed to call the API.
    ALLOWED_ORIGINS = [o.strip() for o in (os.environ.get('ALLOWED_ORIGINS') or
        'http://localhost:5000,http://127.0.0.1:5000,'
        'http://localhost:8080,http://127.0.0.1:8080'
    ).split(',') if o.strip()]

    # --- Rate limiting ---------------------------------------------------
    # `or` everywhere: empty values in .env fall back to safe defaults.
    RATELIMIT_DEFAULT = os.environ.get('RATE_LIMIT_DEFAULT') or '120 per minute'
    RATELIMIT_STORAGE_URI = os.environ.get('RATE_LIMIT_STORAGE') or 'memory://'
    RATE_LIMIT_ANALYZE = os.environ.get('RATE_LIMIT_ANALYZE') or '10 per minute'
    RATE_LIMIT_LOGIN = os.environ.get('RATE_LIMIT_LOGIN') or '5 per minute'
    RATE_LIMIT_REGISTER = os.environ.get('RATE_LIMIT_REGISTER') or '3 per minute'

    # --- Out-of-distribution gate ---------------------------------------
    # Reject images the domain router isn't confident about (e.g. a photo
    # of a car). Heuristic thresholds - tune against a validation set.
    OOD_MIN_DOMAIN_CONFIDENCE = float(os.environ.get('OOD_MIN_DOMAIN_CONFIDENCE') or '0.70')
    OOD_MAX_ENTROPY = float(os.environ.get('OOD_MAX_ENTROPY') or '0.90')

    # --- Behaviour flags -------------------------------------------------
    REQUIRE_CONSENT = _bool('REQUIRE_CONSENT', True)
    SKIP_MODELS = _bool('MEDIVISION_SKIP_MODELS', False)  # tests/CI only

    # --- Observability ---------------------------------------------------
    SENTRY_DSN = os.environ.get('SENTRY_DSN', '')
    LOG_DIR = os.environ.get('LOG_DIR') or os.path.join(_API_DIR, '..', 'logs')
