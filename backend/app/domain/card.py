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
class UnknownCard:
    """A physical card whose rank and suit have not been observed."""


ObservedCard: TypeAlias = Card | UnknownCard

ALL_CARDS: tuple[Card, ...] = tuple(
    Card(rank=rank, suit=suit) for rank in Rank for suit in Suit
)
