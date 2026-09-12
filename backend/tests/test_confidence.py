import math

import pytest

from app.probability import wilson_interval


@pytest.mark.parametrize("level", [0.9, 0.95, 0.99])
def test_supported_confidence_levels_are_valid(level: float) -> None:
    interval = wilson_interval(50, 100, level)

    assert 0.0 <= interval.lower <= 0.5 <= interval.upper <= 1.0
    assert interval.confidence_level == level


def test_known_midpoint_formula_value() -> None:
    interval = wilson_interval(50, 100, 0.95)

    assert math.isclose(interval.lower, 0.40382982859014716)
    assert math.isclose(interval.upper, 0.5961701714098528)


def test_zero_and_full_successes_have_bounded_intervals() -> None:
    zero = wilson_interval(0, 10, 0.95)
    full = wilson_interval(10, 10, 0.95)

    assert zero.lower == 0.0
    assert 0.0 < zero.upper < 1.0
    assert 0.0 < full.lower < 1.0
    assert full.upper == 1.0


def test_higher_confidence_is_not_narrower() -> None:
    low = wilson_interval(40, 100, 0.9)
    high = wilson_interval(40, 100, 0.99)

    assert high.upper - high.lower >= low.upper - low.lower


def test_larger_sample_is_narrower_for_same_proportion() -> None:
    small = wilson_interval(40, 100, 0.95)
    large = wilson_interval(400, 1000, 0.95)

    assert large.upper - large.lower < small.upper - small.lower


@pytest.mark.parametrize("level", [0.0, 0.8, 0.94, 1.0])
def test_unsupported_confidence_level_is_rejected(level: float) -> None:
    with pytest.raises(ValueError):
        wilson_interval(5, 10, level)


@pytest.mark.parametrize("successes,trials", [(-1, 10), (11, 10), (0, 0)])
def test_invalid_counts_are_rejected(successes: int, trials: int) -> None:
    with pytest.raises(ValueError):
        wilson_interval(successes, trials, 0.95)
