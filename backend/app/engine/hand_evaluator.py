from dataclasses import dataclass

from app.domain import Card, Hand, Rank, UnknownCard


_HARD_VALUES = {
    Rank.ACE: 1,
    Rank.TWO: 2,
    Rank.THREE: 3,
    Rank.FOUR: 4,
    Rank.FIVE: 5,
    Rank.SIX: 6,
    Rank.SEVEN: 7,
    Rank.EIGHT: 8,
    Rank.NINE: 9,
    Rank.TEN: 10,
    Rank.JACK: 10,
    Rank.QUEEN: 10,
    Rank.KING: 10,
}


@dataclass(frozen=True, slots=True)
class HandValue:
    total: int | None
    soft: bool | None
    bust: bool | None
    blackjack: bool | None
    pair: bool | None
    split_origin: Rank | None = None

    @property
    def determinate(self) -> bool:
        return self.total is not None

    @property
    def ordinary_twenty_one(self) -> bool | None:
        if not self.determinate:
            return None
        return self.total == 21 and not self.blackjack


def evaluate_hand(
    hand: Hand,
    *,
    split_origin: Rank | None = None,
    blackjack_after_split: bool = False,
) -> HandValue:
    if any(isinstance(card, UnknownCard) for card in hand.cards):
        return HandValue(
            total=None,
            soft=None,
            bust=None,
            blackjack=None,
            pair=None,
            split_origin=split_origin,
        )

    cards = tuple(card for card in hand.cards if isinstance(card, Card))
    total = sum(_HARD_VALUES[card.rank] for card in cards)
    ace_count = sum(card.rank is Rank.ACE for card in cards)
    soft = ace_count > 0 and total + 10 <= 21
    if soft:
        total += 10

    pair = len(cards) == 2 and cards[0].rank is cards[1].rank
    blackjack = (
        len(cards) == 2
        and total == 21
        and ace_count == 1
        and (split_origin is None or blackjack_after_split)
    )

    return HandValue(
        total=total,
        soft=soft,
        bust=total > 21,
        blackjack=blackjack,
        pair=pair,
        split_origin=split_origin,
    )
