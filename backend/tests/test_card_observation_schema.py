import pytest
from pydantic import ValidationError

from app.domain import (
    BlackjackValueClass,
    Card,
    Rank,
    Suit,
    UnknownCard,
    ValueOnlyCard,
)
from app.schemas import (
    TableStateSchema,
    parse_card_observation,
    serialize_card_observation,
)


@pytest.mark.parametrize(
    "value",
    ("A", "2", "3", "4", "5", "6", "7", "8", "9", "10"),
)
def test_value_only_observation_accepts_every_value_class(value: str) -> None:
    observation = parse_card_observation({"kind": "value", "value": value})

    assert observation == ValueOnlyCard(BlackjackValueClass(value))


@pytest.mark.parametrize("value", ("J", "Q", "K", "1", "11", "ace", ""))
def test_value_only_observation_rejects_invalid_values(value: str) -> None:
    with pytest.raises(ValidationError):
        parse_card_observation({"kind": "value", "value": value})


@pytest.mark.parametrize(
    "malformed",
    (
        {"kind": "value"},
        {"kind": "value", "value": "10", "suit": "S"},
        {"kind": "value", "value": "10", "rank": "K"},
        {"kind": "value", "value": None},
        {"kind": "value", "value": 10},
        {"kind": "other", "value": "10"},
        "10",
    ),
)
def test_value_only_observation_rejects_malformed_shapes(malformed: object) -> None:
    with pytest.raises(ValidationError):
        parse_card_observation(malformed)


def test_value_only_ten_round_trips_without_fake_identity() -> None:
    original = ValueOnlyCard(BlackjackValueClass.TEN)

    serialized = serialize_card_observation(original)
    restored = parse_card_observation(serialized)

    assert serialized == {"kind": "value", "value": "10"}
    assert restored == original
    assert isinstance(restored, ValueOnlyCard)
    assert not hasattr(restored, "rank")
    assert not hasattr(restored, "suit")


@pytest.mark.parametrize(
    "original,serialized",
    (
        (
            Card(rank=Rank.QUEEN, suit=Suit.HEARTS),
            {"kind": "known", "rank": "Q", "suit": "H"},
        ),
        (UnknownCard(), {"kind": "unknown"}),
    ),
)
def test_existing_observation_forms_round_trip_unchanged(
    original: Card | UnknownCard,
    serialized: dict[str, str],
) -> None:
    assert serialize_card_observation(original) == serialized
    assert parse_card_observation(serialized) == original


def test_value_only_observation_is_accepted_by_table_schema() -> None:
    state = TableStateSchema.model_validate(
        {
            "rules": {"decks": 1, "dealer_soft_17": "stand"},
            "dealer": {
                "cards": [{"kind": "value", "value": "10"}],
            },
            "players": [],
            "discarded_cards": [],
        }
    )

    assert state.dealer.cards[0].kind == "value"
    assert state.dealer.cards[0].value is BlackjackValueClass.TEN
