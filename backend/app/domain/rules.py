from dataclasses import dataclass
from enum import Enum


class DealerSoft17(str, Enum):
    HIT = "hit"
    STAND = "stand"


class SurrenderRule(str, Enum):
    NONE = "none"
    LATE = "late"


class DealerSecondCardRule(str, Enum):
    HOLE_CARD = "hole_card"
    NO_HOLE_CARD = "no_hole_card"


class DealerBlackjackCheckRule(str, Enum):
    PEEK = "peek"
    NO_PEEK = "no_peek"


@dataclass(frozen=True, slots=True)
class Rules:
    decks: int
    dealer_soft_17: DealerSoft17
    splitting_enabled: bool = True
    max_split_hands: int = 4
    resplit_aces: bool = False
    hit_split_aces: bool = False
    blackjack_after_split: bool = False
    doubling_enabled: bool = True
    double_after_split: bool = True
    surrender: SurrenderRule = SurrenderRule.NONE
    dealer_second_card: DealerSecondCardRule = DealerSecondCardRule.HOLE_CARD
    dealer_blackjack_check: DealerBlackjackCheckRule = (
        DealerBlackjackCheckRule.NO_PEEK
    )

    def __post_init__(self) -> None:
        if isinstance(self.decks, bool) or not isinstance(self.decks, int):
            raise TypeError("decks must be an integer")
        if not 1 <= self.decks <= 8:
            raise ValueError("decks must be between 1 and 8")
        if not isinstance(self.dealer_soft_17, DealerSoft17):
            raise TypeError("dealer_soft_17 must be a DealerSoft17 value")
        boolean_fields = (
            "splitting_enabled",
            "resplit_aces",
            "hit_split_aces",
            "blackjack_after_split",
            "doubling_enabled",
            "double_after_split",
        )
        for field_name in boolean_fields:
            if not isinstance(getattr(self, field_name), bool):
                raise TypeError(f"{field_name} must be a boolean")
        if isinstance(self.max_split_hands, bool) or not isinstance(
            self.max_split_hands, int
        ):
            raise TypeError("max_split_hands must be an integer")
        if not 1 <= self.max_split_hands <= 4:
            raise ValueError("max_split_hands must be between 1 and 4")
        if self.splitting_enabled and self.max_split_hands < 2:
            raise ValueError(
                "max_split_hands must be at least 2 when splitting is enabled"
            )
        if not isinstance(self.surrender, SurrenderRule):
            raise TypeError("surrender must be a SurrenderRule value")
        if not isinstance(self.dealer_second_card, DealerSecondCardRule):
            raise TypeError(
                "dealer_second_card must be a DealerSecondCardRule value"
            )
        if not isinstance(
            self.dealer_blackjack_check, DealerBlackjackCheckRule
        ):
            raise TypeError(
                "dealer_blackjack_check must be a DealerBlackjackCheckRule value"
            )
        if (
            self.dealer_second_card is DealerSecondCardRule.NO_HOLE_CARD
            and self.dealer_blackjack_check is DealerBlackjackCheckRule.PEEK
        ):
            raise ValueError("no-hole-card rules cannot enable dealer peek")
