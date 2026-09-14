from dataclasses import dataclass
import math
from typing import Iterable

from .distribution import OutcomeDistribution


PROBABILITY_TOLERANCE = 1e-10


@dataclass(frozen=True, slots=True)
class ProbabilityRange:
    minimum: float
    maximum: float


@dataclass(frozen=True, slots=True)
class OutcomeModelSummary:
    outcomes: OutcomeDistribution
    win_range: ProbabilityRange
    push_range: ProbabilityRange
    loss_range: ProbabilityRange


def summarize_outcomes(
    distributions: Iterable[OutcomeDistribution],
) -> OutcomeModelSummary:
    values = tuple(distributions)
    if not values:
        raise ValueError("at least one outcome distribution is required")
    for distribution in values:
        if not math.isclose(
            distribution.total, 1.0, rel_tol=0.0, abs_tol=PROBABILITY_TOLERANCE
        ):
            raise ValueError("each outcome distribution must have probability mass one")

    count = len(values)
    outcomes = OutcomeDistribution(
        win=math.fsum(value.win for value in values) / count,
        push=math.fsum(value.push for value in values) / count,
        loss=math.fsum(value.loss for value in values) / count,
    )
    if not math.isclose(
        outcomes.total, 1.0, rel_tol=0.0, abs_tol=PROBABILITY_TOLERANCE
    ):
        raise ValueError("summary outcome distribution must have probability mass one")
    return OutcomeModelSummary(
        outcomes=outcomes,
        win_range=ProbabilityRange(
            minimum=min(value.win for value in values),
            maximum=max(value.win for value in values),
        ),
        push_range=ProbabilityRange(
            minimum=min(value.push for value in values),
            maximum=max(value.push for value in values),
        ),
        loss_range=ProbabilityRange(
            minimum=min(value.loss for value in values),
            maximum=max(value.loss for value in values),
        ),
    )
