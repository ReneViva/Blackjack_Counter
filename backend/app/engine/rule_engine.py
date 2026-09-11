from dataclasses import dataclass
from enum import Enum

from app.domain import (
    Card,
    DealerCheckResult,
    DealerSoft17,
    HandStatus,
    PlayerAction,
    Rank,
    RoundPhase,
    RoundState,
    Rules,
    SurrenderRule,
)

from .hand_evaluator import HandValue, evaluate_hand


class DealerAction(str, Enum):
    HIT = "hit"
    STAND = "stand"
    INDETERMINATE = "indeterminate"


@dataclass(frozen=True, slots=True)
class ActionDecision:
    allowed: bool
    code: str | None = None
    message: str | None = None


def _reject(code: str, message: str) -> ActionDecision:
    return ActionDecision(allowed=False, code=code, message=message)


def player_action_decision(
    state: RoundState,
    action: PlayerAction,
) -> ActionDecision:
    if state.phase is not RoundPhase.PLAYER_TURNS:
        code = (
            "dealer_check_pending"
            if state.phase is RoundPhase.DEALER_CHECK
            else "wrong_phase"
        )
        return _reject(code, "Player actions require the player-turn phase.")
    index = state.active_hand_index
    if index is None or not 0 <= index < len(state.player_hands):
        return _reject("inactive_hand", "No valid player hand is active.")
    player = state.player_hands[index]
    if player.status is not HandStatus.ACTIVE:
        return _reject("terminal_hand", "The active hand is already terminal.")

    value = evaluate_hand(
        player.hand,
        split_origin=Rank.ACE if player.split_depth > 0 else None,
        blackjack_after_split=state.game_state.rules.blackjack_after_split,
    )
    if not value.determinate:
        return _reject(
            "hand_indeterminate",
            "Player action requires the hand's cards to be known.",
        )
    if value.bust or value.total == 21:
        return _reject("terminal_hand", "The active hand is already terminal.")

    rules = state.game_state.rules
    cards = player.hand.cards
    known_pair = (
        len(cards) == 2
        and all(isinstance(card, Card) for card in cards)
        and cards[0].rank is cards[1].rank
    )
    split_ace_lock = player.from_split_aces and not rules.hit_split_aces

    if action is PlayerAction.SPLIT:
        if not rules.splitting_enabled or player.decision_count != 0:
            return _reject("split_not_allowed", "Splitting is not allowed.")
        if not known_pair:
            return _reject(
                "split_not_allowed",
                "Splitting requires two known cards of the same rank.",
            )
        seat_hand_count = sum(
            hand.seat == player.seat for hand in state.player_hands
        )
        if seat_hand_count >= rules.max_split_hands:
            return _reject(
                "split_limit_reached",
                "The seat has reached its maximum number of split hands.",
            )
        assert isinstance(cards[0], Card)
        if (
            cards[0].rank is Rank.ACE
            and player.split_depth > 0
            and not rules.resplit_aces
        ):
            return _reject(
                "resplit_aces_not_allowed",
                "The configured rules do not allow resplitting Aces.",
            )
        return ActionDecision(allowed=True)

    if split_ace_lock:
        return _reject(
            "action_not_allowed",
            "This split-Ace hand may only be resplit.",
        )

    if action is PlayerAction.DOUBLE:
        if (
            not rules.doubling_enabled
            or len(cards) != 2
            or player.decision_count != 0
            or (player.split_depth > 0 and not rules.double_after_split)
        ):
            return _reject("double_not_allowed", "Doubling is not allowed.")
        return ActionDecision(allowed=True)

    if action is PlayerAction.SURRENDER:
        if (
            rules.surrender is not SurrenderRule.LATE
            or len(cards) != 2
            or player.decision_count != 0
            or player.split_depth != 0
            or state.dealer_check_result
            not in (
                DealerCheckResult.NOT_REQUIRED,
                DealerCheckResult.NO_BLACKJACK,
            )
        ):
            return _reject(
                "surrender_not_allowed",
                "Late surrender is not allowed for this hand.",
            )
        return ActionDecision(allowed=True)

    if action in (PlayerAction.HIT, PlayerAction.STAND):
        return ActionDecision(allowed=True)
    return _reject("action_not_allowed", "The player action is not supported.")


def dealer_action(hand_value: HandValue, rules: Rules) -> DealerAction:
    if not hand_value.determinate:
        return DealerAction.INDETERMINATE

    assert hand_value.total is not None
    if hand_value.bust or hand_value.blackjack:
        return DealerAction.STAND
    if hand_value.total < 17:
        return DealerAction.HIT
    if (
        hand_value.total == 17
        and hand_value.soft
        and rules.dealer_soft_17 is DealerSoft17.HIT
    ):
        return DealerAction.HIT
    return DealerAction.STAND
