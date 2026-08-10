"""Symptom-based probability refinement.

Lifted verbatim from MediVision.ipynb Block 5 (SYMPTOM_MAP_* dictionaries),
re-implemented around the spec contract:

  * Negation token detection (no/not/without/none/absent)
  * Weighted keyword matching (exact=1.0, substring=0.6, word overlap=0.4)
  * Probability boost capped at +0.15 per class
  * Renormalised so probabilities sum to 1.0
"""
import re

# Trained skin model has 11 classes (see api/models/loader.py SKIN_CLASSES).
# Acne / Actinic Keratosis / Urticaria / Vitiligo are NOT in the trained model
# and are intentionally absent here - keeping them would just be dead lookup
# entries that never match anything the model actually outputs.
SYMPTOM_MAP_SKIN = {
    'Atopic Dermatitis':   ['eczema', 'itchy patches', 'dry rash', 'red flaky'],
    'Basal Cell Carcinoma':['pearly bump', 'waxy lesion', 'non healing wound'],
    'Benign Keratosis':    ['waxy growth', 'stuck on lesion', 'tan growth'],
    'Eczema':              ['itchy', 'dry skin', 'red patches', 'cracked skin', 'scaling'],
    'Melanocytic Nevus':   ['mole', 'brown spot', 'round lesion', 'pigmented spot'],
    'Melanoma':            ['dark spot', 'irregular border', 'changing mole', 'asymmetric',
                            'black lesion', 'bleeding mole'],
    'Normal':              ['healthy skin', 'no symptoms', 'no rash', 'clear skin'],
    'Psoriasis':           ['silver scales', 'red plaques', 'thick patches', 'flaky skin'],
    'Seborrheic Keratosis':['waxy growth', 'stuck on lesion', 'age spot', 'warty growth'],
    'Tinea':               ['ring shaped', 'fungal', 'itchy ring', 'circular rash'],
    'Warts':               ['rough bump', 'cauliflower lesion', 'flesh coloured growth'],
}

SYMPTOM_MAP_EYE = {
    'Cataract':        ['cloudy vision', 'glare sensitivity', 'faded colours',
                        'dim sight', 'foggy vision'],
    'Conjunctivitis':  ['red eye', 'discharge', 'itchy eyes', 'pink eye',
                        'watery eye', 'crusty eyelid'],
    'Dry Eye':         ['dry eyes', 'burning sensation', 'tired eyes',
                        'gritty feeling', 'sandy eyes', 'stinging'],
    'Eyelid Drooping': ['drooping eyelid', 'ptosis', 'sagging lid',
                        'asymmetric eyes', 'heavy eyelid'],
    'Normal':          ['no symptoms', 'clear vision', 'healthy eye', 'normal sight'],
    'Uveitis':         ['eye pain', 'light sensitivity', 'blurred vision',
                        'redness', 'floaters'],
}

SYMPTOM_MAP_TEETH = {
    'Caries':       ['toothache', 'sensitivity', 'visible hole', 'pain when eating',
                     'sweet pain', 'dark spot tooth'],
    'Calculus':     ['tartar buildup', 'yellow deposits', 'gum inflammation', 'plaque'],
    'Gingivitis':   ['bleeding gums', 'swollen gums', 'red gums', 'tender gums', 'bad breath'],
    'Discoloration':['stained tooth', 'yellow tooth', 'brown spot tooth', 'discoloured'],
    'Mouth Ulcer':  ['sore in mouth', 'white ulcer', 'painful spot', 'canker sore'],
    'Hypodontia':   ['missing tooth', 'gap in teeth', 'absent tooth'],
    'Normal':       ['healthy teeth', 'no toothache', 'no symptoms', 'clean teeth'],
}

SYMPTOM_MAPS = {
    'skin':  SYMPTOM_MAP_SKIN,
    'eye':   SYMPTOM_MAP_EYE,
    'teeth': SYMPTOM_MAP_TEETH,
}

NEGATION_TOKENS = {'no', 'not', 'without', 'none', 'absent'}

BOOST_STEP = 0.06     # multiplier applied to summed match score
BOOST_CAP  = 0.15     # spec: cap at +0.15 per class
NEG_PENALTY = 0.10    # subtract this from non-Normal classes when user negates


def _normalise(s):
    return re.sub(r'[^a-z0-9 ]+', ' ', s.lower().strip())


def _is_negative(s):
    norm = _normalise(s)
    toks = norm.split()
    return bool(toks) and (toks[0] in NEGATION_TOKENS or 'no symptoms' in norm)


def _match_score(symptom, keyword):
    """exact=1.0, substring=0.6, word-overlap=0.4, otherwise 0.0."""
    s = _normalise(symptom)
    k = _normalise(keyword)
    if not s or not k:
        return 0.0
    if s == k:
        return 1.0
    if k in s or s in k:
        return 0.6
    if set(s.split()) & set(k.split()):
        return 0.4
    return 0.0


def _split_symptoms(raw):
    """Accepts a string (comma/semicolon/newline separated) or a list."""
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    parts = re.split(r'[,;\n]+', str(raw))
    return [p.strip() for p in parts if p.strip()]


def refine_predictions(disease_probs, user_symptoms, domain):
    """Adjust class probabilities using user-described symptoms.

    Args:
        disease_probs: {class_name: probability} from the model.
        user_symptoms: raw string from the textarea, OR a list of phrases.
        domain: 'skin' | 'eye' | 'teeth'.

    Returns:
        (updated_probs, top_disease, adjusted_confidence, symptom_matches)
        where symptom_matches maps class_name -> [matched user phrases].
    """
    if domain not in SYMPTOM_MAPS:
        raise ValueError(f'Unknown domain: {domain!r}')

    symptoms = _split_symptoms(user_symptoms)
    if not symptoms:
        top = max(disease_probs, key=disease_probs.get)
        return disease_probs, top, float(disease_probs[top]), {}

    smap = SYMPTOM_MAPS[domain]
    user_negated = any(_is_negative(s) for s in symptoms)

    updated = {}
    matches = {}
    for disease, prob in disease_probs.items():
        score = 0.0
        matched_phrases = []
        for sym in symptoms:
            if _is_negative(sym):
                continue
            for kw in smap.get(disease, []):
                ms = _match_score(sym, kw)
                if ms > 0:
                    score += ms
                    if sym not in matched_phrases:
                        matched_phrases.append(sym)
                    break  # one match per user phrase per disease
        boost = min(score * BOOST_STEP, BOOST_CAP)
        if user_negated and disease.lower() != 'normal':
            boost = -NEG_PENALTY
        updated[disease] = max(prob + boost, 0.0)
        if matched_phrases:
            matches[disease] = matched_phrases

    total = sum(updated.values())
    if total > 0:
        updated = {d: v / total for d, v in updated.items()}

    top = max(updated, key=updated.get)
    return updated, top, float(updated[top]), matches
