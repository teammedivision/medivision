"""Model loader. Loads all 4 Keras models once at startup."""
import os
import io
import numpy as np
from PIL import Image
import tensorflow as tf
from tensorflow.keras.applications.resnet50 import preprocess_input

DOMAIN_CLASSES = ['eye', 'skin', 'teeth']

# IMPORTANT: order must match the alphabetical training order from the notebook
# (Block 1.12: `skin_classes = sorted(df_skin_train['label'].unique())`).
# The trained skin model has 11 output units - not 14. Classes like Acne,
# Actinic Keratosis, Urticaria, and Vitiligo were NOT in the training set.
SKIN_CLASSES = [
    'Atopic Dermatitis',
    'Basal Cell Carcinoma',
    'Benign Keratosis',
    'Eczema',
    'Melanocytic Nevus',
    'Melanoma',
    'Normal',
    'Psoriasis',
    'Seborrheic Keratosis',
    'Tinea',
    'Warts',
]

EYE_CLASSES = [
    'Cataract', 'Conjunctivitis', 'Dry Eye', 'Eyelid Drooping', 'Normal', 'Uveitis'
]

TEETH_CLASSES = [
    'Calculus', 'Caries', 'Discoloration', 'Gingivitis',
    'Hypodontia', 'Mouth Ulcer', 'Normal'
]

INPUT_SIZES = {
    'domain': 224,
    'skin':   224,
    'eye':    384,
    'teeth':  224,
}

CLASS_LISTS = {
    'domain': DOMAIN_CLASSES,
    'skin':   SKIN_CLASSES,
    'eye':    EYE_CLASSES,
    'teeth':  TEETH_CLASSES,
}

# Module-level cache - populated once at startup, never reloaded per request.
MODELS = {}


def _model_path(name):
    """Resolve a .keras file by walking up from this file until found.
    Keeps the loader robust against being run from different cwds."""
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.normpath(os.path.join(here, '..', '..', name)),
        os.path.normpath(os.path.join(here, '..', name)),
        os.path.abspath(name),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    raise FileNotFoundError(
        f"Could not find {name!r}. Searched: {candidates}"
    )


def load_all_models():
    """Load all 4 models once. Safe to call multiple times - idempotent."""
    if MODELS:
        return MODELS
    files = {
        'domain': 'domain_resnet50.keras',
        'skin':   'skin_disease_resnet50.keras',
        'eye':    'eye_disease_resnet50.keras',
        'teeth':  'teeth_disease_resnet50.keras',
    }
    for key, fname in files.items():
        path = _model_path(fname)
        print(f'[loader] Loading {key} <- {path}')
        MODELS[key] = tf.keras.models.load_model(path, compile=False)

    # Sanity-check: each model's final output dim must match its class list.
    # Catches "I retrained with different classes" bugs immediately.
    for key, model in MODELS.items():
        expected = len(CLASS_LISTS[key])
        actual = int(model.output_shape[-1])
        if actual != expected:
            raise RuntimeError(
                f"[loader] Class-count mismatch for {key!r}: model outputs "
                f"{actual} classes but CLASS_LISTS has {expected}. "
                f"Update the class list in loader.py to match the trained model."
            )
        print(f'[loader]   {key:6s} ok: {actual} classes')

    print(f'[loader] All {len(MODELS)} models loaded.')
    return MODELS


def warmup_models():
    """Run one dummy inference per model so TensorFlow builds its execution
    graph before the first real request. Without this, the first prediction
    of a session is noticeably slow - an awkward pause during a live demo.
    Failures here are non-fatal: the model still works, just not pre-warmed.
    """
    for key, model in MODELS.items():
        size = INPUT_SIZES[key]
        dummy = np.zeros((1, size, size, 3), dtype=np.float32)
        try:
            model.predict(dummy, verbose=0)
            print(f'[loader]   {key:6s} warmed up')
        except Exception as e:
            print(f'[loader] Warmup failed for {key!r}: {e}')
    print('[loader] Warmup complete.')


def preprocess_image(image_bytes, target_size):
    """Decode raw bytes from upload, resize, and apply ResNet50 preprocessing.

    Returns:
        (raw_uint8, batch_array): raw_uint8 is HxWx3 uint8 for Grad-CAM overlay,
                                  batch_array is 1xHxWx3 float32 for the model.
    """
    pil = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    pil = pil.resize((target_size, target_size))
    raw_uint8 = np.array(pil, dtype=np.uint8)
    arr = preprocess_input(np.array(pil, dtype=np.float32))
    return raw_uint8, np.expand_dims(arr, axis=0)


def predict_domain(image_bytes):
    """Run the domain classifier. Returns (domain_name, confidence, all_probs_dict)."""
    _, batch = preprocess_image(image_bytes, INPUT_SIZES['domain'])
    probs = MODELS['domain'].predict(batch, verbose=0)[0]
    idx = int(np.argmax(probs))
    return DOMAIN_CLASSES[idx], float(probs[idx]), {
        c: float(p) for c, p in zip(DOMAIN_CLASSES, probs)
    }


def predict_disease(image_bytes, domain):
    """Run the disease classifier for the given domain.

    Returns (raw_uint8, batch_array, probs_dict, top_class, top_conf).
    raw_uint8 and batch_array are returned so Grad-CAM can reuse them without
    re-decoding the bytes.
    """
    size = INPUT_SIZES[domain]
    raw_uint8, batch = preprocess_image(image_bytes, size)
    probs = MODELS[domain].predict(batch, verbose=0)[0]
    classes = CLASS_LISTS[domain]
    idx = int(np.argmax(probs))
    probs_dict = {c: float(p) for c, p in zip(classes, probs)}
    return raw_uint8, batch, probs_dict, classes[idx], float(probs[idx])
