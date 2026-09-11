from dataclasses import FrozenInstanceError

import pytest

from app.domain import ALL_CARDS, Card, ObservedCard, Rank, Suit, UnknownCard


def test_rank_values_are_complete_and_canonical() -> None:
    assert tuple(rank.value for rank in Rank) == (
        "A",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "J",
        "Q",
        "K",
    )
    assert len(Rank) == 13


def test_rank_rejects_an_invalid_value() -> None:
    with pytest.raises(ValueError):
        Rank("T")


def test_suit_values_are_complete_and_canonical() -> None:
    assert tuple(suit.value for suit in Suit) == ("S", "H", "D", "C")
    assert len(Suit) == 4


def test_suit_rejects_an_invalid_value() -> None:
    with pytest.raises(ValueError):
        Suit("clubs")


def test_card_requires_domain_rank_and_suit_values() -> None:
    card = Card(rank=Rank.KING, suit=Suit.HEARTS)

    assert card.rank is Rank.KING
    assert card.suit is Suit.HEARTS

    with pytest.raises(TypeError):
        Card(rank="K", suit=Suit.HEARTS)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        Card(rank=Rank.KING, suit="H")  # type: ignore[arg-type]


def test_cards_have_immutable_value_equality_and_hashing() -> None:
    first = Card(rank=Rank.ACE, suit=Suit.SPADES)
    equivalent = Card(rank=Rank.ACE, suit=Suit.SPADES)
    different_rank = Card(rank=Rank.KING, suit=Suit.SPADES)
    different_suit = Card(rank=Rank.ACE, suit=Suit.HEARTS)

    assert first == equivalent
    assert first != different_rank
    assert first != different_suit
    assert hash(first) == hash(equivalent)
    assert {first, equivalent, different_rank, different_suit} == {
        first,
        different_rank,
        different_suit,
    }
    assert {first: "known"}[equivalent] == "known"

    with pytest.raises(FrozenInstanceError):
        first.rank = Rank.KING  # type: ignore[misc]


def test_card_space_contains_52_unique_exact_cards() -> None:
    expected = {
        Card(rank=rank, suit=suit) for rank in Rank for suit in Suit
    }

    assert len(ALL_CARDS) == 52
    assert len(set(ALL_CARDS)) == 52
    assert set(ALL_CARDS) == expected


def test_observed_card_distinguishes_known_and_unknown_cards() -> None:
    known: ObservedCard = Card(rank=Rank.TEN, suit=Suit.DIAMONDS)
    unknown: ObservedCard = UnknownCard()

    assert isinstance(known, Card)
    assert isinstance(unknown, UnknownCard)
    assert known != unknown
    assert not hasattr(unknown, "rank")
    assert not hasattr(unknown, "suit")
    assert UnknownCard() == unknown
    assert hash(UnknownCard()) == hash(unknown)
