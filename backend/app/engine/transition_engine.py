from dataclasses import dataclass, replace
from typing import Literal

from app.domain import (
    ALL_CARDS,
    Card,
    DealerBlackjackCheckRule,
    DealerCheckResult,
    DealerSecondCardRule,
    GameState,
    Hand,
    HandStatus,
    ObservedCard,
    Outcome,
    PlayerAction,
    PlayerHandState,
    Rank,
    RoundPhase,
    RoundState,
    Shoe,
    UnknownCard,
)

from .dealer_engine import DealerStatus, evaluate_dealer
from .hand_evaluator import evaluate_hand
from .rule_engine import player_action_decision
from .validator import validate_game_state, validate_round_state


_CARD_INDEX = {card: index for index, card in enumerate(ALL_CARDS)}
_CHECK_UPCARDS = {Rank.ACE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING}


@dataclass(frozen=True, slots=True)
class DrawTarget:
    kind: Literal["dealer", "player"]
    player_index: int | None = None

    def __post_init__(self) -> None:
        if self.kind not in ("dealer", "player"):
            raise ValueError("draw target kind must be dealer or player")
        if self.kind == "dealer" and self.player_index is not None:
            raise ValueError("dealer target cannot include a player index")
        if self.kind == "player" and self.player_index is None:
            raise ValueError("player target requires a player index")
        if self.player_index is not None and (
            isinstance(self.player_index, bool)
            or not isinstance(self.player_index, int)
        ):
            raise TypeError("player index must be an integer")

    @classmethod
    def dealer(cls) -> "DrawTarget":
        return cls(kind="dealer")

    @classmethod
    def player(cls, index: int) -> "DrawTarget":
        return cls(kind="player", player_index=index)


@dataclass(frozen=True, slots=True)
class RevealTarget:
    kind: Literal["dealer", "player"]
    card_index: int
    player_index: int | None = None

    def __post_init__(self) -> None:
        if self.kind not in ("dealer", "player"):
            raise ValueError("reveal target kind must be dealer or player")
        for name, value in (
            ("card_index", self.card_index),
            ("player_index", self.player_index),
        ):
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, int)
            ):
                raise TypeError(f"{name} must be an integer")
        if self.card_index < 0:
            raise ValueError("card_index cannot be negative")
        if self.kind == "dealer" and self.player_index is not None:
            raise ValueError("dealer target cannot include a player index")
        if self.kind == "player" and self.player_index is None:
            raise ValueError("player target requires a player index")

    @classmethod
    def dealer(cls, card_index: int) -> "RevealTarget":
        return cls(kind="dealer", card_index=card_index)

    @classmethod
    def player(cls, player_index: int, card_index: int) -> "RevealTarget":
        return cls(
            kind="player",
            player_index=player_index,
            card_index=card_index,
        )


class TransitionError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _invalid_source(message: str) -> TransitionError:
    return TransitionError("invalid_source_state", message)


def _remove_observed_card(shoe: Shoe, card: ObservedCard) -> Shoe:
    if shoe.total_cards == 0:
        code = (
            "unknown_removal_unavailable"
            if isinstance(card, UnknownCard)
            else "card_unavailable"
        )
        raise TransitionError(code, "No physical card remains in the shoe.")
    if isinstance(card, UnknownCard):
        try:
            return replace(
                shoe,
                unknown_removed_count=shoe.unknown_removed_count + 1,
            )
        except ValueError as error:
            raise TransitionError(
                "unknown_removal_unavailable",
                "No physical card remains for an unknown observation.",
            ) from error

    index = _CARD_INDEX[card]
    if shoe.card_counts[index] == 0:
        raise TransitionError(
            "card_unavailable",
            f"No {card.rank.value}{card.suit.value} remains in the shoe.",
        )
    counts = list(shoe.card_counts)
    counts[index] -= 1
    return replace(shoe, card_counts=tuple(counts))


def _reveal_from_shoe(shoe: Shoe, card: Card) -> Shoe:
    if shoe.unknown_removed_count == 0:
        raise TransitionError(
            "unknown_removal_unavailable",
            "No latent unknown removal is available to reveal.",
        )
    index = _CARD_INDEX[card]
    if shoe.card_counts[index] == 0:
        raise TransitionError(
            "card_unavailable",
            f"No {card.rank.value}{card.suit.value} remains in the shoe.",
        )
    counts = list(shoe.card_counts)
    counts[index] -= 1
    return replace(
        shoe,
        card_counts=tuple(counts),
        unknown_removed_count=shoe.unknown_removed_count - 1,
    )


def _append_card(hand: Hand, card: ObservedCard) -> Hand:
    return Hand(cards=(*hand.cards, card))


def _replace_card(hand: Hand, card_index: int, card: Card) -> Hand:
    if not 0 <= card_index < len(hand.cards):
        raise TransitionError(
            "reveal_target_not_unknown",
            "The reveal card index does not exist.",
        )
    if not isinstance(hand.cards[card_index], UnknownCard):
        raise TransitionError(
            "reveal_target_not_unknown",
            "The reveal target is not an unknown card.",
        )
    cards = list(hand.cards)
    cards[card_index] = card
    return Hand(cards=tuple(cards))


def draw_transition(
    state: GameState,
    target: DrawTarget,
    card: ObservedCard,
) -> GameState:
    """Compatibility transition for structural state only."""
    validation = validate_game_state(state)
    if not validation.valid:
        raise _invalid_source(validation.errors[0].message)

    if target.kind == "dealer":
        dealer_state = evaluate_dealer(state.dealer_hand, state.rules)
        if dealer_state.status is DealerStatus.INDETERMINATE:
            raise TransitionError(
                "dealer_action_indeterminate",
                "Dealer action cannot be determined from unknown cards.",
            )
        if dealer_state.status is not DealerStatus.HIT_REQUIRED:
            raise TransitionError(
                "dealer_hit_not_required",
                "Dealer rules do not require another card.",
            )
        dealer_hand = _append_card(state.dealer_hand, card)
        player_hands = state.player_hands
    else:
        assert target.player_index is not None
        if not 0 <= target.player_index < len(state.player_hands):
            raise TransitionError(
                "player_index_out_of_range",
                f"Player hand index {target.player_index} does not exist.",
            )
        hands = list(state.player_hands)
        hands[target.player_index] = _append_card(
            hands[target.player_index], card
        )
        dealer_hand = state.dealer_hand
        player_hands = tuple(hands)

    return GameState(
        rules=state.rules,
        shoe=_remove_observed_card(state.shoe, card),
        dealer_hand=dealer_hand,
        player_hands=player_hands,
    )


def _initial_hand_state(seat: int, hand: Hand) -> PlayerHandState:
    value = evaluate_hand(hand)
    if value.determinate and value.bust:
        status = HandStatus.BUST
    elif value.determinate and value.blackjack:
        status = HandStatus.BLACKJACK
    elif value.determinate and value.total == 21:
        status = HandStatus.STOOD
    else:
        status = HandStatus.ACTIVE
    return PlayerHandState(seat=seat, hand=hand, status=status)


def _dealer_check_required(state: GameState) -> bool:
    rules = state.rules
    cards = state.dealer_hand.cards
    return (
        rules.dealer_second_card is DealerSecondCardRule.HOLE_CARD
        and rules.dealer_blackjack_check is DealerBlackjackCheckRule.PEEK
        and len(cards) >= 2
        and isinstance(cards[0], Card)
        and cards[0].rank in _CHECK_UPCARDS
        and isinstance(cards[1], UnknownCard)
    )


def _terminalize_active_hands(
    hands: tuple[PlayerHandState, ...],
) -> tuple[PlayerHandState, ...]:
    return tuple(
        replace(hand, status=HandStatus.STOOD)
        if hand.status is HandStatus.ACTIVE
        else hand
        for hand in hands
    )


def start_round(
    game_state: GameState,
    seats: tuple[int, ...] | None = None,
) -> RoundState:
    validation = validate_game_state(game_state)
    if not validation.valid:
        raise _invalid_source(validation.errors[0].message)
    if seats is None:
        seats = tuple(range(1, len(game_state.player_hands) + 1))
    if len(seats) != len(game_state.player_hands):
        raise TransitionError(
            "invalid_seat_metadata",
            "One seat identifier is required for each player hand.",
        )
    if any(
        isinstance(seat, bool) or not isinstance(seat, int) or not 1 <= seat <= 7
        for seat in seats
    ):
        raise TransitionError(
            "invalid_seat_metadata",
            "Seat identifiers must be integers from 1 through 7.",
        )
    if len(set(seats)) != len(seats):
        raise TransitionError(
            "invalid_seat_metadata",
            "Initial player seat identifiers must be unique.",
        )

    hands = tuple(
        _initial_hand_state(seat, hand)
        for seat, hand in zip(seats, game_state.player_hands, strict=True)
    )
    dealer = evaluate_dealer(game_state.dealer_hand, game_state.rules)
    if dealer.status is DealerStatus.BLACKJACK:
        return RoundState(
            game_state=game_state,
            player_hands=_terminalize_active_hands(hands),
            phase=RoundPhase.ROUND_COMPLETE,
            active_hand_index=None,
            dealer_check_result=DealerCheckResult.NOT_REQUIRED,
        )
    if _dealer_check_required(game_state):
        return RoundState(
            game_state=game_state,
            player_hands=hands,
            phase=RoundPhase.DEALER_CHECK,
            active_hand_index=None,
            dealer_check_result=DealerCheckResult.PENDING,
        )
    first_active = next(
        (index for index, hand in enumerate(hands) if hand.status is HandStatus.ACTIVE),
        None,
    )
    if first_active is None:
        terminal_hands = _terminalize_active_hands(hands)
        surviving = any(
            hand.status not in (HandStatus.BUST, HandStatus.SURRENDERED)
            for hand in terminal_hands
        )
        return RoundState(
            game_state=game_state,
            player_hands=terminal_hands,
            phase=(RoundPhase.DEALER_TURN if surviving else RoundPhase.ROUND_COMPLETE),
            active_hand_index=None,
            dealer_check_result=DealerCheckResult.NOT_REQUIRED,
        )
    return RoundState(
        game_state=game_state,
        player_hands=hands,
        phase=RoundPhase.PLAYER_TURNS,
        active_hand_index=first_active,
        dealer_check_result=DealerCheckResult.NOT_REQUIRED,
    )


def _validate_round_source(state: RoundState) -> None:
    validation = validate_round_state(state)
    if not validation.valid:
        raise _invalid_source(validation.errors[0].message)


def resolve_dealer_check(
    state: RoundState,
    result: DealerCheckResult,
) -> RoundState:
    _validate_round_source(state)
    if state.phase is not RoundPhase.DEALER_CHECK:
        raise TransitionError(
            "dealer_check_not_pending",
            "Dealer check resolution requires the dealer-check phase.",
        )
    if result not in (
        DealerCheckResult.NO_BLACKJACK,
        DealerCheckResult.BLACKJACK,
    ):
        raise TransitionError(
            "invalid_dealer_check_result",
            "Dealer check must resolve to blackjack or no blackjack.",
        )
    if result is DealerCheckResult.BLACKJACK:
        return replace(
            state,
            player_hands=_terminalize_active_hands(state.player_hands),
            phase=RoundPhase.ROUND_COMPLETE,
            active_hand_index=None,
            dealer_check_result=result,
        )
    first_active = next(
        (
            index
            for index, hand in enumerate(state.player_hands)
            if hand.status is HandStatus.ACTIVE
        ),
        None,
    )
    if first_active is None:
        surviving = any(
            hand.status not in (HandStatus.BUST, HandStatus.SURRENDERED)
            for hand in state.player_hands
        )
        return replace(
            state,
            phase=(RoundPhase.DEALER_TURN if surviving else RoundPhase.ROUND_COMPLETE),
            active_hand_index=None,
            dealer_check_result=result,
        )
    return replace(
        state,
        phase=RoundPhase.PLAYER_TURNS,
        active_hand_index=first_active,
        dealer_check_result=result,
    )


def _require_player_action(state: RoundState, action: PlayerAction) -> int:
    _validate_round_source(state)
    decision = player_action_decision(state, action)
    if not decision.allowed:
        raise TransitionError(
            decision.code or "action_not_allowed",
            decision.message or "The action is not allowed.",
        )
    assert state.active_hand_index is not None
    return state.active_hand_index


def _with_player_hands(
    state: RoundState,
    hands: tuple[PlayerHandState, ...],
    shoe: Shoe | None = None,
) -> RoundState:
    game_state = replace(
        state.game_state,
        shoe=shoe if shoe is not None else state.game_state.shoe,
        player_hands=tuple(hand.hand for hand in hands),
    )
    return replace(state, game_state=game_state, player_hands=hands)


def _status_after_card_with_rules(
    player: PlayerHandState,
    state: RoundState,
) -> HandStatus:
    value = evaluate_hand(
        player.hand,
        split_origin=Rank.ACE if player.split_depth > 0 else None,
        blackjack_after_split=state.game_state.rules.blackjack_after_split,
    )
    if not value.determinate:
        return HandStatus.ACTIVE
    if value.bust:
        return HandStatus.BUST
    if value.blackjack:
        return HandStatus.BLACKJACK
    if value.total == 21:
        return HandStatus.STOOD
    return HandStatus.ACTIVE


def _advance_after_terminal(state: RoundState, completed_index: int) -> RoundState:
    next_index = next(
        (
            index
            for index in range(completed_index + 1, len(state.player_hands))
            if state.player_hands[index].status is HandStatus.ACTIVE
        ),
        None,
    )
    if next_index is not None:
        return replace(state, active_hand_index=next_index)
    all_lost = all(
        hand.status in (HandStatus.BUST, HandStatus.SURRENDERED)
        for hand in state.player_hands
    )
    return replace(
        state,
        phase=(RoundPhase.ROUND_COMPLETE if all_lost else RoundPhase.DEALER_TURN),
        active_hand_index=None,
    )


def player_hit(state: RoundState, card: ObservedCard) -> RoundState:
    index = _require_player_action(state, PlayerAction.HIT)
    player = state.player_hands[index]
    updated = replace(
        player,
        hand=_append_card(player.hand, card),
        decision_count=player.decision_count + 1,
    )
    updated = replace(updated, status=_status_after_card_with_rules(updated, state))
    hands = list(state.player_hands)
    hands[index] = updated
    result = _with_player_hands(
        state,
        tuple(hands),
        _remove_observed_card(state.game_state.shoe, card),
    )
    return (
        _advance_after_terminal(result, index)
        if updated.status is not HandStatus.ACTIVE
        else result
    )


def player_stand(state: RoundState) -> RoundState:
    index = _require_player_action(state, PlayerAction.STAND)
    hands = list(state.player_hands)
    hands[index] = replace(
        hands[index],
        status=HandStatus.STOOD,
        decision_count=hands[index].decision_count + 1,
    )
    return _advance_after_terminal(_with_player_hands(state, tuple(hands)), index)


def player_double(state: RoundState, card: ObservedCard) -> RoundState:
    index = _require_player_action(state, PlayerAction.DOUBLE)
    player = state.player_hands[index]
    updated = replace(
        player,
        hand=_append_card(player.hand, card),
        decision_count=player.decision_count + 1,
        doubled=True,
    )
    evaluated_status = _status_after_card_with_rules(updated, state)
    if evaluated_status is HandStatus.ACTIVE:
        evaluated_status = HandStatus.STOOD
    updated = replace(updated, status=evaluated_status)
    hands = list(state.player_hands)
    hands[index] = updated
    result = _with_player_hands(
        state,
        tuple(hands),
        _remove_observed_card(state.game_state.shoe, card),
    )
    return _advance_after_terminal(result, index)


def player_surrender(state: RoundState) -> RoundState:
    index = _require_player_action(state, PlayerAction.SURRENDER)
    hands = list(state.player_hands)
    hands[index] = replace(hands[index], status=HandStatus.SURRENDERED)
    return _advance_after_terminal(_with_player_hands(state, tuple(hands)), index)


def _split_child_status(
    state: RoundState,
    child: PlayerHandState,
    seat_hand_count: int,
) -> HandStatus:
    rules = state.game_state.rules
    if child.from_split_aces and not rules.hit_split_aces:
        cards = child.hand.cards
        can_resplit = (
            rules.resplit_aces
            and seat_hand_count < rules.max_split_hands
            and len(cards) == 2
            and all(isinstance(card, Card) for card in cards)
            and cards[0].rank is Rank.ACE
            and cards[1].rank is Rank.ACE
        )
        if can_resplit:
            return HandStatus.ACTIVE
        value = evaluate_hand(
            child.hand,
            split_origin=Rank.ACE,
            blackjack_after_split=rules.blackjack_after_split,
        )
        return HandStatus.BLACKJACK if value.blackjack else HandStatus.STOOD
    return _status_after_card_with_rules(child, state)


def player_split(
    state: RoundState,
    left_draw: ObservedCard,
    right_draw: ObservedCard,
) -> RoundState:
    index = _require_player_action(state, PlayerAction.SPLIT)
    parent = state.player_hands[index]
    left_card, right_card = parent.hand.cards
    assert isinstance(left_card, Card) and isinstance(right_card, Card)
    depth = parent.split_depth + 1
    split_aces = left_card.rank is Rank.ACE
    left = PlayerHandState(
        seat=parent.seat,
        hand=Hand(cards=(left_card, left_draw)),
        split_depth=depth,
        from_split_aces=parent.from_split_aces or split_aces,
    )
    right = PlayerHandState(
        seat=parent.seat,
        hand=Hand(cards=(right_card, right_draw)),
        split_depth=depth,
        from_split_aces=parent.from_split_aces or split_aces,
    )
    new_seat_count = sum(
        hand.seat == parent.seat for hand in state.player_hands
    ) + 1
    left = replace(left, status=_split_child_status(state, left, new_seat_count))
    right = replace(right, status=_split_child_status(state, right, new_seat_count))
    hands = (
        *state.player_hands[:index],
        left,
        right,
        *state.player_hands[index + 1 :],
    )
    if split_aces and not state.game_state.rules.hit_split_aces:
        seat_count = sum(hand.seat == parent.seat for hand in hands)
        if seat_count >= state.game_state.rules.max_split_hands:
            hands = tuple(
                replace(hand, status=HandStatus.STOOD)
                if (
                    hand.seat == parent.seat
                    and hand.from_split_aces
                    and hand.status is HandStatus.ACTIVE
                )
                else hand
                for hand in hands
            )
    shoe = _remove_observed_card(state.game_state.shoe, left_draw)
    shoe = _remove_observed_card(shoe, right_draw)
    result = _with_player_hands(state, hands, shoe)
    if left.status is HandStatus.ACTIVE:
        return replace(result, active_hand_index=index)
    return _advance_after_terminal(result, index)


def advance_dealer(
    state: RoundState,
    card: ObservedCard | None = None,
) -> RoundState:
    _validate_round_source(state)
    if state.phase is not RoundPhase.DEALER_TURN:
        raise TransitionError(
            "wrong_phase", "Dealer advancement requires the dealer-turn phase."
        )
    dealer = evaluate_dealer(state.game_state.dealer_hand, state.game_state.rules)
    if dealer.status is DealerStatus.INDETERMINATE:
        raise TransitionError(
            "hand_indeterminate",
            "Dealer progression requires unknown observations to be revealed.",
        )
    if dealer.status is DealerStatus.HIT_REQUIRED:
        if card is None:
            raise TransitionError(
                "action_not_allowed",
                "A dealer hit requires one explicit observed card.",
            )
        game_state = replace(
            state.game_state,
            shoe=_remove_observed_card(state.game_state.shoe, card),
            dealer_hand=_append_card(state.game_state.dealer_hand, card),
        )
        result = replace(state, game_state=game_state)
        after = evaluate_dealer(game_state.dealer_hand, game_state.rules)
        if after.status in (
            DealerStatus.STAND,
            DealerStatus.BLACKJACK,
            DealerStatus.BUST,
        ):
            return replace(result, phase=RoundPhase.ROUND_COMPLETE)
        return result
    if card is not None:
        raise TransitionError(
            "action_not_allowed",
            "A terminal dealer state does not accept another card.",
        )
    return replace(state, phase=RoundPhase.ROUND_COMPLETE)


def reveal_unknown(
    state: RoundState,
    target: RevealTarget,
    card: Card,
) -> RoundState:
    _validate_round_source(state)
    shoe = _reveal_from_shoe(state.game_state.shoe, card)
    if target.kind == "dealer":
        dealer_hand = _replace_card(
            state.game_state.dealer_hand, target.card_index, card
        )
        if (
            state.dealer_check_result is DealerCheckResult.NO_BLACKJACK
            and len(dealer_hand.cards) >= 2
            and evaluate_hand(Hand(cards=dealer_hand.cards[:2])).blackjack
        ):
            raise TransitionError(
                "reveal_conflicts_with_dealer_check",
                "The revealed card contradicts the observed no-blackjack check.",
            )
        return replace(
            state,
            game_state=replace(
                state.game_state,
                shoe=shoe,
                dealer_hand=dealer_hand,
            ),
        )

    assert target.player_index is not None
    if not 0 <= target.player_index < len(state.player_hands):
        raise TransitionError(
            "reveal_target_not_unknown", "The player hand index does not exist."
        )
    hands = list(state.player_hands)
    player = hands[target.player_index]
    player = replace(
        player,
        hand=_replace_card(player.hand, target.card_index, card),
    )
    if player.status is HandStatus.ACTIVE:
        player = replace(player, status=_status_after_card_with_rules(player, state))
    hands[target.player_index] = player
    result = _with_player_hands(state, tuple(hands), shoe)
    if (
        state.phase is RoundPhase.PLAYER_TURNS
        and state.active_hand_index == target.player_index
        and player.status is not HandStatus.ACTIVE
    ):
        return _advance_after_terminal(result, target.player_index)
    return result


def resolve_outcomes(state: RoundState) -> tuple[Outcome | None, ...]:
    _validate_round_source(state)
    if state.phase is not RoundPhase.ROUND_COMPLETE:
        raise TransitionError(
            "wrong_phase", "Outcomes are available only when the round is complete."
        )
    dealer = evaluate_dealer(state.game_state.dealer_hand, state.game_state.rules)
    dealer_blackjack = (
        state.dealer_check_result is DealerCheckResult.BLACKJACK
        or dealer.status is DealerStatus.BLACKJACK
    )
    outcomes: list[Outcome | None] = []
    for player in state.player_hands:
        if player.status in (HandStatus.SURRENDERED, HandStatus.BUST):
            outcomes.append(Outcome.LOSS)
            continue
        value = evaluate_hand(
            player.hand,
            split_origin=Rank.ACE if player.split_depth > 0 else None,
            blackjack_after_split=state.game_state.rules.blackjack_after_split,
        )
        player_blackjack = player.status is HandStatus.BLACKJACK
        if player_blackjack:
            outcomes.append(Outcome.PUSH if dealer_blackjack else Outcome.WIN)
        elif dealer_blackjack:
            outcomes.append(Outcome.LOSS)
        elif dealer.status is DealerStatus.BUST:
            outcomes.append(Outcome.WIN)
        elif not value.determinate or not dealer.hand_value.determinate:
            outcomes.append(None)
        else:
            assert value.total is not None and dealer.hand_value.total is not None
            if value.total > dealer.hand_value.total:
                outcomes.append(Outcome.WIN)
            elif value.total == dealer.hand_value.total:
                outcomes.append(Outcome.PUSH)
            else:
                outcomes.append(Outcome.LOSS)
    return tuple(outcomes)
