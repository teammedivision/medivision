"""Tests for the out-of-distribution gate (utils/ood.py)."""
from utils.ood import check_out_of_distribution, normalized_entropy


def test_confident_prediction_passes():
    probs = {'skin': 0.95, 'eye': 0.03, 'teeth': 0.02}
    is_ood, reason = check_out_of_distribution(probs)
    assert not is_ood
    assert reason == ''


def test_uniform_prediction_is_rejected():
    probs = {'skin': 1 / 3, 'eye': 1 / 3, 'teeth': 1 / 3}
    is_ood, reason = check_out_of_distribution(probs)
    assert is_ood
    assert reason


def test_low_confidence_is_rejected():
    probs = {'skin': 0.5, 'eye': 0.3, 'teeth': 0.2}
    is_ood, _ = check_out_of_distribution(probs, min_confidence=0.70)
    assert is_ood


def test_threshold_is_configurable():
    probs = {'skin': 0.6, 'eye': 0.25, 'teeth': 0.15}
    assert check_out_of_distribution(probs, min_confidence=0.55, max_entropy=0.99)[0] is False
    assert check_out_of_distribution(probs, min_confidence=0.75)[0] is True


def test_empty_probs_rejected():
    assert check_out_of_distribution({})[0] is True


def test_normalized_entropy_bounds():
    assert normalized_entropy([1.0, 0.0, 0.0]) == 0.0
    uniform = normalized_entropy([1 / 3, 1 / 3, 1 / 3])
    assert abs(uniform - 1.0) < 1e-9
    mid = normalized_entropy([0.8, 0.15, 0.05])
    assert 0.0 < mid < 1.0
