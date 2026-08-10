"""Out-of-distribution (OOD) gate.

The domain router was only trained on skin / eye / dental images, so it will
happily assign a random photo (a car, a cat, a landscape) to one of those
three classes. Before running a disease classifier we sanity-check the
router's softmax output:

  * top probability must be >= OOD_MIN_DOMAIN_CONFIDENCE, and
  * normalized entropy must be <= OOD_MAX_ENTROPY.

This is a heuristic, not a guarantee - a dedicated OOD detector (e.g. an
extra "other" class trained on diverse negatives, or Mahalanobis distance on
embeddings) is the roadmap item. See MODEL_CARD.md. Pure-python (no numpy)
so it stays unit-testable without the ML stack installed.
"""
import math


def normalized_entropy(probs):
    """Shannon entropy of a probability list, normalized to [0, 1]."""
    ps = [p for p in probs if p > 0]
    if len(ps) <= 1:
        return 0.0
    h = -sum(p * math.log(p) for p in ps)
    h_max = math.log(len(probs))
    return h / h_max if h_max > 0 else 0.0


def check_out_of_distribution(domain_probs, min_confidence=0.70, max_entropy=0.90):
    """Decide whether an image looks outside the supported domains.

    Args:
        domain_probs: {class_name: probability} from the domain router.
        min_confidence: minimum acceptable top-class probability.
        max_entropy: maximum acceptable normalized entropy.

    Returns:
        (is_ood: bool, reason: str)
    """
    values = list(domain_probs.values())
    if not values:
        return True, 'Domain router returned no probabilities.'

    top = max(values)
    ent = normalized_entropy(values)

    if top < min_confidence:
        return True, (f'Domain confidence {top:.2f} is below the '
                      f'{min_confidence:.2f} threshold.')
    if ent > max_entropy:
        return True, (f'Prediction entropy {ent:.2f} exceeds the '
                      f'{max_entropy:.2f} threshold.')
    return False, ''
