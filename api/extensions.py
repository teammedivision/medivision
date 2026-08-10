"""Shared Flask extension instances.

Kept in their own module so blueprints (auth.py) and app.py can both import
them without circular imports.
"""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
