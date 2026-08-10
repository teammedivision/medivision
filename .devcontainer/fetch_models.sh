#!/usr/bin/env bash
# Downloads the 4 .keras model files from a GitHub Release attached to this
# repo, since they're too large (200-300MB each) for a normal git push and
# are excluded from the repo via .gitignore. Runs automatically as part of
# devcontainer.json's postCreateCommand when a Codespace is created.
set -euo pipefail
cd "$(dirname "$0")/.."

MODELS=(domain_resnet50.keras eye_disease_resnet50.keras skin_disease_resnet50.keras teeth_disease_resnet50.keras)

missing=0
for m in "${MODELS[@]}"; do
  [ -f "$m" ] || missing=1
done
if [ "$missing" -eq 0 ]; then
  echo "[fetch_models] All 4 model files already present. Skipping download."
  exit 0
fi

if [ -z "${MODEL_RELEASE_TAG:-}" ]; then
  echo "[fetch_models] MODEL_RELEASE_TAG is not set - nothing to download."
  echo "  Create a GitHub Release (see README.md) holding the 4 .keras"
  echo "  files, set its tag as MODEL_RELEASE_TAG in .devcontainer/devcontainer.json,"
  echo "  then rebuild the container."
  exit 0
fi

echo "[fetch_models] Downloading model files from release '${MODEL_RELEASE_TAG}'..."
gh release download "${MODEL_RELEASE_TAG}" --pattern "*.keras" --dir . --clobber
echo "[fetch_models] Done."
