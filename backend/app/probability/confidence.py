from dataclasses import dataclass
import math


_CRITICAL_VALUES = {0.9: 1.645, 0.95: 1.960, 0.99: 2.576}


@dataclass(frozen=True, slots=True)
class WilsonInterval:
    lower: float
    upper: float
    confidence_level: float


def wilson_interval(
    successes: int, trials: int, confidence_level: float
) -> WilsonInterval:
    if isinstance(successes, bool) or not isinstance(successes, int):
        raise TypeError("successes must be an integer")
    if isinstance(trials, bool) or not isinstance(trials, int):
        raise TypeError("trials must be an integer")
    if trials < 1:
        raise ValueError("trials must be positive")
    if not 0 <= successes <= trials:
        raise ValueError("successes must be between zero and trials")
    if confidence_level not in _CRITICAL_VALUES:
        raise ValueError("confidence_level must be 0.9, 0.95, or 0.99")

    z = _CRITICAL_VALUES[confidence_level]
    estimate = successes / trials
    z_squared = z * z
    denominator = 1.0 + z_squared / trials
    center = (estimate + z_squared / (2.0 * trials)) / denominator
    half_width = (
        z
        / denominator
        * math.sqrt(
            estimate * (1.0 - estimate) / trials
            + z_squared / (4.0 * trials * trials)
        )
    )
    return WilsonInterval(
        lower=0.0 if successes == 0 else max(0.0, center - half_width),
        upper=1.0 if successes == trials else min(1.0, center + half_width),
        confidence_level=confidence_level,
    )
