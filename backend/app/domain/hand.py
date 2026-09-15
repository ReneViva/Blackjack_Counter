from dataclasses import dataclass

from .card import Card, ObservedCard, UnknownCard, ValueOnlyCard


@dataclass(frozen=True, slots=True)
class Hand:
    cards: tuple[ObservedCard, ...] = ()

    def __post_init__(self) -> None:
        if not isinstance(self.cards, tuple):
            raise TypeError("cards must be a tuple")
        if not all(
            isinstance(card, (Card, ValueOnlyCard, UnknownCard))
            for card in self.cards
        ):
            raise TypeError("cards must contain only observed cards")
