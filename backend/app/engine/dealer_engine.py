from dataclasses import dataclass
from enum import Enum

from app.domain import Hand, Rules

from .hand_evaluator import HandValue, evaluate_hand
from .rule_engine import DealerAction, dealer_action


class DealerStatus(str, Enum):
    HIT_REQUIRED = "hit_required"
    STAND = "stand"
    BLACKJACK = "blackjack"
    BUST = "bust"
    INDETERMINATE = "indeterminate"


@dataclass(frozen=True, slots=True)
class DealerState:
    hand_value: HandValue
    status: DealerStatus
    terminal: bool | None


def evaluate_dealer(hand: Hand, rules: Rules) -> DealerState:
    hand_value = evaluate_hand(hand)
    action = dealer_action(hand_value, rules)

    if action is DealerAction.INDETERMINATE:
        return DealerState(
            hand_value=hand_value,
            status=DealerStatus.INDETERMINATE,
            terminal=None,
        )
    if hand_value.bust:
        return DealerState(
            hand_value=hand_value,
            status=DealerStatus.BUST,
            terminal=True,
        )
    if hand_value.blackjack:
        return DealerState(
            hand_value=hand_value,
            status=DealerStatus.BLACKJACK,
            terminal=True,
        )
    if action is DealerAction.HIT:
        return DealerState(
            hand_value=hand_value,
            status=DealerStatus.HIT_REQUIRED,
            terminal=False,
        )
    return DealerState(
        hand_value=hand_value,
        status=DealerStatus.STAND,
        terminal=True,
    )
