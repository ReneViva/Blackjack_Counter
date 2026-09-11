from dataclasses import FrozenInstanceError

import pytest

from app.domain import (
    Card,
    DealerSoft17,
    GameState,
    Hand,
    Outcome,
    Rank,
    Rules,
    Shoe,
    Suit,
    UnknownCard,
)


def test_hand_is_an_immutable_tuple_of_observed_cards() -> None:
    known = Card(rank=Rank.QUEEN, suit=Suit.DIAMONDS)
    unknown = UnknownCard()
    hand = Hand(cards=(known, unknown))

    assert hand.cards == (known, unknown)
    assert hash(hand) == hash(Hand(cards=(known, UnknownCard())))

    with pytest.raises(FrozenInstanceError):
        hand.cards = ()  # type: ignore[misc]


def test_hand_rejects_mutable_or_non_card_contents() -> None:
    with pytest.raises(TypeError):
        Hand(cards=[])  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        Hand(cards=("AS",))  # type: ignore[arg-type]


def test_hand_has_no_evaluation_properties() -> None:
    hand = Hand(
        cards=(
            Card(rank=Rank.ACE, suit=Suit.SPADES),
            Card(rank=Rank.KING, suit=Suit.HEARTS),
        )
    )

    for deferred_property in ("total", "soft", "hard", "blackjack", "bust"):
        assert not hasattr(hand, deferred_property)


def test_outcome_values_are_complete_and_canonical() -> None:
    assert tuple(outcome.value for outcome in Outcome) == ("win", "push", "loss")


def test_game_state_is_structural_immutable_and_hashable() -> None:
    rules = Rules(decks=6, dealer_soft_17=DealerSoft17.STAND)
    shoe = Shoe.fresh(6)
    dealer_hand = Hand(cards=(UnknownCard(),))
    player_hand = Hand(
        cards=(Card(rank=Rank.EIGHT, suit=Suit.CLUBS),)
    )
    state = GameState(
        rules=rules,
        shoe=shoe,
        dealer_hand=dealer_hand,
        player_hands=(player_hand,),
    )
    equivalent = GameState(
        rules=rules,
        shoe=shoe,
        dealer_hand=dealer_hand,
        player_hands=(player_hand,),
    )

    assert state == equivalent
    assert hash(state) == hash(equivalent)
    assert state.dealer_hand == dealer_hand
    assert state.player_hands == (player_hand,)

    with pytest.raises(FrozenInstanceError):
        state.player_hands = ()  # type: ignore[misc]


def test_game_state_rejects_inconsistent_deck_counts() -> None:
    rules = Rules(decks=6, dealer_soft_17=DealerSoft17.HIT)

    with pytest.raises(ValueError):
        GameState(rules=rules, shoe=Shoe.fresh(8))


def test_game_state_rejects_invalid_structural_values() -> None:
    rules = Rules(decks=1, dealer_soft_17=DealerSoft17.STAND)
    shoe = Shoe.fresh(1)

    with pytest.raises(TypeError):
        GameState(rules="rules", shoe=shoe)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        GameState(rules=rules, shoe="shoe")  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        GameState(rules=rules, shoe=shoe, dealer_hand=())  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        GameState(rules=rules, shoe=shoe, player_hands=[])  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        GameState(
            rules=rules,
            shoe=shoe,
            player_hands=("hand",),  # type: ignore[arg-type]
        )
