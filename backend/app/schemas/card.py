from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field

from app.domain import Rank, Suit


class KnownCardSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["known"]
    rank: Rank
    suit: Suit


class UnknownCardSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["unknown"]


ObservedCardSchema: TypeAlias = Annotated[
    KnownCardSchema | UnknownCardSchema,
    Field(discriminator="kind"),
]
