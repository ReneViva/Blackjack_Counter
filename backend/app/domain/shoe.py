from dataclasses import dataclass

from .card import ALL_CARDS, Card


_CARD_INDEX = {card: index for index, card in enumerate(ALL_CARDS)}


@dataclass(frozen=True, slots=True)
class Shoe:
    decks: int
    card_counts: tuple[int, ...]
    unknown_removed_count: int = 0

    def __post_init__(self) -> None:
        if isinstance(self.decks, bool) or not isinstance(self.decks, int):
            raise TypeError("decks must be an integer")
        if not 1 <= self.decks <= 8:
            raise ValueError("decks must be between 1 and 8")
        if not isinstance(self.card_counts, tuple):
            raise TypeError("card_counts must be a tuple")
        if len(self.card_counts) != len(ALL_CARDS):
            raise ValueError("card_counts must contain exactly 52 entries")
        if any(
            isinstance(count, bool) or not isinstance(count, int)
            for count in self.card_counts
        ):
            raise TypeError("card counts must be integers")
        if any(count < 0 or count > self.decks for count in self.card_counts):
            raise ValueError("card counts must be between zero and decks")
        if isinstance(self.unknown_removed_count, bool) or not isinstance(
            self.unknown_removed_count, int
        ):
            raise TypeError("unknown_removed_count must be an integer")
        if not 0 <= self.unknown_removed_count <= sum(self.card_counts):
            raise ValueError(
                "unknown_removed_count must be between zero and exact cards"
            )

    @classmethod
    def fresh(cls, decks: int) -> "Shoe":
        return cls(decks=decks, card_counts=(decks,) * len(ALL_CARDS))

    @property
    def total_cards(self) -> int:
        return sum(self.card_counts) - self.unknown_removed_count

    @property
    def exact_total(self) -> int:
        return sum(self.card_counts)

    @property
    def composition(self) -> tuple[tuple[Card, int], ...]:
        return tuple(zip(ALL_CARDS, self.card_counts, strict=True))

    def count(self, card: Card) -> int:
        if not isinstance(card, Card):
            raise TypeError("card must be a Card")
        return self.card_counts[_CARD_INDEX[card]]
