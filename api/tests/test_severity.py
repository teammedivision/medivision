"""Tests for the severity triage mapping (utils/severity.py)."""
from utils.severity import (
    severity_for, SEVERITY_MAP, NORMAL_SEVERITY, DEFAULT_SEVERITY,
)

VALID_TIERS = {'URGENT', 'MODERATE', 'MILD', 'NORMAL'}


def test_urgent_examples():
    for disease in ['Melanoma', 'Basal Cell Carcinoma', 'Uveitis', 'Actinic Keratosis']:
        tier, recommendation = severity_for(disease)
        assert tier == 'URGENT'
        assert recommendation  # non-empty advice string


def test_normal_is_case_and_whitespace_insensitive():
    assert severity_for('Normal') == NORMAL_SEVERITY
    assert severity_for('normal') == NORMAL_SEVERITY
    assert severity_for('  NORMAL  ') == NORMAL_SEVERITY


def test_known_moderate_and_mild():
    assert severity_for('Cataract')[0] == 'MODERATE'
    assert severity_for('Gingivitis')[0] == 'MILD'


def test_unknown_label_falls_back_to_default():
    assert severity_for('Totally Unknown Disease') == DEFAULT_SEVERITY


def test_every_mapped_disease_has_a_valid_tier():
    for disease in SEVERITY_MAP:
        tier, recommendation = severity_for(disease)
        assert tier in VALID_TIERS
        assert isinstance(recommendation, str) and recommendation
