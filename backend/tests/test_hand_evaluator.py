import pytest

from app.domain import Card, Hand, Rank, Suit, UnknownCard
from app.engine import evaluate_hand


def card(rank: Rank) -> Card:
    return Card(rank=rank, suit=Suit.SPADES)


@pytest.mark.parametrize(
    "ranks,total,soft,bust",
    [
        ((Rank.TEN, Rank.KING), 20, False, False),
        ((Rank.ACE, Rank.SIX), 17, True, False),
        ((Rank.ACE, Rank.SIX, Rank.NINE), 16, False, False),
        ((Rank.ACE, Rank.ACE, Rank.NINE), 21, True, False),
        ((Rank.ACE, Rank.ACE, Rank.NINE, Rank.KING), 21, False, False),
        ((Rank.KING, Rank.QUEEN, Rank.TWO), 22, False, True),
        ((), 0, False, False),
    ],
)
def test_hand_totals_handle_aces_dynamically(
    ranks: tuple[Rank, ...],
    total: int,
    soft: bool,
    bust: bool,
) -> None:
    value = evaluate_hand(Hand(cards=tuple(card(rank) for rank in ranks)))

    assert value.total == total
    assert value.soft is soft
    assert value.bust is bust
    assert value.determinate


def test_natural_blackjack_is_distinct_from_ordinary_twenty_one() -> None:
    blackjack = evaluate_hand(Hand(cards=(card(Rank.ACE), card(Rank.KING))))
    ordinary = evaluate_hand(
        Hand(cards=(card(Rank.SEVEN), card(Rank.SEVEN), card(Rank.SEVEN)))
    )

    assert blackjack.blackjack is True
    assert blackjack.ordinary_twenty_one is False
    assert ordinary.blackjack is False
    assert ordinary.ordinary_twenty_one is True


def test_two_card_twenty_one_after_split_is_not_a_natural() -> None:
    value = evaluate_hand(
        Hand(cards=(card(Rank.ACE), card(Rank.KING))),
        split_origin=Rank.ACE,
    )

    assert value.total == 21
    assert value.blackjack is False
    assert value.ordinary_twenty_one is True
    assert value.split_origin is Rank.ACE


def test_pair_requires_two_cards_of_the_same_rank() -> None:
    pair = evaluate_hand(Hand(cards=(card(Rank.EIGHT), card(Rank.EIGHT))))
    unequal_ten_values = evaluate_hand(
        Hand(cards=(card(Rank.TEN), card(Rank.KING)))
    )
    three_cards = evaluate_hand(
        Hand(cards=(card(Rank.FIVE), card(Rank.FIVE), card(Rank.FIVE)))
    )

    assert pair.pair is True
    assert unequal_ten_values.pair is False
    assert three_cards.pair is False


def test_unknown_card_makes_exact_evaluation_indeterminate() -> None:
    hand = Hand(cards=(card(Rank.TEN), UnknownCard()))

    first = evaluate_hand(hand)
    second = evaluate_hand(hand)

    assert first == second
    assert not first.determinate
    assert first.total is None
    assert first.soft is None
    assert first.bust is None
    assert first.blackjack is None
    assert first.pair is None
