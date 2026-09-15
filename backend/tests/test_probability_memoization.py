from dataclasses import replace

from app.domain import (
    ALL_CARDS,
    DealerSoft17,
    Hand,
    Rank,
    Rules,
    Shoe,
    Suit,
)
from app.probability import (
    canonical_round_key,
    canonical_shoe_key,
    evaluate_exact,
    evaluate_exact_reference,
)

from test_exact_probability import card, dealer_round, shoe_with_ranks


def repeated_subproblem_state():
    return dealer_round(
        player_cards=(card(Rank.TEN, Suit.HEARTS), card(Rank.KING, Suit.HEARTS)),
        dealer_cards=(card(Rank.TEN, Suit.CLUBS), card(Rank.TWO, Suit.HEARTS)),
        shoe=shoe_with_ranks(**{"2": 1, "3": 1, "K": 1}),
    )


def test_equivalent_card_orders_have_identical_canonical_keys() -> None:
    state = repeated_subproblem_state()
    reordered_player = replace(
        state.player_hands[0],
        hand=Hand(cards=tuple(reversed(state.player_hands[0].hand.cards))),
    )
    reordered = replace(
        state,
        game_state=replace(
            state.game_state,
            dealer_hand=Hand(cards=tuple(reversed(state.game_state.dealer_hand.cards))),
            player_hands=(reordered_player.hand,),
        ),
        player_hands=(reordered_player,),
    )

    assert canonical_round_key(state) == canonical_round_key(reordered)
    assert hash(canonical_round_key(state)) == hash(canonical_round_key(reordered))


def test_shoe_key_has_stable_rank_order_and_ignores_irrelevant_suit_identity() -> None:
    spade_counts = tuple(
        1 if card.rank in (Rank.TWO, Rank.THREE) and card.suit is Suit.SPADES else 0
        for card in ALL_CARDS
    )
    heart_counts = tuple(
        1 if card.rank in (Rank.TWO, Rank.THREE) and card.suit is Suit.HEARTS else 0
        for card in ALL_CARDS
    )

    assert canonical_shoe_key(Shoe(1, spade_counts)) == canonical_shoe_key(
        Shoe(1, heart_counts)
    )


def test_mathematically_different_states_have_different_keys() -> None:
    state = repeated_subproblem_state()
    different_shoe = replace(
        state,
        game_state=replace(
            state.game_state,
            shoe=shoe_with_ranks(**{"2": 1, "4": 1, "K": 1}),
        ),
    )
    different_rules = replace(
        state,
        game_state=replace(
            state.game_state,
            rules=Rules(decks=1, dealer_soft_17=DealerSoft17.HIT),
        ),
    )
    different_dealer = replace(
        state,
        game_state=replace(
            state.game_state,
            dealer_hand=Hand(
                cards=(card(Rank.TEN, Suit.CLUBS), card(Rank.THREE, Suit.HEARTS))
            ),
        ),
    )
    different_player = replace(
        state,
        player_hands=(replace(state.player_hands[0], split_depth=1),),
    )

    keys = {
        canonical_round_key(state),
        canonical_round_key(different_shoe),
        canonical_round_key(different_rules),
        canonical_round_key(different_dealer),
        canonical_round_key(different_player),
    }
    assert len(keys) == 5


def test_memoized_and_reference_results_are_identical() -> None:
    state = repeated_subproblem_state()

    reference = evaluate_exact_reference(state)
    memoized = evaluate_exact(state)

    assert memoized.outcomes == reference
    assert memoized.outcomes.total == 1.0
    assert memoized.metrics.states_evaluated == memoized.metrics.cache_misses
    assert memoized.metrics.cache_hits > 0


def test_cache_is_isolated_between_analyses() -> None:
    state = repeated_subproblem_state()

    first = evaluate_exact(state)
    second = evaluate_exact(state)

    assert first == second
    assert first.metrics.cache_hits > 0


def test_value_composition_is_part_of_generic_shoe_cache_key() -> None:
    ace_removed = Shoe(
        decks=1,
        card_counts=(1,) * 52,
        value_only_removed_counts=(1,) + (0,) * 9,
    )
    ten_removed = Shoe(
        decks=1,
        card_counts=(1,) * 52,
        value_only_removed_counts=(0,) * 9 + (1,),
    )

    assert canonical_shoe_key(ace_removed) != canonical_shoe_key(ten_removed)
    assert canonical_shoe_key(ace_removed) == canonical_shoe_key(ace_removed)
