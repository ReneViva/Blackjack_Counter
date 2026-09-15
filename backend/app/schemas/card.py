from typing import Annotated, Literal, TypeAlias, cast

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from app.domain import (
    BlackjackValueClass,
    Card,
    CardObservation,
    Rank,
    Suit,
    UnknownCard,
    ValueOnlyCard,
)


class KnownCardSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["known"]
    rank: Rank
    suit: Suit


class ValueOnlyCardSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["value"]
    value: BlackjackValueClass


class UnknownCardSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["unknown"]


CardObservationSchema: TypeAlias = Annotated[
    KnownCardSchema | ValueOnlyCardSchema | UnknownCardSchema,
    Field(discriminator="kind"),
]
ObservedCardSchema: TypeAlias = CardObservationSchema

_CARD_OBSERVATION_ADAPTER = TypeAdapter(CardObservationSchema)


def parse_card_observation(value: object) -> CardObservation:
    """Validate transport data and return the corresponding domain observation."""

    observation = _CARD_OBSERVATION_ADAPTER.validate_python(value)
    if isinstance(observation, KnownCardSchema):
        return Card(rank=observation.rank, suit=observation.suit)
    if isinstance(observation, ValueOnlyCardSchema):
        return ValueOnlyCard(value=observation.value)
    return UnknownCard()


def serialize_card_observation(observation: CardObservation) -> dict[str, str]:
    """Serialize one typed observation without adding missing card identity."""

    schema: KnownCardSchema | ValueOnlyCardSchema | UnknownCardSchema
    if isinstance(observation, Card):
        schema = KnownCardSchema(
            kind="known",
            rank=observation.rank,
            suit=observation.suit,
        )
    elif isinstance(observation, ValueOnlyCard):
        schema = ValueOnlyCardSchema(kind="value", value=observation.value)
    elif isinstance(observation, UnknownCard):
        schema = UnknownCardSchema(kind="unknown")
    else:
        raise TypeError("observation must be a CardObservation")

    return cast(
        dict[str, str],
        _CARD_OBSERVATION_ADAPTER.dump_python(schema, mode="json"),
    )
