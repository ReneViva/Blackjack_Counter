import pytest

from app.domain import Card, DealerSoft17, Hand, Rank, Rules, Suit, UnknownCard
from app.engine import DealerAction, dealer_action, evaluate_hand


def hand(*ranks: Rank) -> Hand:
    return Hand(cards=tuple(Card(rank=rank, suit=Suit.CLUBS) for rank in ranks))


def rules(soft_17: DealerSoft17) -> Rules:
    return Rules(decks=6, dealer_soft_17=soft_17)


@pytest.mark.parametrize("soft_17", list(DealerSoft17))
def test_dealer_hits_below_seventeen(soft_17: DealerSoft17) -> None:
    assert dealer_action(
        evaluate_hand(hand(Rank.TEN, Rank.SIX)),
        rules(soft_17),
    ) is DealerAction.HIT


@pytest.mark.parametrize("soft_17", list(DealerSoft17))
def test_dealer_stands_on_hard_seventeen(soft_17: DealerSoft17) -> None:
    assert dealer_action(
        evaluate_hand(hand(Rank.TEN, Rank.SEVEN)),
        rules(soft_17),
    ) is DealerAction.STAND


def test_soft_seventeen_follows_configured_rule() -> None:
    soft_seventeen = evaluate_hand(hand(Rank.ACE, Rank.SIX))

    assert dealer_action(
        soft_seventeen,
        rules(DealerSoft17.HIT),
    ) is DealerAction.HIT
    assert dealer_action(
        soft_seventeen,
        rules(DealerSoft17.STAND),
    ) is DealerAction.STAND


@pytest.mark.parametrize("soft_17", list(DealerSoft17))
def test_dealer_stands_above_seventeen_and_after_bust(
    soft_17: DealerSoft17,
) -> None:
    configured_rules = rules(soft_17)

    assert dealer_action(
        evaluate_hand(hand(Rank.TEN, Rank.EIGHT)),
        configured_rules,
    ) is DealerAction.STAND
    assert dealer_action(
        evaluate_hand(hand(Rank.KING, Rank.QUEEN, Rank.TWO)),
        configured_rules,
    ) is DealerAction.STAND


def test_unknown_hand_has_no_fabricated_legal_action() -> None:
    value = evaluate_hand(Hand(cards=(UnknownCard(), Card(Rank.SIX, Suit.CLUBS))))

    assert dealer_action(
        value,
        rules(DealerSoft17.HIT),
    ) is DealerAction.INDETERMINATE
