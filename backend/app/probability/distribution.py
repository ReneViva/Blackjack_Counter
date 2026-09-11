from collections.abc import Iterable
from dataclasses import dataclass
import math

from app.domain import Outcome


@dataclass(frozen=True, slots=True)
class OutcomeDistribution:
    win: float = 0.0
    push: float = 0.0
    loss: float = 0.0

    def __post_init__(self) -> None:
        values = (self.win, self.push, self.loss)
        if any(not math.isfinite(value) for value in values):
            raise ValueError("probabilities must be finite")
        if any(value < 0.0 or value > 1.0 for value in values):
            raise ValueError("probabilities must be between zero and one")

    @property
    def total(self) -> float:
        return self.win + self.push + self.loss

    @classmethod
    def terminal(cls, outcome: Outcome) -> "OutcomeDistribution":
        if outcome is Outcome.WIN:
            return cls(win=1.0)
        if outcome is Outcome.PUSH:
            return cls(push=1.0)
        return cls(loss=1.0)

    def scaled(self, weight: float) -> "OutcomeDistribution":
        if not math.isfinite(weight) or not 0.0 <= weight <= 1.0:
            raise ValueError("branch weight must be between zero and one")
        return OutcomeDistribution(
            win=self.win * weight,
            push=self.push * weight,
            loss=self.loss * weight,
        )


def weighted_sum(
    branches: Iterable[tuple[float, OutcomeDistribution]],
) -> OutcomeDistribution:
    wins: list[float] = []
    pushes: list[float] = []
    losses: list[float] = []
    for weight, branch in branches:
        weighted = branch.scaled(weight)
        wins.append(weighted.win)
        pushes.append(weighted.push)
        losses.append(weighted.loss)
    return OutcomeDistribution(
        win=math.fsum(wins),
        push=math.fsum(pushes),
        loss=math.fsum(losses),
    )
