import pytest

from app.domain import Card, DealerSoft17, Hand, Rank, Rules, Suit, UnknownCard
from app.engine import DealerStatus, evaluate_dealer


def hand(*ranks: Rank) -> Hand:
    return Hand(cards=tuple(Card(rank=rank, suit=Suit.HEARTS) for rank in ranks))


def rules(soft_17: DealerSoft17) -> Rules:
    return Rules(decks=4, dealer_soft_17=soft_17)


@pytest.mark.parametrize("soft_17", list(DealerSoft17))
def test_below_seventeen_requires_hit(soft_17: DealerSoft17) -> None:
    state = evaluate_dealer(hand(Rank.NINE, Rank.SEVEN), rules(soft_17))

    assert state.status is DealerStatus.HIT_REQUIRED
    assert state.terminal is False


@pytest.mark.parametrize("soft_17", list(DealerSoft17))
def test_hard_seventeen_stands(soft_17: DealerSoft17) -> None:
    state = evaluate_dealer(hand(Rank.TEN, Rank.SEVEN), rules(soft_17))

    assert state.status is DealerStatus.STAND
    assert state.terminal is True


def test_soft_seventeen_respects_h17_and_s17() -> None:
    dealer_hand = hand(Rank.ACE, Rank.SIX)

    h17 = evaluate_dealer(dealer_hand, rules(DealerSoft17.HIT))
    s17 = evaluate_dealer(dealer_hand, rules(DealerSoft17.STAND))

    assert h17.status is DealerStatus.HIT_REQUIRED
    assert h17.terminal is False
    assert s17.status is DealerStatus.STAND
    assert s17.terminal is True


@pytest.mark.parametrize("soft_17", list(DealerSoft17))
def test_above_seventeen_stands(soft_17: DealerSoft17) -> None:
    state = evaluate_dealer(hand(Rank.TEN, Rank.NINE), rules(soft_17))

    assert state.status is DealerStatus.STAND
    assert state.terminal is True


def test_bust_and_blackjack_are_distinct_terminal_states() -> None:
    configured_rules = rules(DealerSoft17.STAND)

    bust = evaluate_dealer(
        hand(Rank.KING, Rank.QUEEN, Rank.TWO),
        configured_rules,
    )
    blackjack = evaluate_dealer(
        hand(Rank.ACE, Rank.KING),
        configured_rules,
    )

    assert bust.status is DealerStatus.BUST
    assert bust.terminal is True
    assert blackjack.status is DealerStatus.BLACKJACK
    assert blackjack.terminal is True


def test_unknown_dealer_hand_is_indeterminate_without_guessing() -> None:
    dealer_hand = Hand(
        cards=(Card(rank=Rank.SIX, suit=Suit.HEARTS), UnknownCard())
    )

    first = evaluate_dealer(dealer_hand, rules(DealerSoft17.HIT))
    second = evaluate_dealer(dealer_hand, rules(DealerSoft17.HIT))

    assert first == second
    assert first.status is DealerStatus.INDETERMINATE
    assert first.terminal is None
    assert first.hand_value.total is None
