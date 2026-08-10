"""Tests for symptom-based probability refinement (utils/symptoms.py)."""
import pytest

from utils.symptoms import (
    refine_predictions, _match_score, _is_negative, _split_symptoms,
)


def _almost(a, b, eps=1e-6):
    return abs(a - b) < eps


def test_match_score_levels():
    assert _match_score('itchy', 'itchy') == 1.0          # exact
    assert _match_score('very itchy skin', 'itchy') == 0.6  # substring
    assert _match_score('red bumps', 'red patches') == 0.4  # word overlap
    assert _match_score('zzz', 'itchy') == 0.0              # no match


def test_negation_detection():
    assert _is_negative('no symptoms')
    assert _is_negative('not itchy')
    assert _is_negative('without pain')
    assert not _is_negative('itchy and red')


def test_split_symptoms_handles_separators_and_lists():
    assert _split_symptoms('itchy, red; dry\nflaky') == ['itchy', 'red', 'dry', 'flaky']
    assert _split_symptoms(['a', ' b ', '']) == ['a', 'b']


def test_probabilities_renormalise_to_one():
    probs = {'Melanoma': 0.5, 'Eczema': 0.3, 'Normal': 0.2}
    updated, top, conf, _ = refine_predictions(probs, 'dark spot, irregular border', 'skin')
    assert _almost(sum(updated.values()), 1.0)
    assert _almost(updated[top], conf)


def test_matching_symptoms_boost_the_right_class():
    probs = {'Melanoma': 0.34, 'Eczema': 0.33, 'Normal': 0.33}
    updated, top, conf, matches = refine_predictions(
        probs, 'dark spot, irregular border, changing mole', 'skin')
    assert top == 'Melanoma'
    assert 'Melanoma' in matches


def test_empty_symptoms_returns_argmax_unchanged():
    probs = {'Melanoma': 0.6, 'Eczema': 0.4}
    updated, top, conf, matches = refine_predictions(probs, '', 'skin')
    assert top == 'Melanoma'
    assert matches == {}
    assert updated == probs


def test_unknown_domain_raises():
    with pytest.raises(ValueError):
        refine_predictions({'X': 1.0}, 'itchy', 'bones')


def test_probabilities_stay_valid_with_many_matches():
    probs = {'Eczema': 0.4, 'Normal': 0.6}
    updated, top, conf, _ = refine_predictions(
        probs, 'itchy, dry skin, red patches, cracked skin, scaling', 'skin')
    assert all(0.0 <= v <= 1.0 for v in updated.values())
    assert _almost(sum(updated.values()), 1.0)
