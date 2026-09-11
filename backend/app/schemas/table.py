from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt

from .card import ObservedCardSchema
from .rules import RulesSchema


SeatNumber = Annotated[StrictInt, Field(ge=1, le=7)]


class HandSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cards: list[ObservedCardSchema] = Field(default_factory=list)


class PlayerHandSchema(HandSchema):
    seat: SeatNumber
    is_user: StrictBool = False


class TableStateSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rules: RulesSchema
    dealer: HandSchema
    players: list[PlayerHandSchema] = Field(default_factory=list)
    discarded_cards: list[ObservedCardSchema] = Field(default_factory=list)
