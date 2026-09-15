import pytest
from pydantic import ValidationError

from app.domain import (
    BlackjackValueClass,
    Card,
    DealerSoft17,
    GameState,
    Rank,
    Suit,
    UnknownCard,
    ValueOnlyCard,
)
from app.engine import build_table_state
from app.schemas import TableStateSchema


def representative_payload() -> dict[str, object]:
    return {
        "rules": {"decks": 2, "dealer_soft_17": "hit"},
        "dealer": {
            "cards": [
                {"kind": "known", "rank": "K", "suit": "H"},
                {"kind": "unknown"},
            ]
        },
        "players": [
            {
                "seat": 3,
                "is_user": True,
                "cards": [{"kind": "known", "rank": "A", "suit": "S"}],
            },
            {"seat": 1, "is_user": False, "cards": []},
        ],
        "discarded_cards": [
            {"kind": "known", "rank": "10", "suit": "D"}
        ],
    }


def test_reconstructs_frontend_contract_into_domain_state() -> None:
    payload = TableStateSchema.model_validate(representative_payload())

    reconstructed = build_table_state(payload)

    assert isinstance(reconstructed.game_state, GameState)
    assert reconstructed.deck_count == 2
    assert reconstructed.dealer_soft_17 is DealerSoft17.HIT
    assert tuple(player.seat for player in reconstructed.players) == (1, 3)
    assert tuple(player.is_user for player in reconstructed.players) == (False, True)
    assert reconstructed.known_card_count == 3
    assert reconstructed.unknown_card_count == 1
    assert reconstructed.game_state.shoe.total_cards == 100
    assert reconstructed.game_state.shoe.unknown_removed_count == 1
    assert reconstructed.game_state.shoe.count(
        Card(rank=Rank.KING, suit=Suit.HEARTS)
    ) == 1
    assert reconstructed.game_state.shoe.count(
        Card(rank=Rank.ACE, suit=Suit.SPADES)
    ) == 1
    assert reconstructed.game_state.shoe.count(
        Card(rank=Rank.TEN, suit=Suit.DIAMONDS)
    ) == 1
    assert isinstance(reconstructed.dealer_hand.cards[1], UnknownCard)


def test_unknown_observation_is_preserved_without_removing_an_exact_card() -> None:
    raw = representative_payload()
    raw["dealer"] = {"cards": [{"kind": "unknown"}]}
    raw["players"] = []
    raw["discarded_cards"] = []

    reconstructed = build_table_state(TableStateSchema.model_validate(raw))

    assert reconstructed.game_state is not None
    assert reconstructed.game_state.shoe.total_cards == 103
    assert reconstructed.game_state.shoe.exact_total == 104
    assert reconstructed.game_state.shoe.unknown_removed_count == 1
    assert reconstructed.known_card_count == 0
    assert reconstructed.unknown_card_count == 1
    assert isinstance(reconstructed.dealer_hand.cards[0], UnknownCard)


def test_unknown_deck_count_never_creates_a_fallback_shoe() -> None:
    raw = representative_payload()
    raw["rules"] = {"decks": None, "dealer_soft_17": "stand"}

    reconstructed = build_table_state(TableStateSchema.model_validate(raw))

    assert reconstructed.deck_count is None
    assert reconstructed.game_state is None
    assert reconstructed.known_card_count == 3
    assert reconstructed.unknown_card_count == 1


def test_reconstruction_is_deterministic_for_the_same_validated_payload() -> None:
    payload = TableStateSchema.model_validate(representative_payload())

    assert build_table_state(payload) == build_table_state(payload)


@pytest.mark.parametrize(
    "path,value",
    [
        (("rules", "decks"), 0),
        (("rules", "decks"), True),
        (("rules", "dealer_soft_17"), "sometimes"),
        (("dealer", "cards"), [{"kind": "known", "rank": "T", "suit": "S"}]),
        (("players",), [{"seat": 8, "is_user": False, "cards": []}]),
    ],
)
def test_schema_rejects_malformed_transport_values(
    path: tuple[str, ...],
    value: object,
) -> None:
    raw = representative_payload()
    target = raw
    for key in path[:-1]:
        target = target[key]  # type: ignore[index,assignment]
    target[path[-1]] = value  # type: ignore[index]

    with pytest.raises(ValidationError):
        TableStateSchema.model_validate(raw)


def test_reconstructs_value_only_cards_across_table_and_history() -> None:
    raw = representative_payload()
    raw["dealer"] = {"cards": [{"kind": "value", "value": "A"}]}
    raw["players"] = [
        {
            "seat": 3,
            "is_user": True,
            "hand_id": "seat-3-hand-1-1",
            "parent_hand_id": "seat-3-hand-1",
            "split_depth": 1,
            "cards": [{"kind": "value", "value": "5"}],
        },
        {
            "seat": 3,
            "hand_id": "seat-3-hand-1-2",
            "parent_hand_id": "seat-3-hand-1",
            "split_depth": 1,
            "cards": [{"kind": "value", "value": "10"}],
        },
    ]
    raw["discarded_cards"] = [{"kind": "value", "value": "7"}]

    state = build_table_state(TableStateSchema.model_validate(raw))

    assert state.game_state is not None
    assert state.known_card_count == 4
    assert state.unknown_card_count == 0
    assert state.dealer_hand.cards == (
        ValueOnlyCard(BlackjackValueClass.ACE),
    )
    assert state.game_state.shoe.value_count(BlackjackValueClass.ACE) == 7
    assert state.game_state.shoe.value_count(BlackjackValueClass.FIVE) == 7
    assert state.game_state.shoe.value_count(BlackjackValueClass.SEVEN) == 7
    assert state.game_state.shoe.value_count(BlackjackValueClass.TEN) == 31
    assert state.game_state.shoe.unknown_removed_count == 0


def test_mixed_exact_value_only_and_unknown_remain_distinct() -> None:
    raw = representative_payload()
    raw["dealer"] = {
        "cards": [
            {"kind": "known", "rank": "Q", "suit": "H"},
            {"kind": "value", "value": "10"},
            {"kind": "unknown"},
        ]
    }
    raw["players"] = []
    raw["discarded_cards"] = []

    state = build_table_state(TableStateSchema.model_validate(raw))

    assert state.game_state is not None
    assert isinstance(state.dealer_hand.cards[0], Card)
    assert isinstance(state.dealer_hand.cards[1], ValueOnlyCard)
    assert isinstance(state.dealer_hand.cards[2], UnknownCard)
    assert state.game_state.shoe.value_count(BlackjackValueClass.TEN) == 30
    assert state.game_state.shoe.unknown_removed_count == 1
    assert state.game_state.shoe.count(Card(Rank.QUEEN, Suit.HEARTS)) == 1
