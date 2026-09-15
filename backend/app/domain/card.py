from dataclasses import dataclass
from enum import Enum
from typing import TypeAlias


class Rank(str, Enum):
    ACE = "A"
    TWO = "2"
    THREE = "3"
    FOUR = "4"
    FIVE = "5"
    SIX = "6"
    SEVEN = "7"
    EIGHT = "8"
    NINE = "9"
    TEN = "10"
    JACK = "J"
    QUEEN = "Q"
    KING = "K"


class BlackjackValueClass(str, Enum):
    ACE = "A"
    TWO = "2"
    THREE = "3"
    FOUR = "4"
    FIVE = "5"
    SIX = "6"
    SEVEN = "7"
    EIGHT = "8"
    NINE = "9"
    TEN = "10"


class Suit(str, Enum):
    SPADES = "S"
    HEARTS = "H"
    DIAMONDS = "D"
    CLUBS = "C"


@dataclass(frozen=True, slots=True)
class Card:
    rank: Rank
    suit: Suit

    def __post_init__(self) -> None:
        if not isinstance(self.rank, Rank):
            raise TypeError("rank must be a Rank")
        if not isinstance(self.suit, Suit):
            raise TypeError("suit must be a Suit")


@dataclass(frozen=True, slots=True)
class ValueOnlyCard:
    """A known blackjack value class without an exact rank or suit."""

    value: BlackjackValueClass

    def __post_init__(self) -> None:
        if not isinstance(self.value, BlackjackValueClass):
            raise TypeError("value must be a BlackjackValueClass")


@dataclass(frozen=True, slots=True)
class UnknownCard:
    """A physical card whose rank and suit have not been observed."""


CardObservation: TypeAlias = Card | ValueOnlyCard | UnknownCard
ObservedCard: TypeAlias = CardObservation


_RANK_VALUE_CLASSES: dict[Rank, BlackjackValueClass] = {
    Rank.ACE: BlackjackValueClass.ACE,
    Rank.TWO: BlackjackValueClass.TWO,
    Rank.THREE: BlackjackValueClass.THREE,
    Rank.FOUR: BlackjackValueClass.FOUR,
    Rank.FIVE: BlackjackValueClass.FIVE,
    Rank.SIX: BlackjackValueClass.SIX,
    Rank.SEVEN: BlackjackValueClass.SEVEN,
    Rank.EIGHT: BlackjackValueClass.EIGHT,
    Rank.NINE: BlackjackValueClass.NINE,
    Rank.TEN: BlackjackValueClass.TEN,
    Rank.JACK: BlackjackValueClass.TEN,
    Rank.QUEEN: BlackjackValueClass.TEN,
    Rank.KING: BlackjackValueClass.TEN,
}


def to_blackjack_value_class(rank: Rank) -> BlackjackValueClass:
    """Classify an exact rank without fabricating or removing a card."""

    if not isinstance(rank, Rank):
        raise TypeError("rank must be a Rank")
    return _RANK_VALUE_CLASSES[rank]


ALL_CARDS: tuple[Card, ...] = tuple(
    Card(rank=rank, suit=suit) for rank in Rank for suit in Suit
)
