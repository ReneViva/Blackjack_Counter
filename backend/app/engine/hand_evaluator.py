from dataclasses import dataclass

from app.domain import (
    BlackjackValueClass,
    Card,
    Hand,
    Rank,
    UnknownCard,
    ValueOnlyCard,
    to_blackjack_value_class,
)


_VALUE_CLASS_HARD_VALUES = {
    BlackjackValueClass.ACE: 1,
    BlackjackValueClass.TWO: 2,
    BlackjackValueClass.THREE: 3,
    BlackjackValueClass.FOUR: 4,
    BlackjackValueClass.FIVE: 5,
    BlackjackValueClass.SIX: 6,
    BlackjackValueClass.SEVEN: 7,
    BlackjackValueClass.EIGHT: 8,
    BlackjackValueClass.NINE: 9,
    BlackjackValueClass.TEN: 10,
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

    cards = tuple(
        card
        for card in hand.cards
        if isinstance(card, (Card, ValueOnlyCard))
    )
    values = tuple(
        to_blackjack_value_class(card.rank)
        if isinstance(card, Card)
        else card.value
        for card in cards
    )
    total = sum(_VALUE_CLASS_HARD_VALUES[value] for value in values)
    ace_count = sum(value is BlackjackValueClass.ACE for value in values)
    soft = ace_count > 0 and total + 10 <= 21
    if soft:
        total += 10

    pair = (
        len(cards) == 2
        and all(isinstance(card, Card) for card in cards)
        and cards[0].rank is cards[1].rank
    )
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
