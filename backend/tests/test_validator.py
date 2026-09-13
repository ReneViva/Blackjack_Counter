from app.domain import Card, DealerSoft17, GameState, Hand, Rank, Rules, Shoe, Suit
from app.engine import (
    ReconstructedPlayerHand,
    ReconstructedTableState,
    build_table_state,
    validate_table_state,
)
from app.schemas import TableStateSchema


def payload(
    *,
    decks: int | None = 1,
    dealer_cards: list[dict[str, object]] | None = None,
    players: list[dict[str, object]] | None = None,
) -> TableStateSchema:
    return TableStateSchema.model_validate(
        {
            "rules": {"decks": decks, "dealer_soft_17": "stand"},
            "dealer": {"cards": dealer_cards or []},
            "players": players or [],
            "discarded_cards": [],
        }
    )


def test_valid_state_has_no_issues() -> None:
    result = validate_table_state(
        build_table_state(
            payload(
                dealer_cards=[{"kind": "known", "rank": "A", "suit": "S"}],
                players=[{"seat": 1, "is_user": True, "cards": []}],
            )
        )
    )

    assert result.valid
    assert result.errors == ()
    assert result.warnings == ()


def test_reports_exact_and_rank_multiplicity_in_deterministic_order() -> None:
    aces = [
        {"kind": "known", "rank": "A", "suit": suit}
        for suit in ("S", "H", "D", "C")
    ]
    state = build_table_state(payload(dealer_cards=[*aces, aces[0]]))

    first = validate_table_state(state)
    second = validate_table_state(state)

    assert first == second
    assert [issue.code for issue in first.errors] == [
        "exact_card_multiplicity_exceeded",
        "rank_multiplicity_exceeded",
    ]
    assert state.game_state is None


def test_unknown_cards_count_physically_without_fabricating_identity() -> None:
    unknown_cards = [{"kind": "unknown"} for _ in range(53)]
    state = build_table_state(payload(dealer_cards=unknown_cards))

    result = validate_table_state(state)

    assert [issue.code for issue in result.errors] == ["shoe_capacity_exceeded"]
    assert state.known_card_count == 0
    assert state.unknown_card_count == 53


def test_unknown_deck_count_is_preserved_as_warning() -> None:
    state = build_table_state(
        payload(decks=None, dealer_cards=[{"kind": "unknown"}])
    )

    result = validate_table_state(state)

    assert result.valid
    assert result.errors == ()
    assert [issue.code for issue in result.warnings] == ["deck_count_unknown"]
    assert state.game_state is None


def test_duplicate_and_multiple_user_seats_are_reported() -> None:
    state = build_table_state(
        payload(
            players=[
                {"seat": 2, "is_user": True, "cards": []},
                {"seat": 2, "is_user": True, "cards": []},
            ]
        )
    )

    result = validate_table_state(state)

    assert [issue.code for issue in result.errors] == [
        "duplicate_seat",
        "multiple_user_seats",
    ]


def test_rule_compatibility_checks_reconstructed_metadata() -> None:
    rules = Rules(decks=1, dealer_soft_17=DealerSoft17.STAND)
    game_state = GameState(rules=rules, shoe=Shoe.fresh(1))
    state = ReconstructedTableState(
        deck_count=2,
        dealer_soft_17=DealerSoft17.HIT,
        max_split_hands=4,
        dealer_hand=Hand(),
        players=(ReconstructedPlayerHand(seat=1, is_user=True, hand=Hand()),),
        discarded_cards=(),
        known_card_count=0,
        unknown_card_count=0,
        game_state=game_state,
    )

    result = validate_table_state(state)

    assert [issue.code for issue in result.errors] == [
        "rule_deck_count_mismatch",
        "rule_soft_17_mismatch",
    ]


def test_exact_card_code_uses_domain_card_identity() -> None:
    repeated = {"kind": "known", "rank": "K", "suit": "H"}
    state = build_table_state(payload(dealer_cards=[repeated, repeated]))

    issue = validate_table_state(state).errors[0]

    assert issue.code == "exact_card_multiplicity_exceeded"
    assert "KH" in issue.message
    assert Card(rank=Rank.KING, suit=Suit.HEARTS) in tuple(
        card for card in state.dealer_hand.cards if isinstance(card, Card)
    )
