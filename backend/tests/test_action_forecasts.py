from copy import deepcopy
from dataclasses import replace
import math

from fastapi.testclient import TestClient

from app.domain import (
    ALL_CARDS,
    Card,
    DealerBlackjackCheckRule,
    DealerCheckResult,
    DealerSecondCardRule,
    DealerSoft17,
    GameState,
    Hand,
    Rank,
    Rules,
    Shoe,
    SurrenderRule,
    Suit,
    UnknownCard,
)
from app.engine import ReconstructedPlayerHand, ReconstructedTableState
from app.main import app
from app.probability import analyze_exact_action_forecasts


client = TestClient(app)


def card(rank: Rank, suit: Suit) -> Card:
    return Card(rank=rank, suit=suit)


def sparse_shoe(**rank_counts: int) -> Shoe:
    counts = [0] * len(ALL_CARDS)
    for rank_text, count in rank_counts.items():
        rank = Rank(rank_text)
        indexes = [
            index for index, candidate in enumerate(ALL_CARDS)
            if candidate.rank is rank
        ]
        for index in indexes[:count]:
            counts[index] = 1
    return Shoe(decks=1, card_counts=tuple(counts))


def table_state(
    *,
    player_cards: tuple[Card | UnknownCard, ...],
    dealer_cards: tuple[Card | UnknownCard, ...],
    shoe: Shoe,
    rules: Rules | None = None,
    player: ReconstructedPlayerHand | None = None,
    others: tuple[ReconstructedPlayerHand, ...] = (),
    discarded: tuple[Card | UnknownCard, ...] = (),
) -> ReconstructedTableState:
    configured = rules or Rules(
        decks=1,
        dealer_soft_17=DealerSoft17.STAND,
    )
    selected = player or ReconstructedPlayerHand(
        seat=4,
        is_user=True,
        hand=Hand(cards=player_cards),
        hand_id="seat-4-hand-1",
    )
    players = (selected, *others)
    dealer = Hand(cards=dealer_cards)
    observed = dealer.cards + tuple(
        observed_card for hand in players for observed_card in hand.hand.cards
    ) + discarded
    return ReconstructedTableState(
        deck_count=1,
        dealer_soft_17=configured.dealer_soft_17,
        max_split_hands=configured.max_split_hands,
        dealer_hand=dealer,
        players=players,
        discarded_cards=discarded,
        known_card_count=sum(isinstance(item, Card) for item in observed),
        unknown_card_count=sum(isinstance(item, UnknownCard) for item in observed),
        game_state=GameState(
            rules=configured,
            shoe=shoe,
            dealer_hand=dealer,
            player_hands=tuple(hand.hand for hand in players),
        ),
    )


def forecast(state: ReconstructedTableState):
    return analyze_exact_action_forecasts(
        state,
        target_seat=4,
        target_hand_id=next(player.hand_id for player in state.players if player.is_user),
    )


def assert_probability_mass(result) -> None:
    assert result.status == "available"
    assert result.outcomes is not None
    assert math.isclose(result.outcomes.total, 1.0, abs_tol=1e-12)


def test_one_possible_next_card_is_drawn_once_then_player_stands() -> None:
    state = table_state(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.EIGHT, Suit.HEARTS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"2": 1}),
    )

    result = forecast(state)

    assert result.stand_now.outcomes == result.hit_once_then_stand.outcomes
    assert result.hit_once_then_stand.outcomes is not None
    assert result.hit_once_then_stand.outcomes.win == 1.0
    assert_probability_mass(result.stand_now)
    assert_probability_mass(result.hit_once_then_stand)


def test_hit_branches_use_exact_rank_multiplicity_without_replacement() -> None:
    state = table_state(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.TWO, Suit.HEARTS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"5": 1, "K": 3}),
    )

    first = forecast(state)
    second = forecast(state)

    assert first == second
    assert first.stand_now.outcomes is not None
    assert first.stand_now.outcomes.loss == 1.0
    assert first.hit_once_then_stand.outcomes is not None
    assert first.hit_once_then_stand.outcomes.push == 0.25
    assert first.hit_once_then_stand.outcomes.loss == 0.75
    assert first.hit_once_then_stand.outcomes.win == 0.0
    assert_probability_mass(first.hit_once_then_stand)


def test_immediate_bust_hit_branch_contributes_loss() -> None:
    state = table_state(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.QUEEN, Suit.HEARTS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(K=1),
    )

    result = forecast(state)

    assert result.stand_now.outcomes is not None
    assert result.stand_now.outcomes.win == 1.0
    assert result.hit_once_then_stand.outcomes is not None
    assert result.hit_once_then_stand.outcomes.loss == 1.0


def test_guaranteed_non_bust_hit_stands_without_future_player_policy() -> None:
    state = table_state(
        player_cards=(card(Rank.TWO, Suit.HEARTS), card(Rank.THREE, Suit.HEARTS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"2": 1}),
    )

    result = forecast(state)

    assert result.hit_once_then_stand.outcomes is not None
    assert result.hit_once_then_stand.outcomes.loss == 1.0
    assert result.hit_once_then_stand.metrics is not None
    assert result.hit_once_then_stand.metrics.states_evaluated == 2


def test_stand_forecast_respects_s17_and_h17_dealer_recursion() -> None:
    base = table_state(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.SEVEN, Suit.HEARTS)),
        dealer_cards=(card(Rank.ACE, Suit.DIAMONDS), card(Rank.SIX, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"4": 1}),
    )
    hit_rules = replace(base.game_state.rules, dealer_soft_17=DealerSoft17.HIT)
    hit_state = replace(
        base,
        dealer_soft_17=DealerSoft17.HIT,
        game_state=replace(base.game_state, rules=hit_rules),
    )

    stands = forecast(base).stand_now
    hits = forecast(hit_state).stand_now

    assert stands.outcomes is not None and stands.outcomes.push == 1.0
    assert hits.outcomes is not None and hits.outcomes.loss == 1.0


def test_no_blackjack_peek_conditioning_is_preserved_for_both_actions() -> None:
    rules = Rules(
        decks=1,
        dealer_soft_17=DealerSoft17.STAND,
        dealer_second_card=DealerSecondCardRule.HOLE_CARD,
        dealer_blackjack_check=DealerBlackjackCheckRule.PEEK,
    )
    state = table_state(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.QUEEN, Suit.HEARTS)),
        dealer_cards=(card(Rank.ACE, Suit.DIAMONDS), UnknownCard()),
        shoe=replace(sparse_shoe(K=1, **{"9": 1}), unknown_removed_count=1),
        rules=rules,
    )

    result = analyze_exact_action_forecasts(
        state,
        target_seat=4,
        target_hand_id="seat-4-hand-1",
        dealer_check_result=DealerCheckResult.NO_BLACKJACK,
    )

    assert result.stand_now.outcomes is not None
    assert result.stand_now.outcomes.push == 1.0
    assert result.hit_once_then_stand.outcomes is not None
    assert result.hit_once_then_stand.outcomes.loss == 1.0
    assert result.stand_now.hidden_states_evaluated == 2
    assert result.stand_now.hidden_weight_mass == 1.0


def test_split_hands_are_forecast_as_distinct_targets() -> None:
    first_hand = ReconstructedPlayerHand(
        seat=4,
        is_user=True,
        hand=Hand(cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.TWO, Suit.HEARTS))),
        hand_id="seat-4-hand-1-1",
        parent_hand_id="seat-4-hand-1",
        split_depth=1,
    )
    second_hand = ReconstructedPlayerHand(
        seat=4,
        is_user=False,
        hand=Hand(cards=(card(Rank.TEN, Suit.CLUBS), card(Rank.EIGHT, Suit.CLUBS))),
        hand_id="seat-4-hand-1-2",
        parent_hand_id="seat-4-hand-1",
        split_depth=1,
    )
    first_state = table_state(
        player_cards=first_hand.hand.cards,
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"5": 1}),
        player=first_hand,
        others=(second_hand,),
    )
    second_state = replace(
        first_state,
        players=(replace(first_hand, is_user=False), replace(second_hand, is_user=True)),
    )

    first = analyze_exact_action_forecasts(
        first_state,
        target_seat=4,
        target_hand_id=first_hand.hand_id,
    )
    second = analyze_exact_action_forecasts(
        second_state,
        target_seat=4,
        target_hand_id=second_hand.hand_id,
    )

    assert first.hit_once_then_stand.outcomes is not None
    assert first.hit_once_then_stand.outcomes.push == 1.0
    assert second.hit_once_then_stand.outcomes is not None
    assert second.hit_once_then_stand.outcomes.loss == 1.0


def test_busted_and_restricted_split_ace_hands_are_unavailable() -> None:
    busted = table_state(
        player_cards=(
            card(Rank.TEN, Suit.HEARTS),
            card(Rank.QUEEN, Suit.HEARTS),
            card(Rank.TWO, Suit.CLUBS),
        ),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS),),
        shoe=sparse_shoe(**{"5": 1}),
    )
    split_ace_player = ReconstructedPlayerHand(
        seat=4,
        is_user=True,
        hand=Hand(cards=(card(Rank.ACE, Suit.HEARTS), card(Rank.FIVE, Suit.HEARTS))),
        hand_id="seat-4-hand-1-1",
        parent_hand_id="seat-4-hand-1",
        split_depth=1,
        from_split_aces=True,
    )
    split_ace = table_state(
        player_cards=split_ace_player.hand.cards,
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS),),
        shoe=sparse_shoe(**{"5": 1}),
        player=split_ace_player,
    )

    busted_result = forecast(busted)
    split_result = forecast(split_ace)

    assert busted_result.stand_now.status == "unavailable"
    assert busted_result.hit_once_then_stand.status == "unavailable"
    assert split_result.hit_once_then_stand.status == "unavailable"
    assert split_result.hit_once_then_stand.code == "action_not_allowed"


def test_ambiguous_selected_hand_status_returns_unavailable_instead_of_guessing() -> None:
    state = table_state(
        player_cards=(card(Rank.TEN, Suit.HEARTS), UnknownCard()),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=replace(sparse_shoe(A=1, K=1), unknown_removed_count=1),
    )

    result = forecast(state)

    assert result.stand_now.status == "unavailable"
    assert result.stand_now.code == "ambiguous_hand_status"
    assert result.hit_once_then_stand.status == "unavailable"
    assert result.hit_once_then_stand.code == "ambiguous_hand_status"


def known(rank: str, suit: str) -> dict[str, str]:
    return {"kind": "known", "rank": rank, "suit": suit}


def api_payload() -> dict[str, object]:
    return {
        "state": {
            "rules": {
                "decks": 1,
                "dealer_soft_17": "stand",
                "splitting_enabled": True,
                "max_split_hands": 4,
                "resplit_aces": False,
                "hit_split_aces": False,
                "blackjack_after_split": False,
                "doubling_enabled": True,
                "double_after_split": True,
                "surrender": "none",
                "dealer_second_card": "hole_card",
                "dealer_blackjack_check": "no_peek",
            },
            "dealer": {"cards": [known("10", "D"), known("7", "D")]},
            "players": [
                {
                    "seat": 4,
                    "is_user": True,
                    "hand_id": "seat-4-hand-1",
                    "parent_hand_id": None,
                    "split_depth": 0,
                    "from_split_aces": False,
                    "cards": [known("10", "H"), known("2", "H")],
                },
                {
                    "seat": 5,
                    "is_user": False,
                    "hand_id": "seat-5-hand-1",
                    "parent_hand_id": None,
                    "split_depth": 0,
                    "from_split_aces": False,
                    "cards": [known("5", "C")],
                },
            ],
            "discarded_cards": [known("K", "C")],
        },
        "options": {
            "method": "exact_action_forecast",
            "target": {"seat": 4, "hand_id": "seat-4-hand-1"},
        },
    }


def test_api_returns_both_exact_contracts_without_ranking_or_ci_fields() -> None:
    response = client.post("/api/analyze", json=api_payload())

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "exact_action_forecast"
    assert payload["target"] == {"seat": 4, "hand_id": "seat-4-hand-1"}
    assert set(payload["action_forecasts"]) == {
        "stand_now",
        "hit_once_then_stand",
        "double_one_card_then_stand",
        "surrender_now",
        "split_one_card_each_then_stand",
    }
    assert payload["action_forecasts"]["stand_now"]["contract"] == "stand_now"
    assert payload["action_forecasts"]["hit_once_then_stand"]["contract"] == "hit_once_then_stand"
    assert payload["action_forecasts"]["hit_once_then_stand"]["outcomes"]["push"] == 3 / 46
    serialized = response.text.lower()
    for forbidden in (
        "best_action",
        "recommended_action",
        "optimal_action",
        "preferred_action",
        "runner_up_action",
        "ci_low",
        "ci_high",
        "payout",
        "wager",
        "expected_value",
    ):
        assert forbidden not in serialized


def test_other_hands_and_departed_observations_reduce_the_shared_shoe() -> None:
    with_discard = api_payload()
    without_discard = api_payload()
    without_discard["state"]["discarded_cards"] = []  # type: ignore[index]

    reduced = client.post("/api/analyze", json=with_discard).json()
    larger = client.post("/api/analyze", json=without_discard).json()

    assert reduced["action_forecasts"]["hit_once_then_stand"]["outcomes"]["push"] == 3 / 46
    assert larger["action_forecasts"]["hit_once_then_stand"]["outcomes"]["push"] == 3 / 47


def test_other_split_hand_cards_remain_removed_from_forecast_shoe() -> None:
    with_sibling = api_payload()
    players = with_sibling["state"]["players"]  # type: ignore[index]
    players[0].update({  # type: ignore[index]
        "hand_id": "seat-4-hand-1-1",
        "parent_hand_id": "seat-4-hand-1",
        "split_depth": 1,
    })
    players[1].update({  # type: ignore[index]
        "seat": 4,
        "hand_id": "seat-4-hand-1-2",
        "parent_hand_id": "seat-4-hand-1",
        "split_depth": 1,
    })
    with_sibling["options"]["target"] = {  # type: ignore[index]
        "seat": 4,
        "hand_id": "seat-4-hand-1-1",
    }
    without_sibling = api_payload()
    without_sibling["state"]["players"] = [  # type: ignore[index]
        without_sibling["state"]["players"][0]  # type: ignore[index]
    ]

    reduced = client.post("/api/analyze", json=with_sibling).json()
    larger = client.post("/api/analyze", json=without_sibling).json()

    assert reduced["action_forecasts"]["hit_once_then_stand"]["outcomes"]["push"] == 3 / 46
    assert larger["action_forecasts"]["hit_once_then_stand"]["outcomes"]["push"] == 4 / 47


def test_missing_and_invalid_targets_return_structured_unavailable_results() -> None:
    missing = api_payload()
    missing["options"] = {"method": "exact_action_forecast", "target": None}
    invalid = api_payload()
    invalid["options"] = {
        "method": "exact_action_forecast",
        "target": {"seat": 4, "hand_id": "missing"},
    }

    missing_payload = client.post("/api/analyze", json=missing).json()
    invalid_payload = client.post("/api/analyze", json=invalid).json()

    assert missing_payload["action_forecasts"]["stand_now"]["status"] == "unavailable"
    assert missing_payload["action_forecasts"]["stand_now"]["error"]["code"] == "no_selected_hand"
    assert invalid_payload["action_forecasts"]["hit_once_then_stand"]["error"]["code"] == "invalid_hand_target"


def test_explicit_stood_and_surrendered_statuses_are_unavailable() -> None:
    for status in ("stood", "surrendered"):
        request = api_payload()
        request["state"]["players"][0]["status"] = status  # type: ignore[index]

        payload = client.post("/api/analyze", json=request).json()

        assert payload["action_forecasts"]["stand_now"]["status"] == "unavailable"
        assert payload["action_forecasts"]["hit_once_then_stand"]["status"] == "unavailable"
        assert payload["action_forecasts"]["hit_once_then_stand"]["error"]["code"] == "terminal_hand"


def test_unknown_deck_forecasts_remain_separate_unaggregated_scenarios() -> None:
    request = api_payload()
    request["state"]["rules"]["decks"] = None  # type: ignore[index]

    response = client.post("/api/analyze", json=request)

    assert response.status_code == 200
    payload = response.json()
    assert payload["method"] == "exact_action_forecast"
    assert payload["model_uncertainty"] == ["deck_count"]
    assert payload["aggregation"] == "none"
    assert len(payload["scenarios"]) == 8
    assert all(
        scenario["result"]["method"] == "exact_action_forecast"
        for scenario in payload["scenarios"]
    )


def test_legal_double_draws_one_card_then_stands_without_a_multiplier() -> None:
    state = table_state(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.TWO, Suit.HEARTS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"5": 1, "K": 3}),
    )

    result = forecast(state)

    assert result.double_one_card_then_stand.status == "available"
    assert result.double_one_card_then_stand.outcomes == result.hit_once_then_stand.outcomes
    assert_probability_mass(result.double_one_card_then_stand)


def test_double_immediate_bust_and_guaranteed_non_bust_are_exact() -> None:
    bust = table_state(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.QUEEN, Suit.HEARTS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(K=1),
    )
    non_bust = table_state(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.EIGHT, Suit.HEARTS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"2": 1}),
    )

    bust_result = forecast(bust).double_one_card_then_stand
    non_bust_result = forecast(non_bust).double_one_card_then_stand

    assert bust_result.outcomes is not None and bust_result.outcomes.loss == 1.0
    assert non_bust_result.outcomes is not None and non_bust_result.outcomes.win == 1.0


def test_double_after_split_rule_is_authoritative() -> None:
    selected = ReconstructedPlayerHand(
        seat=4,
        is_user=True,
        hand=Hand(cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.TWO, Suit.HEARTS))),
        hand_id="seat-4-hand-1-1",
        parent_hand_id="seat-4-hand-1",
        split_depth=1,
    )
    rules = Rules(
        decks=1,
        dealer_soft_17=DealerSoft17.STAND,
        double_after_split=False,
    )
    state = table_state(
        player_cards=selected.hand.cards,
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"5": 1}),
        player=selected,
        rules=rules,
    )

    result = forecast(state)

    assert result.hit_once_then_stand.status == "available"
    assert result.double_one_card_then_stand.status == "unavailable"
    assert result.double_one_card_then_stand.code == "double_not_allowed"


def test_double_is_illegal_on_a_locked_split_ace_hand() -> None:
    selected = ReconstructedPlayerHand(
        seat=4,
        is_user=True,
        hand=Hand(cards=(card(Rank.ACE, Suit.HEARTS), card(Rank.FIVE, Suit.CLUBS))),
        hand_id="seat-4-hand-1-1",
        parent_hand_id="seat-4-hand-1",
        split_depth=1,
        from_split_aces=True,
    )
    rules = Rules(
        decks=1,
        dealer_soft_17=DealerSoft17.STAND,
        hit_split_aces=False,
    )
    state = table_state(
        player_cards=selected.hand.cards,
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"2": 1}),
        player=selected,
        rules=rules,
    )

    result = forecast(state).double_one_card_then_stand

    assert result.status == "unavailable"
    assert result.code == "action_not_allowed"


def test_late_surrender_is_terminal_without_outcome_distribution() -> None:
    rules = Rules(
        decks=1,
        dealer_soft_17=DealerSoft17.STAND,
        surrender=SurrenderRule.LATE,
    )
    state = table_state(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.SIX, Suit.HEARTS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"2": 1, "3": 1}),
        rules=rules,
    )

    before = state
    result = forecast(state).surrender_now

    assert state == before
    assert result.status == "available"
    assert result.terminal == "surrendered"


def test_surrender_disabled_is_structured_unavailable() -> None:
    state = table_state(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.SIX, Suit.HEARTS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"2": 1, "3": 1}),
    )

    result = forecast(state).surrender_now

    assert result.status == "unavailable"
    assert result.terminal is None
    assert result.code == "surrender_not_allowed"


def test_split_two_card_shoe_deals_child_one_then_child_two_without_replacement() -> None:
    state = table_state(
        player_cards=(card(Rank.EIGHT, Suit.HEARTS), card(Rank.EIGHT, Suit.CLUBS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"2": 1, "K": 1}),
    )

    before = state
    first = forecast(state).split_one_card_each_then_stand
    second = forecast(state).split_one_card_each_then_stand

    assert state == before
    assert first == second
    assert first.status == "available"
    assert first.child_hand_1 is not None
    assert first.child_hand_2 is not None
    assert first.child_hand_1.win == 0.5
    assert first.child_hand_1.push == 0.0
    assert first.child_hand_1.loss == 0.5
    assert first.child_hand_2 == first.child_hand_1
    assert math.isclose(first.child_hand_1.total, 1.0, abs_tol=1e-12)
    assert math.isclose(first.child_hand_2.total, 1.0, abs_tol=1e-12)


def test_split_forecast_accounts_for_other_hands_and_departed_cards() -> None:
    reduced_request = api_payload()
    reduced_request["state"]["players"][0]["cards"] = [  # type: ignore[index]
        known("8", "H"),
        known("8", "S"),
    ]
    larger_request = api_payload()
    larger_request["state"]["players"] = [  # type: ignore[index]
        larger_request["state"]["players"][0]  # type: ignore[index]
    ]
    larger_request["state"]["players"][0]["cards"] = [  # type: ignore[index]
        known("8", "H"),
        known("8", "S"),
    ]
    larger_request["state"]["discarded_cards"] = []  # type: ignore[index]

    reduced = client.post("/api/analyze", json=reduced_request).json()[
        "action_forecasts"
    ]["split_one_card_each_then_stand"]
    larger = client.post("/api/analyze", json=larger_request).json()[
        "action_forecasts"
    ]["split_one_card_each_then_stand"]

    assert reduced["status"] == "available"
    assert larger["status"] == "available"
    assert reduced["child_hand_1"] != larger["child_hand_1"]
    assert reduced["child_hand_2"] != larger["child_hand_2"]
    assert math.isclose(sum(reduced["child_hand_1"].values()), 1.0, abs_tol=1e-12)
    assert math.isclose(sum(reduced["child_hand_2"].values()), 1.0, abs_tol=1e-12)


def test_split_legality_respects_disabled_and_max_hand_rules() -> None:
    selected = ReconstructedPlayerHand(
        seat=4,
        is_user=True,
        hand=Hand(cards=(card(Rank.EIGHT, Suit.HEARTS), card(Rank.EIGHT, Suit.CLUBS))),
        hand_id="seat-4-hand-1-1",
        parent_hand_id="seat-4-hand-1",
        split_depth=1,
    )
    sibling = ReconstructedPlayerHand(
        seat=4,
        is_user=False,
        hand=Hand(cards=(card(Rank.FIVE, Suit.HEARTS),)),
        hand_id="seat-4-hand-1-2",
        parent_hand_id="seat-4-hand-1",
        split_depth=1,
    )
    disabled_rules = Rules(
        decks=1,
        dealer_soft_17=DealerSoft17.STAND,
        splitting_enabled=False,
    )
    maxed_rules = Rules(
        decks=1,
        dealer_soft_17=DealerSoft17.STAND,
        max_split_hands=2,
    )
    common = dict(
        player_cards=selected.hand.cards,
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"2": 1, "K": 1}),
        player=selected,
    )

    disabled = forecast(table_state(**common, rules=disabled_rules))
    maxed = forecast(table_state(**common, rules=maxed_rules, others=(sibling,)))

    assert disabled.split_one_card_each_then_stand.code == "splitting_disabled"
    assert maxed.split_one_card_each_then_stand.code == "split_limit_reached"


def test_resplit_aces_rule_and_fixed_split_ace_continuation_are_respected() -> None:
    rules = Rules(
        decks=1,
        dealer_soft_17=DealerSoft17.STAND,
        resplit_aces=False,
        hit_split_aces=False,
    )
    resplit = ReconstructedPlayerHand(
        seat=4,
        is_user=True,
        hand=Hand(cards=(card(Rank.ACE, Suit.HEARTS), card(Rank.ACE, Suit.CLUBS))),
        hand_id="seat-4-hand-1-1",
        parent_hand_id="seat-4-hand-1",
        split_depth=1,
        from_split_aces=True,
    )
    common = dict(
        player_cards=resplit.hand.cards,
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"2": 1, "K": 1}),
        rules=rules,
    )
    resplit_state = table_state(**common, player=resplit)
    initial_state = table_state(**common)

    blocked = forecast(resplit_state).split_one_card_each_then_stand
    initial = forecast(initial_state).split_one_card_each_then_stand

    assert blocked.status == "unavailable"
    assert blocked.code == "resplit_aces_not_allowed"
    assert initial.status == "available"
    assert initial.child_hand_1 is not None and initial.child_hand_1.total == 1.0
    assert initial.child_hand_2 is not None and initial.child_hand_2.total == 1.0


def test_split_preserves_hidden_peek_conditioning() -> None:
    rules = Rules(
        decks=1,
        dealer_soft_17=DealerSoft17.STAND,
        dealer_second_card=DealerSecondCardRule.HOLE_CARD,
        dealer_blackjack_check=DealerBlackjackCheckRule.PEEK,
    )
    state = table_state(
        player_cards=(card(Rank.EIGHT, Suit.HEARTS), card(Rank.EIGHT, Suit.CLUBS)),
        dealer_cards=(card(Rank.ACE, Suit.DIAMONDS), UnknownCard()),
        shoe=replace(
            sparse_shoe(K=1, **{"2": 1, "3": 1, "4": 1, "5": 1, "9": 1}),
            unknown_removed_count=1,
        ),
        rules=rules,
    )

    result = analyze_exact_action_forecasts(
        state,
        target_seat=4,
        target_hand_id="seat-4-hand-1",
        dealer_check_result=DealerCheckResult.NO_BLACKJACK,
    ).split_one_card_each_then_stand

    assert result.status == "available"
    assert result.hidden_states_evaluated > 0
    assert result.hidden_weight_mass == 1.0
    assert result.child_hand_1 is not None
    assert result.child_hand_2 is not None
    assert math.isclose(result.child_hand_1.total, 1.0, abs_tol=1e-12)
    assert math.isclose(result.child_hand_2.total, 1.0, abs_tol=1e-12)


def test_split_resource_limit_is_structured_unavailable() -> None:
    state = table_state(
        player_cards=(card(Rank.EIGHT, Suit.HEARTS), card(Rank.EIGHT, Suit.CLUBS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.SEVEN, Suit.DIAMONDS)),
        shoe=sparse_shoe(**{"2": 1, "K": 1}),
    )

    result = analyze_exact_action_forecasts(
        state,
        target_seat=4,
        target_hand_id="seat-4-hand-1",
        max_states=1,
    ).split_one_card_each_then_stand

    assert result.status == "unavailable"
    assert result.code == "exact_computation_limit"


def test_extended_api_shapes_are_independent_and_non_monetary() -> None:
    request = api_payload()
    request["state"]["rules"]["surrender"] = "late"  # type: ignore[index]
    response = client.post("/api/analyze", json=request)

    assert response.status_code == 200
    actions = response.json()["action_forecasts"]
    assert actions["double_one_card_then_stand"]["status"] == "available"
    assert actions["double_one_card_then_stand"]["outcomes"] == actions["hit_once_then_stand"]["outcomes"]
    assert actions["surrender_now"] == {
        "contract": "surrender_now",
        "status": "available",
        "method": "exact",
        "terminal": "surrendered",
        "error": None,
    }
    assert actions["split_one_card_each_then_stand"]["status"] == "unavailable"
    serialized = response.text.lower()
    for forbidden in ("payout", "wager", "stake", "expected_value", "recommended", "best_action"):
        assert forbidden not in serialized


def test_value_only_state_matches_exact_action_forecasts() -> None:
    exact_request = api_payload()
    value_request = deepcopy(exact_request)
    state = value_request["state"]  # type: ignore[index]

    def convert(cards: list[dict[str, str]]) -> list[dict[str, str]]:
        return [
            {
                "kind": "value",
                "value": (
                    "10"
                    if card["rank"] in ("10", "J", "Q", "K")
                    else card["rank"]
                ),
            }
            for card in cards
        ]

    state["dealer"]["cards"] = convert(state["dealer"]["cards"])  # type: ignore[index]
    for player in state["players"]:  # type: ignore[index]
        player["cards"] = convert(player["cards"])
    state["discarded_cards"] = convert(state["discarded_cards"])  # type: ignore[index]

    exact = client.post("/api/analyze", json=exact_request).json()[
        "action_forecasts"
    ]
    value_only = client.post("/api/analyze", json=value_request).json()[
        "action_forecasts"
    ]

    for action in (
        "stand_now",
        "hit_once_then_stand",
        "double_one_card_then_stand",
    ):
        assert value_only[action]["status"] == "available"
        for outcome in ("win", "push", "loss"):
            assert math.isclose(
                value_only[action]["outcomes"][outcome],
                exact[action]["outcomes"][outcome],
                abs_tol=1e-12,
            )
        assert math.isclose(
            sum(value_only[action]["outcomes"].values()),
            1.0,
            abs_tol=1e-12,
        )
