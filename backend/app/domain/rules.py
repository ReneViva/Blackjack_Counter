from dataclasses import dataclass
from enum import Enum


class DealerSoft17(str, Enum):
    HIT = "hit"
    STAND = "stand"


@dataclass(frozen=True, slots=True)
class Rules:
    decks: int
    dealer_soft_17: DealerSoft17

    def __post_init__(self) -> None:
        if isinstance(self.decks, bool) or not isinstance(self.decks, int):
            raise TypeError("decks must be an integer")
        if not 1 <= self.decks <= 8:
            raise ValueError("decks must be between 1 and 8")
        if not isinstance(self.dealer_soft_17, DealerSoft17):
            raise TypeError("dealer_soft_17 must be a DealerSoft17 value")
