"""Production server entrypoint.

Runs the MediVision API under waitress (a production-grade WSGI server)
instead of Flask's built-in development server. More stable for a live demo
and removes the "this is a development server" warning.

Usage (from the api/ folder):
    python serve.py

Then open the frontend as usual. Models load and warm up at startup, so the
first request may take a little while; subsequent requests are fast.
"""
from waitress import serve

from app import create_app

app = create_app()  # triggers model load + warmup

if __name__ == '__main__':
    host, port = '0.0.0.0', 5000
    print(f'[serve] MediVision API listening on http://{host}:{port} (waitress)')
    # threads=1 keeps the TensorFlow graph state predictable, matching the
    # dev-server configuration (threaded=False) in app.py.
    serve(app, host=host, port=port, threads=1)
