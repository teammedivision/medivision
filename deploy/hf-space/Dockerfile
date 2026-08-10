# MediVision — Hugging Face Space (Docker) image.
#
# This is a SELF-CONTAINED Dockerfile: it fetches the application code from
# GitHub and the four ResNet50 model files from a GitHub Release at BUILD time,
# so the Hugging Face Space repo only needs this file + README.md.
#
# To redeploy after pushing new code to GitHub: open the Space, then
# Settings -> "Factory rebuild".
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    MEDIVISION_REPO=https://github.com/teammedivision/medivision.git \
    MODEL_BASE=https://github.com/teammedivision/medivision/releases/download/models-v1

# git to clone the code, wget to download the model files.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face runs the container as UID 1000 — create a matching user.
RUN useradd -m -u 1000 appuser
WORKDIR /app

# 1. Application code (public repo — no auth needed).
RUN git clone --depth 1 "$MEDIVISION_REPO" /app

# 2. Python dependencies.
RUN pip install --no-cache-dir -r api/requirements.txt

# 3. Model weights, downloaded into the repo root where loader.py expects them.
#    Each is 200–300 MB; the build fails fast if any download is incomplete.
RUN for f in domain_resnet50.keras skin_disease_resnet50.keras \
             eye_disease_resnet50.keras teeth_disease_resnet50.keras; do \
      echo "[build] downloading $f" ; \
      wget -q "$MODEL_BASE/$f" -O "/app/$f" || exit 1 ; \
      test -s "/app/$f" || { echo "[build] $f is empty" ; exit 1 ; } ; \
    done

# 4. Writable dirs (SQLite DB + logs) and correct ownership.
RUN mkdir -p /app/api/data /app/logs && chown -R appuser:appuser /app
USER appuser

EXPOSE 7860
WORKDIR /app/api
CMD ["python", "serve.py"]
