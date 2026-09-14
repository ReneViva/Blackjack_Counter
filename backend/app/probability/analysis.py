from dataclasses import dataclass, replace
import math
from typing import Literal, TypeAlias

from app.domain import (
    DealerCheckResult,
    GameState,
    Hand,
    HandStatus,
    PlayerAction,
    PlayerHandState,
    RoundPhase,
    RoundState,
    Rank,
    Shoe,
)
from app.engine import (
    ActionDecision,
    ReconstructedPlayerHand,
    ReconstructedTableState,
    evaluate_dealer,
    evaluate_hand,
    observe_split_replacement,
    player_action_decision,
    player_double,
    player_hit,
    player_split,
    player_stand,
    player_surrender,
    split_action_decision,
    validate_table_state,
)

from .distribution import OutcomeDistribution, weighted_sum
from .exact import (
    ExactAnalysisError,
    ExactDealerEvaluator,
    evaluate_exact,
    possible_draws,
)
from .hidden_cards import enumerate_hidden_states
from .memoization import CacheMetrics


OutcomeForecastContract: TypeAlias = Literal[
    "stand_now",
    "hit_once_then_stand",
    "double_one_card_then_stand",
]


@dataclass(frozen=True, slots=True)
class ExactTableAnalysis:
    outcomes: OutcomeDistribution
    metrics: CacheMetrics
    cards_remaining: int
    known_cards: int
    hidden_cards: int
    hidden_states_evaluated: int = 0
    hidden_weight_mass: float = 1.0


@dataclass(frozen=True, slots=True)
class ExactActionForecast:
    contract: OutcomeForecastContract
    status: Literal["available", "unavailable"]
    outcomes: OutcomeDistribution | None = None
    metrics: CacheMetrics | None = None
    code: str | None = None
    message: str | None = None
    hidden_states_evaluated: int = 0
    hidden_weight_mass: float = 1.0


@dataclass(frozen=True, slots=True)
class ExactTerminalActionForecast:
    contract: Literal["surrender_now"]
    status: Literal["available", "unavailable"]
    terminal: Literal["surrendered"] | None = None
    code: str | None = None
    message: str | None = None


@dataclass(frozen=True, slots=True)
class ExactSplitActionForecast:
    contract: Literal["split_one_card_each_then_stand"]
    status: Literal["available", "unavailable"]
    child_hand_1: OutcomeDistribution | None = None
    child_hand_2: OutcomeDistribution | None = None
    metrics: CacheMetrics | None = None
    code: str | None = None
    message: str | None = None
    hidden_states_evaluated: int = 0
    hidden_weight_mass: float = 1.0


@dataclass(frozen=True, slots=True)
class ExactActionForecastAnalysis:
    target_seat: int | None
    target_hand_id: str | None
    stand_now: ExactActionForecast
    hit_once_then_stand: ExactActionForecast
    double_one_card_then_stand: ExactActionForecast
    surrender_now: ExactTerminalActionForecast
    split_one_card_each_then_stand: ExactSplitActionForecast


def build_dealer_completion_round(
    state: ReconstructedTableState,
    *,
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
    resolved_shoe: Shoe | None = None,
    resolved_dealer_hand: Hand | None = None,
    resolved_user_hand: Hand | None = None,
) -> RoundState:
    if state.game_state is None:
        raise ExactAnalysisError(
            "exact_analysis_requires_known_deck",
            "Exact analysis requires a known deck count.",
        )
    users = tuple(player for player in state.players if player.is_user)
    if len(users) != 1:
        raise ExactAnalysisError(
            "invalid_state",
            "Exact analysis requires exactly one player marked as the user.",
        )
    user = users[0]
    user_hand = resolved_user_hand or user.hand
    dealer_hand = resolved_dealer_hand or state.dealer_hand
    shoe = resolved_shoe or state.game_state.shoe
    value = evaluate_hand(
        user_hand,
        split_origin=Rank.ACE if user.split_depth > 0 else None,
        blackjack_after_split=state.game_state.rules.blackjack_after_split,
    )
    if not value.determinate:
        raise ExactAnalysisError(
            "exact_analysis_requires_resolved_hidden_composition",
            "Exact analysis requires the user hand to contain only known cards.",
        )
    if value.bust:
        status = HandStatus.BUST
    elif value.blackjack:
        status = HandStatus.BLACKJACK
    else:
        status = HandStatus.STOOD

    player = PlayerHandState(
        seat=user.seat,
        hand=user_hand,
        status=status,
        decision_count=1,
        split_depth=user.split_depth,
        from_split_aces=user.from_split_aces,
        hand_id=user.hand_id,
        parent_hand_id=user.parent_hand_id,
    )
    game_state = GameState(
        rules=state.game_state.rules,
        shoe=shoe,
        dealer_hand=dealer_hand,
        player_hands=(user_hand,),
    )
    dealer = evaluate_dealer(game_state.dealer_hand, game_state.rules)
    phase = (
        RoundPhase.ROUND_COMPLETE
        if status is HandStatus.BUST or dealer.terminal
        else RoundPhase.DEALER_TURN
    )
    return RoundState(
        game_state=game_state,
        player_hands=(player,),
        phase=phase,
        active_hand_index=None,
        dealer_check_result=dealer_check_result,
    )


def analyze_exact_table(
    state: ReconstructedTableState,
    *,
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
    max_states: int = 2_000_000,
) -> ExactTableAnalysis:
    validation = validate_table_state(state)
    if not validation.valid:
        issue = validation.errors[0]
        raise ExactAnalysisError("invalid_state", issue.message)
    if state.deck_count is None:
        raise ExactAnalysisError(
            "exact_analysis_requires_known_deck",
            "Exact analysis requires a known deck count.",
        )
    hidden = enumerate_hidden_states(
        state,
        dealer_check_result=dealer_check_result,
        max_states=max_states,
    )
    weighted_results: list[tuple[float, OutcomeDistribution]] = []
    cache_hits = 0
    cache_misses = 0
    remaining_states = max_states - hidden.states_evaluated
    for branch in hidden.branches:
        if remaining_states < 1:
            raise ExactAnalysisError(
                "exact_computation_limit",
                "Exact analysis exceeded the configured state limit.",
            )
        round_state = build_dealer_completion_round(
            state,
            dealer_check_result=dealer_check_result,
            resolved_shoe=branch.shoe,
            resolved_dealer_hand=branch.dealer_hand,
            resolved_user_hand=branch.user_hand,
        )
        evaluation = evaluate_exact(round_state, max_states=remaining_states)
        cache_hits += evaluation.metrics.cache_hits
        cache_misses += evaluation.metrics.cache_misses
        remaining_states -= evaluation.metrics.states_evaluated
        weighted_results.append((branch.weight, evaluation.outcomes))
    outcomes = weighted_sum(weighted_results)
    if abs(outcomes.total - 1.0) > 1e-10:
        raise ExactAnalysisError(
            "probability_mass_invalid",
            "Marginalized outcome probability mass does not sum to one.",
        )
    return ExactTableAnalysis(
        outcomes=outcomes,
        metrics=CacheMetrics(
            states_evaluated=hidden.states_evaluated + cache_misses,
            cache_hits=cache_hits,
            cache_misses=cache_misses,
        ),
        cards_remaining=state.game_state.shoe.total_cards,
        known_cards=state.known_card_count,
        hidden_cards=state.unknown_card_count,
        hidden_states_evaluated=hidden.states_evaluated,
        hidden_weight_mass=math.fsum(branch.weight for branch in hidden.branches),
    )


def _unavailable_forecast(
    contract: OutcomeForecastContract,
    code: str,
    message: str,
) -> ExactActionForecast:
    return ExactActionForecast(
        contract=contract,
        status="unavailable",
        code=code,
        message=message,
    )


def _unavailable_terminal_forecast(
    code: str,
    message: str,
) -> ExactTerminalActionForecast:
    return ExactTerminalActionForecast(
        contract="surrender_now",
        status="unavailable",
        code=code,
        message=message,
    )


def _unavailable_split_forecast(
    code: str,
    message: str,
) -> ExactSplitActionForecast:
    return ExactSplitActionForecast(
        contract="split_one_card_each_then_stand",
        status="unavailable",
        code=code,
        message=message,
    )


def _unavailable_analysis(
    seat: int | None,
    hand_id: str | None,
    code: str,
    message: str,
) -> ExactActionForecastAnalysis:
    return ExactActionForecastAnalysis(
        target_seat=seat,
        target_hand_id=hand_id,
        stand_now=_unavailable_forecast("stand_now", code, message),
        hit_once_then_stand=_unavailable_forecast(
            "hit_once_then_stand", code, message
        ),
        double_one_card_then_stand=_unavailable_forecast(
            "double_one_card_then_stand", code, message
        ),
        surrender_now=_unavailable_terminal_forecast(code, message),
        split_one_card_each_then_stand=_unavailable_split_forecast(
            code, message
        ),
    )


def _action_round(
    state: ReconstructedTableState,
    selected: ReconstructedPlayerHand,
    *,
    dealer_check_result: DealerCheckResult,
    resolved_shoe: Shoe,
    resolved_dealer_hand: Hand,
    resolved_user_hand: Hand,
) -> RoundState:
    assert state.game_state is not None
    rules = state.game_state.rules
    value = evaluate_hand(
        resolved_user_hand,
        split_origin=Rank.ACE if selected.split_depth > 0 else None,
        blackjack_after_split=rules.blackjack_after_split,
    )
    if not value.determinate:
        raise ExactAnalysisError(
            "exact_analysis_requires_resolved_hidden_composition",
            "Exact action forecasts require the selected hand to be resolved.",
        )
    if value.bust:
        status = HandStatus.BUST
    elif value.blackjack:
        status = HandStatus.BLACKJACK
    elif value.total == 21:
        status = HandStatus.STOOD
    else:
        status = HandStatus.ACTIVE

    dealer_terminal = dealer_check_result is DealerCheckResult.BLACKJACK
    if dealer_terminal and status is HandStatus.ACTIVE:
        status = HandStatus.STOOD

    player = PlayerHandState(
        seat=selected.seat,
        hand=resolved_user_hand,
        status=status,
        split_depth=selected.split_depth,
        from_split_aces=selected.from_split_aces,
        decision_count=max(0, len(resolved_user_hand.cards) - 2),
        hand_id=selected.hand_id,
        parent_hand_id=selected.parent_hand_id,
    )
    game_state = GameState(
        rules=rules,
        shoe=resolved_shoe,
        dealer_hand=resolved_dealer_hand,
        player_hands=(resolved_user_hand,),
    )
    if status is HandStatus.ACTIVE:
        phase = RoundPhase.PLAYER_TURNS
        active_hand_index = 0
    elif status is HandStatus.BUST or dealer_terminal:
        phase = RoundPhase.ROUND_COMPLETE
        active_hand_index = None
    else:
        phase = RoundPhase.DEALER_TURN
        active_hand_index = None
    return RoundState(
        game_state=game_state,
        player_hands=(player,),
        phase=phase,
        active_hand_index=active_hand_index,
        dealer_check_result=dealer_check_result,
    )


def _decision_rejection(
    decisions: tuple[ActionDecision, ...],
) -> tuple[str, str] | None:
    rejected = tuple(decision for decision in decisions if not decision.allowed)
    if not rejected:
        return None
    codes = {decision.code for decision in rejected}
    messages = {decision.message for decision in rejected}
    if len(rejected) != len(decisions) or len(codes) > 1 or len(messages) > 1:
        return (
            "ambiguous_hand_status",
            "Latent card assignments do not agree on whether this action is legal.",
        )
    decision = rejected[0]
    return (
        decision.code or "action_not_allowed",
        decision.message or "The hypothetical action is not allowed.",
    )


def _decision_unavailable(
    contract: OutcomeForecastContract,
    decisions: tuple[ActionDecision, ...],
) -> ExactActionForecast | None:
    rejection = _decision_rejection(decisions)
    return (
        None
        if rejection is None
        else _unavailable_forecast(contract, *rejection)
    )


def _metrics_delta(before: CacheMetrics, after: CacheMetrics) -> CacheMetrics:
    return CacheMetrics(
        states_evaluated=after.states_evaluated - before.states_evaluated,
        cache_hits=after.cache_hits - before.cache_hits,
        cache_misses=after.cache_misses - before.cache_misses,
    )


def _one_card_then_stand_forecast(
    contract: Literal[
        "hit_once_then_stand", "double_one_card_then_stand"
    ],
    action: Literal[PlayerAction.HIT, PlayerAction.DOUBLE],
    rounds: tuple[tuple[float, RoundState], ...],
    evaluator: ExactDealerEvaluator,
    *,
    hidden_states_evaluated: int,
    hidden_weight_mass: float,
) -> ExactActionForecast:
    decisions = tuple(
        player_action_decision(round_state, action)
        for _, round_state in rounds
    )
    unavailable = _decision_unavailable(contract, decisions)
    if unavailable is not None:
        return unavailable

    roots: list[tuple[float, RoundState]] = []
    for hidden_weight, round_state in rounds:
        draws = possible_draws(round_state.game_state.shoe)
        if not draws:
            return _unavailable_forecast(
                contract,
                "exact_shoe_exhausted",
                "The exact shoe has no card available for this hypothetical action.",
            )
        for draw in draws:
            after_draw = (
                player_hit(round_state, draw.card)
                if action is PlayerAction.HIT
                else player_double(round_state, draw.card)
            )
            if (
                action is PlayerAction.HIT
                and after_draw.phase is RoundPhase.PLAYER_TURNS
            ):
                after_draw = player_stand(after_draw)
            roots.append((hidden_weight * draw.probability, after_draw))

    before = evaluator.metrics
    try:
        outcomes = evaluator.evaluate_weighted(roots)
    except ExactAnalysisError as error:
        return _unavailable_forecast(contract, error.code, error.message)
    return ExactActionForecast(
        contract=contract,
        status="available",
        outcomes=outcomes,
        metrics=_metrics_delta(before, evaluator.metrics),
        hidden_states_evaluated=hidden_states_evaluated,
        hidden_weight_mass=hidden_weight_mass,
    )


def _force_split_children_to_stand(state: RoundState) -> RoundState:
    """Apply the fixed Phase 3 continuation after both replacement cards."""
    hands = tuple(
        replace(
            hand,
            status=HandStatus.STOOD,
            decision_count=hand.decision_count + 1,
        )
        if hand.status is HandStatus.ACTIVE
        else hand
        for hand in state.player_hands
    )
    all_lost = all(
        hand.status in (HandStatus.BUST, HandStatus.SURRENDERED)
        for hand in hands
    )
    return replace(
        state,
        player_hands=hands,
        phase=(RoundPhase.ROUND_COMPLETE if all_lost else RoundPhase.DEALER_TURN),
        active_hand_index=None,
    )


def _split_forecast(
    source_state: ReconstructedTableState,
    selected: ReconstructedPlayerHand,
    rounds: tuple[tuple[float, RoundState], ...],
    evaluator: ExactDealerEvaluator,
    *,
    hidden_states_evaluated: int,
    hidden_weight_mass: float,
) -> ExactSplitActionForecast:
    seat_hand_count = sum(
        player.seat == selected.seat for player in source_state.players
    )
    decisions: list[ActionDecision] = []
    for _, round_state in rounds:
        decision = player_action_decision(round_state, PlayerAction.SPLIT)
        if decision.allowed:
            decision = split_action_decision(
                round_state.game_state.rules,
                round_state.player_hands[0],
                seat_hand_count,
            )
        decisions.append(decision)
    rejection = _decision_rejection(tuple(decisions))
    if rejection is not None:
        return _unavailable_split_forecast(*rejection)

    roots: list[tuple[float, RoundState]] = []
    for hidden_weight, round_state in rounds:
        split_state = player_split(round_state)
        child_1_id = split_state.player_hands[0].hand_id
        child_2_id = split_state.player_hands[1].hand_id
        assert child_1_id is not None and child_2_id is not None
        first_draws = possible_draws(split_state.game_state.shoe)
        if not first_draws:
            return _unavailable_split_forecast(
                "exact_shoe_exhausted",
                "The exact shoe does not contain two split replacement cards.",
            )
        for first_draw in first_draws:
            after_first = observe_split_replacement(
                split_state, child_1_id, first_draw.card
            )
            second_draws = possible_draws(after_first.game_state.shoe)
            if not second_draws:
                return _unavailable_split_forecast(
                    "exact_shoe_exhausted",
                    "The exact shoe does not contain two split replacement cards.",
                )
            for second_draw in second_draws:
                after_second = observe_split_replacement(
                    after_first, child_2_id, second_draw.card
                )
                finalized = _force_split_children_to_stand(after_second)
                roots.append(
                    (
                        hidden_weight
                        * first_draw.probability
                        * second_draw.probability,
                        finalized,
                    )
                )

    before = evaluator.metrics
    try:
        child_hand_1, child_hand_2 = evaluator.evaluate_weighted_many(
            roots,
            target_hand_indices=(0, 1),
        )
    except ExactAnalysisError as error:
        return _unavailable_split_forecast(error.code, error.message)
    return ExactSplitActionForecast(
        contract="split_one_card_each_then_stand",
        status="available",
        child_hand_1=child_hand_1,
        child_hand_2=child_hand_2,
        metrics=_metrics_delta(before, evaluator.metrics),
        hidden_states_evaluated=hidden_states_evaluated,
        hidden_weight_mass=hidden_weight_mass,
    )


def analyze_exact_action_forecasts(
    state: ReconstructedTableState,
    *,
    target_seat: int | None,
    target_hand_id: str | None,
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
    max_states: int = 2_000_000,
) -> ExactActionForecastAnalysis:
    """Evaluate fixed, non-ranked action continuations for one selected hand."""
    validation = validate_table_state(state)
    if not validation.valid:
        issue = validation.errors[0]
        return _unavailable_analysis(
            target_seat, target_hand_id, issue.code, issue.message
        )
    if state.deck_count is None or state.game_state is None:
        return _unavailable_analysis(
            target_seat,
            target_hand_id,
            "exact_analysis_requires_known_deck",
            "Exact action forecasts require a known deck count.",
        )
    if not any(player.is_user for player in state.players):
        return _unavailable_analysis(
            target_seat,
            target_hand_id,
            "no_analysis_seat",
            "Select an analysis seat before requesting action forecasts.",
        )
    if target_seat is None or target_hand_id is None:
        return _unavailable_analysis(
            target_seat,
            target_hand_id,
            "no_selected_hand",
            "Select a specific analysis hand before requesting action forecasts.",
        )
    matching = tuple(
        player
        for player in state.players
        if player.seat == target_seat and player.hand_id == target_hand_id
    )
    if len(matching) != 1:
        return _unavailable_analysis(
            target_seat,
            target_hand_id,
            "invalid_hand_target",
            "The selected analysis hand does not exist.",
        )
    selected = matching[0]
    if not selected.is_user:
        return _unavailable_analysis(
            target_seat,
            target_hand_id,
            "invalid_analysis_hand",
            "The selected hand is not the configured analysis hand.",
        )
    if len(selected.hand.cards) < 2:
        return _unavailable_analysis(
            target_seat,
            target_hand_id,
            "hand_not_ready",
            "The selected hand requires two observed cards before forecasting actions.",
        )
    if selected.status is not HandStatus.ACTIVE:
        return _unavailable_analysis(
            target_seat,
            target_hand_id,
            "terminal_hand",
            f"The selected hand is already {selected.status.value}.",
        )

    selected_state = replace(
        state,
        players=tuple(
            replace(
                player,
                is_user=(
                    player.seat == target_seat
                    and player.hand_id == target_hand_id
                ),
            )
            for player in state.players
        ),
    )
    try:
        hidden = enumerate_hidden_states(
            selected_state,
            dealer_check_result=dealer_check_result,
            max_states=max_states,
        )
    except ExactAnalysisError as error:
        return _unavailable_analysis(
            target_seat, target_hand_id, error.code, error.message
        )

    rounds = tuple(
        (
            branch.weight,
            _action_round(
                selected_state,
                selected,
                dealer_check_result=dealer_check_result,
                resolved_shoe=branch.shoe,
                resolved_dealer_hand=branch.dealer_hand,
                resolved_user_hand=branch.user_hand,
            ),
        )
        for branch in hidden.branches
    )
    hidden_mass = math.fsum(weight for weight, _ in rounds)
    remaining_states = max_states - hidden.states_evaluated
    if remaining_states < 1:
        return _unavailable_analysis(
            target_seat,
            target_hand_id,
            "exact_computation_limit",
            "Exact analysis exceeded the configured state limit.",
        )
    evaluator = ExactDealerEvaluator(max_states=remaining_states)

    stand_decisions = tuple(
        player_action_decision(round_state, PlayerAction.STAND)
        for _, round_state in rounds
    )
    stand = _decision_unavailable("stand_now", stand_decisions)
    if stand is None:
        before = evaluator.metrics
        try:
            outcomes = evaluator.evaluate_weighted(
                (weight, player_stand(round_state))
                for weight, round_state in rounds
            )
        except ExactAnalysisError as error:
            stand = _unavailable_forecast(
                "stand_now", error.code, error.message
            )
        else:
            stand = ExactActionForecast(
                contract="stand_now",
                status="available",
                outcomes=outcomes,
                metrics=_metrics_delta(before, evaluator.metrics),
                hidden_states_evaluated=hidden.states_evaluated,
                hidden_weight_mass=hidden_mass,
            )

    hit = _one_card_then_stand_forecast(
        "hit_once_then_stand",
        PlayerAction.HIT,
        rounds,
        evaluator,
        hidden_states_evaluated=hidden.states_evaluated,
        hidden_weight_mass=hidden_mass,
    )
    double = _one_card_then_stand_forecast(
        "double_one_card_then_stand",
        PlayerAction.DOUBLE,
        rounds,
        evaluator,
        hidden_states_evaluated=hidden.states_evaluated,
        hidden_weight_mass=hidden_mass,
    )

    surrender_rejection = _decision_rejection(
        tuple(
            player_action_decision(round_state, PlayerAction.SURRENDER)
            for _, round_state in rounds
        )
    )
    if surrender_rejection is not None:
        surrender = _unavailable_terminal_forecast(*surrender_rejection)
    else:
        surrendered_rounds = tuple(
            player_surrender(round_state) for _, round_state in rounds
        )
        assert all(
            round_state.player_hands[0].status is HandStatus.SURRENDERED
            for round_state in surrendered_rounds
        )
        surrender = ExactTerminalActionForecast(
            contract="surrender_now",
            status="available",
            terminal="surrendered",
        )

    split = _split_forecast(
        selected_state,
        selected,
        rounds,
        evaluator,
        hidden_states_evaluated=hidden.states_evaluated,
        hidden_weight_mass=hidden_mass,
    )

    assert stand is not None
    return ExactActionForecastAnalysis(
        target_seat=target_seat,
        target_hand_id=target_hand_id,
        stand_now=stand,
        hit_once_then_stand=hit,
        double_one_card_then_stand=double,
        surrender_now=surrender,
        split_one_card_each_then_stand=split,
    )
