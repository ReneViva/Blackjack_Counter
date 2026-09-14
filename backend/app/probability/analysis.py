from dataclasses import dataclass, replace
import math
from typing import Literal

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
    player_action_decision,
    player_hit,
    player_stand,
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
    contract: Literal["stand_now", "hit_once_then_stand"]
    status: Literal["available", "unavailable"]
    outcomes: OutcomeDistribution | None = None
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
    contract: Literal["stand_now", "hit_once_then_stand"],
    code: str,
    message: str,
) -> ExactActionForecast:
    return ExactActionForecast(
        contract=contract,
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


def _decision_unavailable(
    contract: Literal["stand_now", "hit_once_then_stand"],
    decisions: tuple[ActionDecision, ...],
) -> ExactActionForecast | None:
    rejected = tuple(decision for decision in decisions if not decision.allowed)
    if not rejected:
        return None
    codes = {decision.code for decision in rejected}
    messages = {decision.message for decision in rejected}
    if len(rejected) != len(decisions) or len(codes) > 1 or len(messages) > 1:
        return _unavailable_forecast(
            contract,
            "ambiguous_hand_status",
            "Latent card assignments do not agree on whether this action is legal.",
        )
    decision = rejected[0]
    return _unavailable_forecast(
        contract,
        decision.code or "action_not_allowed",
        decision.message or "The hypothetical action is not allowed.",
    )


def _metrics_delta(before: CacheMetrics, after: CacheMetrics) -> CacheMetrics:
    return CacheMetrics(
        states_evaluated=after.states_evaluated - before.states_evaluated,
        cache_hits=after.cache_hits - before.cache_hits,
        cache_misses=after.cache_misses - before.cache_misses,
    )


def analyze_exact_action_forecasts(
    state: ReconstructedTableState,
    *,
    target_seat: int | None,
    target_hand_id: str | None,
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED,
    max_states: int = 2_000_000,
) -> ExactActionForecastAnalysis:
    """Compare stand-now with exactly one hit followed immediately by stand."""
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

    hit_decisions = tuple(
        player_action_decision(round_state, PlayerAction.HIT)
        for _, round_state in rounds
    )
    hit = _decision_unavailable("hit_once_then_stand", hit_decisions)
    if hit is None:
        hit_roots: list[tuple[float, RoundState]] = []
        for hidden_weight, round_state in rounds:
            draws = possible_draws(round_state.game_state.shoe)
            if not draws:
                hit = _unavailable_forecast(
                    "hit_once_then_stand",
                    "exact_shoe_exhausted",
                    "The exact shoe has no card available for the hypothetical hit.",
                )
                break
            for draw in draws:
                after_hit = player_hit(round_state, draw.card)
                if after_hit.phase is RoundPhase.PLAYER_TURNS:
                    after_hit = player_stand(after_hit)
                hit_roots.append(
                    (hidden_weight * draw.probability, after_hit)
                )
        if hit is None:
            before = evaluator.metrics
            try:
                outcomes = evaluator.evaluate_weighted(hit_roots)
            except ExactAnalysisError as error:
                hit = _unavailable_forecast(
                    "hit_once_then_stand", error.code, error.message
                )
            else:
                hit = ExactActionForecast(
                    contract="hit_once_then_stand",
                    status="available",
                    outcomes=outcomes,
                    metrics=_metrics_delta(before, evaluator.metrics),
                    hidden_states_evaluated=hidden.states_evaluated,
                    hidden_weight_mass=hidden_mass,
                )

    assert stand is not None and hit is not None
    return ExactActionForecastAnalysis(
        target_seat=target_seat,
        target_hand_id=target_hand_id,
        stand_now=stand,
        hit_once_then_stand=hit,
    )
