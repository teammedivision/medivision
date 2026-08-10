# MediVision — Google Cloud Run image (self-contained).
#
# Fetches the app code from GitHub and the four ResNet50 model files from a
# GitHub Release at BUILD time, so you can deploy straight from Cloud Shell:
#
#   gcloud run deploy medivision --source deploy/cloudrun --region us-central1 \
#     --memory 4Gi --cpu 2 --cpu-boost --timeout 900 --max-instances 2 \
#     --allow-unauthenticated
#
# See CLOUDRUN_DEPLOY.md for the full walkthrough.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MEDIVISION_REPO=https://github.com/teammedivision/medivision.git \
    MODEL_BASE=https://github.com/teammedivision/medivision/releases/download/models-v1

RUN apt-get update \
    && apt-get install -y --no-install-recommends git wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Application code (public repo).
RUN git clone --depth 1 "$MEDIVISION_REPO" /app

# 2. Python dependencies.
RUN pip install --no-cache-dir -r api/requirements.txt

# 3. Model weights into the repo root where loader.py looks for them.
RUN for f in domain_resnet50.keras skin_disease_resnet50.keras \
             eye_disease_resnet50.keras teeth_disease_resnet50.keras; do \
      echo "[build] downloading $f" ; \
      wget -q "$MODEL_BASE/$f" -O "/app/$f" || exit 1 ; \
      test -s "/app/$f" || { echo "[build] $f is empty" ; exit 1 ; } ; \
    done

RUN mkdir -p /app/api/data /app/logs

# Cloud Run injects $PORT (default 8080); serve.py reads it automatically.
ENV PORT=8080
EXPOSE 8080
WORKDIR /app/api
CMD ["python", "serve.py"]
