from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StrictInt

from app.domain import DealerSoft17


KnownDeckCount = Annotated[StrictInt, Field(ge=1, le=8)]


class RulesSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decks: KnownDeckCount | None
    dealer_soft_17: DealerSoft17
