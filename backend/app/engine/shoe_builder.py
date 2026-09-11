from collections.abc import Iterable

from app.domain import ALL_CARDS, Card, Shoe


_CARD_INDEX = {card: index for index, card in enumerate(ALL_CARDS)}


class StateReconstructionError(ValueError):
    pass


def build_shoe(decks: int, known_cards: Iterable[Card]) -> Shoe:
    counts = [decks] * len(ALL_CARDS)

    for card in known_cards:
        index = _CARD_INDEX[card]
        if counts[index] == 0:
            card_code = f"{card.rank.value}{card.suit.value}"
            raise StateReconstructionError(
                f"Cannot reconstruct shoe: too many observations of {card_code}"
            )
        counts[index] -= 1

    return Shoe(decks=decks, card_counts=tuple(counts))
