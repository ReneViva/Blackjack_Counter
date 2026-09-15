from dataclasses import FrozenInstanceError

import pytest

from app.domain import (
    ALL_CARDS,
    BlackjackValueClass,
    Card,
    Rank,
    Shoe,
    Suit,
    blackjack_value_capacity,
)


@pytest.mark.parametrize("decks", range(1, 9))
def test_fresh_shoe_has_complete_exact_multiplicity(decks: int) -> None:
    shoe = Shoe.fresh(decks)

    assert shoe.decks == decks
    assert shoe.total_cards == decks * 52
    assert len(shoe.card_counts) == 52
    assert len(shoe.composition) == 52
    assert {card for card, _ in shoe.composition} == set(ALL_CARDS)
    assert all(count == decks for _, count in shoe.composition)
    assert all(shoe.count(card) == decks for card in ALL_CARDS)


@pytest.mark.parametrize("decks", (-1, 0, 9))
def test_fresh_shoe_rejects_out_of_range_deck_counts(decks: int) -> None:
    with pytest.raises(ValueError):
        Shoe.fresh(decks)


@pytest.mark.parametrize("decks", (True, 1.0, "1"))
def test_fresh_shoe_rejects_non_integer_deck_counts(decks: object) -> None:
    with pytest.raises(TypeError):
        Shoe.fresh(decks)  # type: ignore[arg-type]


def test_shoe_rejects_invalid_composition_shape_and_counts() -> None:
    with pytest.raises(TypeError):
        Shoe(decks=1, card_counts=[1] * 52)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        Shoe(decks=1, card_counts=(1,) * 51)
    with pytest.raises(TypeError):
        Shoe(decks=1, card_counts=(True,) + (1,) * 51)
    with pytest.raises(ValueError):
        Shoe(decks=1, card_counts=(-1,) + (1,) * 51)
    with pytest.raises(ValueError):
        Shoe(decks=1, card_counts=(2,) + (1,) * 51)
    with pytest.raises(TypeError):
        Shoe(decks=1, card_counts=(1,) * 52, unknown_removed_count=True)
    with pytest.raises(ValueError):
        Shoe(decks=1, card_counts=(1,) * 52, unknown_removed_count=53)


def test_shoe_count_requires_an_exact_card() -> None:
    shoe = Shoe.fresh(1)

    with pytest.raises(TypeError):
        shoe.count(Rank.ACE)  # type: ignore[arg-type]


def test_shoe_is_an_immutable_hashable_value() -> None:
    shoe = Shoe.fresh(2)
    equivalent = Shoe.fresh(2)

    assert shoe == equivalent
    assert hash(shoe) == hash(equivalent)
    assert shoe.count(Card(rank=Rank.KING, suit=Suit.CLUBS)) == 2

    with pytest.raises(FrozenInstanceError):
        shoe.decks = 3  # type: ignore[misc]


@pytest.mark.parametrize("decks", (1, 8))
def test_blackjack_value_capacities_scale_by_deck_count(decks: int) -> None:
    shoe = Shoe.fresh(decks)

    for value in BlackjackValueClass:
        expected = decks * (16 if value is BlackjackValueClass.TEN else 4)
        assert blackjack_value_capacity(value, decks) == expected
        assert shoe.value_count(value) == expected


def test_value_only_removals_deplete_value_composition_without_exact_identity() -> None:
    removals = (1, 1, 1, 1, 1, 1, 1, 1, 1, 4)
    shoe = Shoe(
        decks=1,
        card_counts=(1,) * 52,
        value_only_removed_counts=removals,
    )

    assert tuple(count for _, count in shoe.value_composition) == (
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        12,
    )
    assert shoe.exact_total == 39
    assert shoe.total_cards == 39
    assert all(shoe.count(card) == 1 for card in ALL_CARDS)


def test_shoe_rejects_value_only_removal_beyond_remaining_class_capacity() -> None:
    with pytest.raises(ValueError):
        Shoe(
            decks=1,
            card_counts=(1,) * 52,
            value_only_removed_counts=(5,) + (0,) * 9,
        )
