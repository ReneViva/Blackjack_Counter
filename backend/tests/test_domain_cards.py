from dataclasses import FrozenInstanceError

import pytest

from app.domain import (
    ALL_CARDS,
    BlackjackValueClass,
    Card,
    CardObservation,
    ObservedCard,
    Rank,
    Suit,
    UnknownCard,
    ValueOnlyCard,
    to_blackjack_value_class,
)


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


def test_blackjack_value_classes_are_complete_and_canonical() -> None:
    assert tuple(value.value for value in BlackjackValueClass) == (
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
    )
    assert len(BlackjackValueClass) == 10


@pytest.mark.parametrize("invalid", ("J", "Q", "K", "1", "11", "ace", ""))
def test_blackjack_value_class_rejects_invalid_direct_values(invalid: str) -> None:
    with pytest.raises(ValueError):
        BlackjackValueClass(invalid)


@pytest.mark.parametrize(
    "rank,expected",
    [
        (Rank.ACE, BlackjackValueClass.ACE),
        (Rank.TWO, BlackjackValueClass.TWO),
        (Rank.THREE, BlackjackValueClass.THREE),
        (Rank.FOUR, BlackjackValueClass.FOUR),
        (Rank.FIVE, BlackjackValueClass.FIVE),
        (Rank.SIX, BlackjackValueClass.SIX),
        (Rank.SEVEN, BlackjackValueClass.SEVEN),
        (Rank.EIGHT, BlackjackValueClass.EIGHT),
        (Rank.NINE, BlackjackValueClass.NINE),
        (Rank.TEN, BlackjackValueClass.TEN),
        (Rank.JACK, BlackjackValueClass.TEN),
        (Rank.QUEEN, BlackjackValueClass.TEN),
        (Rank.KING, BlackjackValueClass.TEN),
    ],
)
def test_exact_rank_normalizes_to_blackjack_value_class(
    rank: Rank,
    expected: BlackjackValueClass,
) -> None:
    assert to_blackjack_value_class(rank) is expected


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
    value_only: ObservedCard = ValueOnlyCard(BlackjackValueClass.TEN)
    unknown: ObservedCard = UnknownCard()

    assert isinstance(known, Card)
    assert isinstance(value_only, ValueOnlyCard)
    assert isinstance(unknown, UnknownCard)
    assert value_only != known
    assert value_only != unknown
    assert known != unknown
    assert not hasattr(unknown, "rank")
    assert not hasattr(unknown, "suit")
    assert UnknownCard() == unknown
    assert hash(UnknownCard()) == hash(unknown)


def test_card_observation_distinguishes_all_three_precision_levels() -> None:
    exact: CardObservation = Card(rank=Rank.TEN, suit=Suit.DIAMONDS)
    value_only: CardObservation = ValueOnlyCard(BlackjackValueClass.TEN)
    unknown: CardObservation = UnknownCard()

    assert isinstance(exact, Card)
    assert isinstance(value_only, ValueOnlyCard)
    assert isinstance(unknown, UnknownCard)
    assert len({exact, value_only, unknown}) == 3
    assert value_only.value is BlackjackValueClass.TEN
    assert not hasattr(value_only, "rank")
    assert not hasattr(value_only, "suit")


def test_value_only_card_requires_a_domain_value_class() -> None:
    with pytest.raises(TypeError):
        ValueOnlyCard("10")  # type: ignore[arg-type]
