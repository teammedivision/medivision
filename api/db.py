"""Database models: users, analysis history, and audit log.

SQLite by default (api/data/medivision.db, auto-created). Set DATABASE_URL
to a postgresql:// URL for production - no code changes needed.

Privacy note: images are NEVER stored. Only prediction metadata is logged.
"""
import os
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False)

    analyses = db.relationship('Analysis', backref='user', lazy='dynamic')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Analysis(db.Model):
    """One row per /api/analyze call. No image data is ever stored."""
    __tablename__ = 'analyses'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)
    domain = db.Column(db.String(16), nullable=False)
    domain_confidence = db.Column(db.Float, nullable=False)
    top_disease = db.Column(db.String(64), nullable=False)
    top_confidence = db.Column(db.Float, nullable=False)
    severity = db.Column(db.String(16), nullable=False)
    low_confidence = db.Column(db.Boolean, default=False, nullable=False)
    symptoms_used = db.Column(db.Boolean, default=False, nullable=False)
    duration_ms = db.Column(db.Integer, nullable=True)
    client_ip = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'domain': self.domain,
            'domain_confidence': self.domain_confidence,
            'top_disease': self.top_disease,
            'top_confidence': self.top_confidence,
            'severity': self.severity,
            'low_confidence': self.low_confidence,
            'symptoms_used': self.symptoms_used,
            'duration_ms': self.duration_ms,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class AuditLog(db.Model):
    """Security/audit trail: registrations, logins, analyses, rejections."""
    __tablename__ = 'audit_log'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True, index=True)
    event = db.Column(db.String(48), nullable=False, index=True)
    detail = db.Column(db.String(512), nullable=True)
    ip = db.Column(db.String(64), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False, index=True)


def log_event(event, detail='', user_id=None, ip=None):
    """Best-effort audit logging - never crashes the request."""
    try:
        db.session.add(AuditLog(event=event, detail=(detail or '')[:512],
                                user_id=user_id, ip=ip))
        db.session.commit()
    except Exception:
        db.session.rollback()


def init_db(app):
    uri = app.config['SQLALCHEMY_DATABASE_URI']
    if uri.startswith('sqlite:///'):
        db_path = uri.replace('sqlite:///', '', 1)
        parent = os.path.dirname(db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
    db.init_app(app)
    with app.app_context():
        db.create_all()
