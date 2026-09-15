from dataclasses import dataclass

from .card import (
    ALL_CARDS,
    BlackjackValueClass,
    Card,
    to_blackjack_value_class,
)


_CARD_INDEX = {card: index for index, card in enumerate(ALL_CARDS)}
_VALUE_CLASSES = tuple(BlackjackValueClass)
_VALUE_INDEX = {
    value: index for index, value in enumerate(_VALUE_CLASSES)
}


def blackjack_value_capacity(
    value: BlackjackValueClass,
    decks: int,
) -> int:
    if not isinstance(value, BlackjackValueClass):
        raise TypeError("value must be a BlackjackValueClass")
    if isinstance(decks, bool) or not isinstance(decks, int):
        raise TypeError("decks must be an integer")
    if not 1 <= decks <= 8:
        raise ValueError("decks must be between 1 and 8")
    multiplier = 16 if value is BlackjackValueClass.TEN else 4
    return decks * multiplier


@dataclass(frozen=True, slots=True)
class Shoe:
    """One physical shoe with exact slots and unassigned value-class removals.

    ``card_counts`` records identity-specific availability after exact
    observations. ``value_only_removed_counts`` records additional cards known
    only by blackjack value and therefore never selects a rank or suit slot.
    """

    decks: int
    card_counts: tuple[int, ...]
    unknown_removed_count: int = 0
    value_only_removed_counts: tuple[int, ...] = (0,) * len(_VALUE_CLASSES)

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
        if not isinstance(self.value_only_removed_counts, tuple):
            raise TypeError("value_only_removed_counts must be a tuple")
        if len(self.value_only_removed_counts) != len(_VALUE_CLASSES):
            raise ValueError(
                "value_only_removed_counts must contain exactly 10 entries"
            )
        if any(
            isinstance(count, bool) or not isinstance(count, int)
            for count in self.value_only_removed_counts
        ):
            raise TypeError("value-only removal counts must be integers")
        if any(count < 0 for count in self.value_only_removed_counts):
            raise ValueError("value-only removal counts cannot be negative")
        exact_value_counts = self._exact_value_counts()
        if any(
            removed > available
            for removed, available in zip(
                self.value_only_removed_counts,
                exact_value_counts,
                strict=True,
            )
        ):
            raise ValueError(
                "value-only removals exceed remaining value-class capacity"
            )
        if isinstance(self.unknown_removed_count, bool) or not isinstance(
            self.unknown_removed_count, int
        ):
            raise TypeError("unknown_removed_count must be an integer")
        if not 0 <= self.unknown_removed_count <= self.exact_total:
            raise ValueError(
                "unknown_removed_count must be between zero and remaining cards"
            )

    @classmethod
    def fresh(cls, decks: int) -> "Shoe":
        return cls(decks=decks, card_counts=(decks,) * len(ALL_CARDS))

    def _exact_value_counts(self) -> tuple[int, ...]:
        counts = [0] * len(_VALUE_CLASSES)
        for card, count in zip(ALL_CARDS, self.card_counts, strict=True):
            value = to_blackjack_value_class(card.rank)
            counts[_VALUE_INDEX[value]] += count
        return tuple(counts)

    @property
    def total_cards(self) -> int:
        return self.exact_total - self.unknown_removed_count

    @property
    def exact_total(self) -> int:
        """Cards left before wholly unknown removals are marginalized."""

        return sum(self.card_counts) - sum(self.value_only_removed_counts)

    @property
    def has_value_only_removals(self) -> bool:
        return any(self.value_only_removed_counts)

    @property
    def value_composition(
        self,
    ) -> tuple[tuple[BlackjackValueClass, int], ...]:
        return tuple(
            (value, available - removed)
            for value, available, removed in zip(
                _VALUE_CLASSES,
                self._exact_value_counts(),
                self.value_only_removed_counts,
                strict=True,
            )
        )

    @property
    def composition(self) -> tuple[tuple[Card, int], ...]:
        return tuple(zip(ALL_CARDS, self.card_counts, strict=True))

    def count(self, card: Card) -> int:
        if not isinstance(card, Card):
            raise TypeError("card must be a Card")
        return self.card_counts[_CARD_INDEX[card]]

    def value_count(self, value: BlackjackValueClass) -> int:
        if not isinstance(value, BlackjackValueClass):
            raise TypeError("value must be a BlackjackValueClass")
        return self.value_composition[_VALUE_INDEX[value]][1]
