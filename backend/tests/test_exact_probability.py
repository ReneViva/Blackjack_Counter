from dataclasses import replace

import pytest

from app.domain import (
    ALL_CARDS,
    Card,
    DealerCheckResult,
    DealerSoft17,
    GameState,
    Hand,
    HandStatus,
    PlayerHandState,
    Rank,
    RoundPhase,
    RoundState,
    Rules,
    Shoe,
    Suit,
    UnknownCard,
)
from app.engine import advance_dealer
from app.probability import (
    ExactAnalysisError,
    evaluate_exact_reference,
    possible_draws,
)


def card(rank: Rank, suit: Suit = Suit.SPADES) -> Card:
    return Card(rank=rank, suit=suit)


def shoe_with_ranks(**counts: int) -> Shoe:
    exact_counts = [0] * len(ALL_CARDS)
    for rank_text, count in counts.items():
        rank = Rank(rank_text)
        rank_indexes = [
            index for index, candidate in enumerate(ALL_CARDS) if candidate.rank is rank
        ]
        for offset in range(count):
            exact_counts[rank_indexes[offset % 4]] += 1
    decks = max(1, max(exact_counts, default=0))
    return Shoe(decks=decks, card_counts=tuple(exact_counts))


def dealer_round(
    *,
    player_cards: tuple[Card, ...],
    dealer_cards: tuple[Card, ...],
    shoe: Shoe,
    phase: RoundPhase = RoundPhase.DEALER_TURN,
) -> RoundState:
    rules = Rules(decks=shoe.decks, dealer_soft_17=DealerSoft17.STAND)
    player_hand = Hand(cards=player_cards)
    player = PlayerHandState(
        seat=1,
        hand=player_hand,
        status=HandStatus.STOOD,
        decision_count=1,
    )
    game_state = GameState(
        rules=rules,
        shoe=shoe,
        dealer_hand=Hand(cards=dealer_cards),
        player_hands=(player_hand,),
    )
    return RoundState(
        game_state=game_state,
        player_hands=(player,),
        phase=phase,
        active_hand_index=None,
        dealer_check_result=DealerCheckResult.NOT_REQUIRED,
    )


def test_single_possible_rank_has_probability_one() -> None:
    draws = possible_draws(shoe_with_ranks(K=1))

    assert [(draw.rank, draw.count, draw.probability) for draw in draws] == [
        (Rank.KING, 1, 1.0)
    ]


def test_equal_and_unequal_rank_multiplicities_are_weighted() -> None:
    equal = possible_draws(shoe_with_ranks(K=1, **{"5": 1}))
    unequal = possible_draws(shoe_with_ranks(K=3, **{"5": 1}))

    assert [draw.probability for draw in equal] == [0.5, 0.5]
    assert [draw.probability for draw in unequal] == [0.25, 0.75]
    assert sum(draw.probability for draw in unequal) == 1.0


def test_successor_decrements_one_card_without_mutating_input() -> None:
    shoe = shoe_with_ranks(K=1)
    state = dealer_round(
        player_cards=(card(Rank.TEN), card(Rank.NINE, Suit.HEARTS)),
        dealer_cards=(card(Rank.SIX, Suit.DIAMONDS), card(Rank.TEN, Suit.CLUBS)),
        shoe=shoe,
    )
    draw = possible_draws(shoe)[0]

    successor = advance_dealer(state, draw.card)

    assert successor.game_state.shoe.exact_total == shoe.exact_total - 1
    assert successor.game_state.shoe.count(draw.card) == shoe.count(draw.card) - 1
    assert state.game_state.shoe == shoe


def test_terminal_outcome_has_probability_one() -> None:
    state = dealer_round(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.KING, Suit.HEARTS)),
        dealer_cards=(card(Rank.TEN, Suit.DIAMONDS), card(Rank.NINE, Suit.CLUBS)),
        shoe=shoe_with_ranks(**{"2": 1}),
        phase=RoundPhase.ROUND_COMPLETE,
    )

    result = evaluate_exact_reference(state)

    assert (result.win, result.push, result.loss, result.total) == (1.0, 0.0, 0.0, 1.0)


def test_small_recursive_tree_matches_hand_calculation() -> None:
    state = dealer_round(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.KING, Suit.HEARTS)),
        dealer_cards=(card(Rank.SIX, Suit.DIAMONDS), card(Rank.TEN, Suit.CLUBS)),
        shoe=shoe_with_ranks(**{"5": 1, "10": 1}),
    )

    first = evaluate_exact_reference(state)
    second = evaluate_exact_reference(state)

    assert first == second
    assert first.win == 0.5
    assert first.push == 0.0
    assert first.loss == 0.5
    assert first.total == 1.0


def test_latent_or_unknown_state_is_rejected() -> None:
    state = dealer_round(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.NINE)),
        dealer_cards=(card(Rank.SIX), card(Rank.TEN, Suit.CLUBS)),
        shoe=shoe_with_ranks(K=1),
    )
    latent_shoe = replace(state.game_state.shoe, unknown_removed_count=1)
    latent_state = replace(
        state,
        game_state=replace(state.game_state, shoe=latent_shoe),
    )

    with pytest.raises(ExactAnalysisError) as latent_error:
        evaluate_exact_reference(latent_state)
    assert latent_error.value.code == "exact_analysis_requires_resolved_hidden_composition"

    unknown_hand = Hand(cards=(card(Rank.TEN), UnknownCard()))
    unknown_state = replace(
        latent_state,
        game_state=replace(
            latent_state.game_state,
            player_hands=(unknown_hand,),
        ),
        player_hands=(replace(latent_state.player_hands[0], hand=unknown_hand),),
    )
    with pytest.raises(ExactAnalysisError) as unknown_error:
        evaluate_exact_reference(unknown_state)
    assert unknown_error.value.code == "exact_analysis_requires_resolved_hidden_composition"
