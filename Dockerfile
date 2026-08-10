# MediVision API + frontend, production image.
#
# The four .keras model files (~1.1 GB) are NOT baked into the image - mount
# them at runtime (docker-compose.yml does this for you). This keeps the
# image small and lets you swap models without rebuilding.
#
#   docker compose up --build
#   -> http://localhost:5000
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY api/requirements.txt api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY api api
COPY frontend frontend

# Non-root user (security best practice).
RUN useradd --create-home appuser \
    && mkdir -p /app/api/data /app/logs \
    && chown -R appuser:appuser /app
USER appuser

WORKDIR /app/api
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:5000/api/health')" || exit 1

CMD ["python", "serve.py"]
