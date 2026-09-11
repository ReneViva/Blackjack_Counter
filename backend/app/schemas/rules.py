from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    model_validator,
)

from app.domain import (
    DealerBlackjackCheckRule,
    DealerSecondCardRule,
    DealerSoft17,
    SurrenderRule,
)


KnownDeckCount = Annotated[StrictInt, Field(ge=1, le=8)]


class RulesSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decks: KnownDeckCount | None
    dealer_soft_17: DealerSoft17
    splitting_enabled: StrictBool = True
    max_split_hands: Annotated[StrictInt, Field(ge=1, le=4)] = 4
    resplit_aces: StrictBool = False
    hit_split_aces: StrictBool = False
    blackjack_after_split: StrictBool = False
    doubling_enabled: StrictBool = True
    double_after_split: StrictBool = True
    surrender: SurrenderRule = SurrenderRule.NONE
    dealer_second_card: DealerSecondCardRule = DealerSecondCardRule.HOLE_CARD
    dealer_blackjack_check: DealerBlackjackCheckRule = (
        DealerBlackjackCheckRule.NO_PEEK
    )

    @model_validator(mode="after")
    def enforce_rule_combinations(self) -> "RulesSchema":
        if self.splitting_enabled and self.max_split_hands < 2:
            raise ValueError(
                "max_split_hands must be at least 2 when splitting is enabled"
            )
        if (
            self.dealer_second_card is DealerSecondCardRule.NO_HOLE_CARD
            and self.dealer_blackjack_check is DealerBlackjackCheckRule.PEEK
        ):
            raise ValueError("no-hole-card rules cannot enable dealer peek")
        return self
