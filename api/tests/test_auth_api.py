"""API contract tests: auth flow, consent gate, health, model-info.

Runs WITHOUT TensorFlow/models (SKIP_MODELS) so it works in CI and on any
dev machine in a couple of seconds.
"""
import io
import os

import pytest

os.environ['MEDIVISION_SKIP_MODELS'] = '1'

from app import create_app  # noqa: E402
from config import Config  # noqa: E402


@pytest.fixture()
def client(tmp_path):
    class TestConfig(Config):
        TESTING = True
        SKIP_MODELS = True
        SQLALCHEMY_DATABASE_URI = 'sqlite:///' + str(tmp_path / 'test.db').replace('\\', '/')
        RATELIMIT_ENABLED = False  # don't rate-limit unit tests

    app = create_app(TestConfig)
    with app.test_client() as c:
        yield c


def _register(client, email='yash@example.com', password='supersecret1'):
    return client.post('/api/auth/register', json={'email': email, 'password': password})


def test_health(client):
    res = client.get('/api/health')
    assert res.status_code == 200
    body = res.get_json()
    assert body['status'] == 'ok'
    assert body['models_loaded'] is False  # models skipped in tests


def test_model_info(client):
    res = client.get('/api/model-info')
    assert res.status_code == 200
    assert 'models' in res.get_json()


def test_register_login_me_flow(client):
    res = _register(client)
    assert res.status_code == 201
    token = res.get_json()['token']
    assert token

    # Duplicate registration rejected.
    assert _register(client).status_code == 409

    # Login works.
    res = client.post('/api/auth/login',
                      json={'email': 'yash@example.com', 'password': 'supersecret1'})
    assert res.status_code == 200
    token = res.get_json()['token']

    # Wrong password rejected.
    res = client.post('/api/auth/login',
                      json={'email': 'yash@example.com', 'password': 'wrong-pass'})
    assert res.status_code == 401

    # /me returns the user.
    res = client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert res.status_code == 200
    assert res.get_json()['user']['email'] == 'yash@example.com'


def test_register_validation(client):
    assert _register(client, email='not-an-email').status_code == 400
    assert _register(client, password='short').status_code == 400


def test_history_requires_auth(client):
    assert client.get('/api/history').status_code == 401


def test_history_empty_for_new_user(client):
    token = _register(client).get_json()['token']
    res = client.get('/api/history', headers={'Authorization': f'Bearer {token}'})
    assert res.status_code == 200
    assert res.get_json()['items'] == []


def _fake_image():
    return {'image': (io.BytesIO(b'fake-image-bytes'), 'test.jpg')}


def test_analyze_requires_consent(client):
    res = client.post('/api/analyze', data=_fake_image(),
                      content_type='multipart/form-data')
    assert res.status_code == 400
    assert res.get_json()['code'] == 'CONSENT_REQUIRED'


def test_analyze_with_consent_reaches_model_stage(client):
    # With consent given and a valid-looking upload, the request passes the
    # consent + validation gates and stops only at the (skipped) models.
    res = client.post('/api/analyze',
                      data={'consent': 'true', **_fake_image()},
                      content_type='multipart/form-data')
    assert res.status_code == 503
    assert res.get_json()['code'] == 'MODELS_UNAVAILABLE'


def test_analyze_rejects_bad_file_type(client):
    res = client.post('/api/analyze',
                      data={'consent': 'true',
                            'image': (io.BytesIO(b'x'), 'evil.exe')},
                      content_type='multipart/form-data')
    assert res.status_code == 400
