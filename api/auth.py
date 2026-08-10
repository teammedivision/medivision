"""Authentication endpoints: register, login, me.

JWT bearer tokens via flask-jwt-extended. Passwords hashed with werkzeug
(pbkdf2). Login/register are rate-limited against brute force (limits set
in config.py, wired in extensions.py).
"""
import re

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import (
    create_access_token, get_jwt_identity, jwt_required, verify_jwt_in_request,
)

from db import User, db, log_event
from extensions import limiter

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
MIN_PASSWORD_LEN = 8


def _client_ip():
    fwd = request.headers.get('X-Forwarded-For', '')
    return (fwd.split(',')[0].strip() if fwd else '') or request.remote_addr


def current_user_optional():
    """Return the logged-in User, or None for anonymous requests."""
    try:
        verify_jwt_in_request(optional=True)
        ident = get_jwt_identity()
        if ident is None:
            return None
        return db.session.get(User, int(ident))
    except Exception:
        return None


def _issue_token(user):
    return create_access_token(identity=str(user.id))


@auth_bp.post('/register')
@limiter.limit(lambda: current_app.config['RATE_LIMIT_REGISTER'])
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not EMAIL_RE.match(email):
        return jsonify({'error': 'Please enter a valid email address.'}), 400
    if len(password) < MIN_PASSWORD_LEN:
        return jsonify({'error': f'Password must be at least {MIN_PASSWORD_LEN} characters.'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'An account with this email already exists.'}), 409

    user = User(email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    log_event('register', email, user_id=user.id, ip=_client_ip())

    return jsonify({'token': _issue_token(user), 'user': user.to_dict()}), 201


@auth_bp.post('/login')
@limiter.limit(lambda: current_app.config['RATE_LIMIT_LOGIN'])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        log_event('login_failed', email, ip=_client_ip())
        return jsonify({'error': 'Invalid email or password.'}), 401

    log_event('login', email, user_id=user.id, ip=_client_ip())
    return jsonify({'token': _issue_token(user), 'user': user.to_dict()})


@auth_bp.get('/me')
@jwt_required()
def me():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({'error': 'User not found.'}), 404
    return jsonify({'user': user.to_dict()})
