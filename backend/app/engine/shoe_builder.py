from collections.abc import Iterable

from app.domain import (
    ALL_CARDS,
    BlackjackValueClass,
    Card,
    Shoe,
    ValueOnlyCard,
)


_CARD_INDEX = {card: index for index, card in enumerate(ALL_CARDS)}


class StateReconstructionError(ValueError):
    pass


def build_shoe(
    decks: int,
    known_cards: Iterable[Card | ValueOnlyCard],
    unknown_removed_count: int = 0,
) -> Shoe:
    counts = [decks] * len(ALL_CARDS)
    observations = tuple(known_cards)

    for card in observations:
        if isinstance(card, ValueOnlyCard):
            continue
        if not isinstance(card, Card):
            raise TypeError("known_cards must contain known card observations")
        index = _CARD_INDEX[card]
        if counts[index] == 0:
            card_code = f"{card.rank.value}{card.suit.value}"
            raise StateReconstructionError(
                f"Cannot reconstruct shoe: too many observations of {card_code}"
            )
        counts[index] -= 1

    value_only_counts = [0] * len(BlackjackValueClass)
    for card in observations:
        if isinstance(card, ValueOnlyCard):
            value_only_counts[tuple(BlackjackValueClass).index(card.value)] += 1

    try:
        return Shoe(
            decks=decks,
            card_counts=tuple(counts),
            unknown_removed_count=unknown_removed_count,
            value_only_removed_counts=tuple(value_only_counts),
        )
    except (TypeError, ValueError) as error:
        detail = (
            "observations exceed physical shoe capacity"
            if any(isinstance(card, ValueOnlyCard) for card in observations)
            else "invalid unknown-card count"
        )
        raise StateReconstructionError(
            f"Cannot reconstruct shoe: {detail}"
        ) from error
