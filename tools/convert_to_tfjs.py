#!/usr/bin/env python3
"""
Convert the Keras .keras models to TensorFlow.js format for in-browser inference.

Run this in a GitHub Codespace (where Python, TensorFlow, and the model files are
available via .devcontainer/fetch_models.sh) — it keeps the whole pipeline inside
GitHub, no other service required.

    pip install tensorflowjs
    python tools/convert_to_tfjs.py --model domain          # proof of concept
    python tools/convert_to_tfjs.py --model all             # everything

Output goes to frontend/models/<name>/ as model.json + *.bin weight shards, which
GitHub Pages then serves as static files. float16 quantization roughly halves the
download with negligible accuracy change; pass --uint8 to halve it again if a later
accuracy check says the loss is acceptable.
"""
import argparse
import os
import sys

# The four models and the .keras filenames fetch_models.sh downloads.
MODEL_FILES = {
    'domain': 'domain_resnet50.keras',
    'skin':   'skin_disease_resnet50.keras',
    'eye':    'eye_disease_resnet50.keras',
    'teeth':  'teeth_disease_resnet50.keras',
}

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_ROOT = os.path.join(REPO_ROOT, 'frontend', 'models')


def convert_one(name, quant):
    import tensorflow as tf
    import tensorflowjs as tfjs

    src = os.path.join(REPO_ROOT, MODEL_FILES[name])
    if not os.path.exists(src):
        sys.exit(
            f"ERROR: {MODEL_FILES[name]} not found at repo root.\n"
            f"In a Codespace, set MODEL_RELEASE_TAG in .devcontainer/devcontainer.json\n"
            f"and run .devcontainer/fetch_models.sh first (see README.md)."
        )

    out_dir = os.path.join(OUT_ROOT, name)
    os.makedirs(out_dir, exist_ok=True)

    print(f"[convert] {name}: loading {MODEL_FILES[name]} ...")
    model = tf.keras.models.load_model(src, compile=False)

    # float16 keeps accuracy essentially intact; uint8 is smaller but must be
    # validated against the held-out test set before trusting it clinically.
    quant_map = {'float16': '*'} if quant == 'float16' else \
                {'uint8': '*'}   if quant == 'uint8'   else None

    print(f"[convert] {name}: writing TensorFlow.js model ({quant}) -> {out_dir}")
    tfjs.converters.save_keras_model(model, out_dir, quantization_dtype_map=quant_map)

    total = sum(
        os.path.getsize(os.path.join(out_dir, f))
        for f in os.listdir(out_dir)
    )
    print(f"[convert] {name}: done — {total / 1e6:.1f} MB across "
          f"{len(os.listdir(out_dir))} files\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='domain',
                    choices=list(MODEL_FILES) + ['all'],
                    help="which model to convert (default: domain)")
    ap.add_argument('--uint8', action='store_true',
                    help="uint8 quantization (smaller, needs accuracy check)")
    ap.add_argument('--no-quant', action='store_true',
                    help="no quantization (largest, exact weights)")
    args = ap.parse_args()

    quant = 'uint8' if args.uint8 else 'none' if args.no_quant else 'float16'
    targets = list(MODEL_FILES) if args.model == 'all' else [args.model]

    for name in targets:
        convert_one(name, quant)

    print("[convert] All done. Commit frontend/models/ and push — Pages will serve it.")


if __name__ == '__main__':
    main()
