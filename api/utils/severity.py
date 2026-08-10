"""Severity triage mapping.

Maps a predicted disease label to a (tier, recommendation) pair. Kept in its
own module (rather than inline in app.py) so it can be unit-tested without
importing app.py, which would trigger model loading.

Tiers: URGENT > MODERATE > MILD > NORMAL.
"""

SEVERITY_MAP = {
    # URGENT
    'Melanoma':              ('URGENT', 'Consult a dermatologist immediately.'),
    'Basal Cell Carcinoma':  ('URGENT', 'Consult a dermatologist immediately.'),
    'Actinic Keratosis':     ('URGENT', 'Schedule a dermatology review soon.'),
    'Uveitis':               ('URGENT', 'Seek ophthalmology care promptly.'),
    # MODERATE
    'Dry Eye':               ('MODERATE', 'See an eye specialist for treatment options.'),
    'Cataract':              ('MODERATE', 'Schedule an ophthalmology consultation.'),
    'Eyelid Drooping':       ('MODERATE', 'Consult an ophthalmologist.'),
    'Caries':                ('MODERATE', 'See a dentist soon to prevent progression.'),
    'Calculus':              ('MODERATE', 'Professional dental cleaning recommended.'),
    'Hypodontia':            ('MODERATE', 'Consult a dental specialist.'),
    'Psoriasis':             ('MODERATE', 'Consider a dermatology consultation for management.'),
    'Atopic Dermatitis':     ('MODERATE', 'See a dermatologist for treatment options.'),
    'Eczema':                ('MODERATE', 'Consult a doctor if symptoms persist.'),
    'Tinea':                 ('MODERATE', 'See a doctor for antifungal treatment.'),
    # MILD
    'Conjunctivitis':        ('MILD', 'Monitor symptoms; see a GP if persistent.'),
    'Gingivitis':            ('MILD', 'Improve oral hygiene; see a dentist if worsening.'),
    'Mouth Ulcer':           ('MILD', 'Monitor; see a GP if lasting more than 2 weeks.'),
    'Discoloration':         ('MILD', 'Consult a dentist for cosmetic evaluation.'),
    'Acne':                  ('MILD', 'Maintain skincare routine; consult a dermatologist if severe.'),
    'Melanocytic Nevus':     ('MILD', 'Generally benign; monitor for changes.'),
    'Benign Keratosis':      ('MILD', 'Benign growth; no treatment required.'),
    'Seborrheic Keratosis':  ('MILD', 'Harmless age-related growth; removal is cosmetic.'),
    'Warts':                 ('MILD', 'Usually harmless; OTC treatments available.'),
    'Urticaria':             ('MILD', 'Identify triggers; see a doctor if persistent.'),
    'Vitiligo':              ('MILD', 'Cosmetic condition; consult a dermatologist for options.'),
}

NORMAL_SEVERITY = ('NORMAL', 'No significant findings. Maintain regular check-ups.')

# Fallback for any label not explicitly mapped.
DEFAULT_SEVERITY = ('MILD', 'Consult a healthcare professional for evaluation.')


def severity_for(disease):
    """Return (tier, recommendation) for a predicted disease label."""
    if disease is not None and disease.strip().lower() == 'normal':
        return NORMAL_SEVERITY
    return SEVERITY_MAP.get(disease, DEFAULT_SEVERITY)
