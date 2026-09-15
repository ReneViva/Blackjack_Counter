from dataclasses import replace
from time import perf_counter

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.domain import DealerSoft17
from app.engine import ReconstructedTableState, build_table_state, validate_table_state
from app.probability import (
    ExactAnalysisError,
    ExactActionForecast,
    ExactSplitActionForecast,
    ExactTableAnalysis,
    ExactTerminalActionForecast,
    OutcomeDistribution,
    analyze_exact_action_forecasts,
    analyze_exact_table,
    concrete_scenarios,
    simulate_table,
    summarize_outcomes,
    wilson_interval,
)
from app.schemas import (
    APIErrorDetail,
    APIErrorResponse,
    AnalysisMetadata,
    AnalysisStateSummary,
    AnalysisRequest,
    CompareAnalysisOptions,
    CompareAnalysisResponse,
    CompareScenarioAnalysisResponse,
    CompareScenarioResponse,
    ComparisonOutcomeResponse,
    ComparisonOutcomesResponse,
    ExactAnalysisResponse,
    ExactActionForecastOptions,
    ExactHandSummariesOptions,
    ExactHandSummariesResponse,
    ExactHandSummaryResponse,
    ExactHandSummariesScenarioAnalysisResponse,
    ExactHandSummariesScenarioResponse,
    ExactActionForecastResponse,
    ExactActionForecastResultResponse,
    ExactSplitActionForecastResultResponse,
    ExactTerminalActionForecastResultResponse,
    ExactActionForecastScenarioAnalysisResponse,
    ExactActionForecastScenarioResponse,
    ExactActionForecastsResponse,
    ActionForecastTargetResponse,
    ExactScenarioAnalysisResponse,
    ExactScenarioResponse,
    EstimatedOutcome,
    MonteCarloAnalysisOptions,
    MonteCarloAnalysisResponse,
    MonteCarloOutcomes,
    MonteCarloScenarioAnalysisResponse,
    MonteCarloScenarioResponse,
    OutcomeCountsResponse,
    OutcomeProbabilities,
    OutcomeModelSummaryResponse,
    OutcomeRangesResponse,
    ProbabilityRangeResponse,
    ExcludedDeckCountResponse,
    ScenarioAssumptionsResponse,
    UniformActionDeckCountSummaryResponse,
    UniformActionForecastsResponse,
    UniformActionSummaryResponse,
    UniformDeckCountSummaryResponse,
    UniformHandDeckCountSummaryResponse,
)


router = APIRouter(prefix="/api", tags=["analysis"])


def _error_response(error: ExactAnalysisError) -> JSONResponse:
    payload = APIErrorResponse(
        error=APIErrorDetail(code=error.code, message=error.message)
    )
    return JSONResponse(status_code=422, content=payload.model_dump())


def _exact_result(payload: AnalysisRequest) -> ExactAnalysisResponse:
    started = perf_counter()
    result = analyze_exact_table(
        build_table_state(payload.state),
        dealer_check_result=payload.options.dealer_check_result,
    )
    runtime_ms = (perf_counter() - started) * 1000.0
    return ExactAnalysisResponse(
        state_summary=AnalysisStateSummary(
            cards_remaining=result.cards_remaining,
            known_cards=result.known_cards,
            hidden_cards=result.hidden_cards,
        ),
        outcomes=OutcomeProbabilities(
            win=result.outcomes.win,
            push=result.outcomes.push,
            loss=result.outcomes.loss,
        ),
        metadata=AnalysisMetadata(
            states_evaluated=result.metrics.states_evaluated,
            cache_hits=result.metrics.cache_hits,
            cache_misses=result.metrics.cache_misses,
            runtime_ms=runtime_ms,
            hidden_states_evaluated=result.hidden_states_evaluated,
            hidden_weight_mass=result.hidden_weight_mass,
        ),
    )


def _analysis_result_response(
    result: ExactTableAnalysis,
    runtime_ms: float,
) -> tuple[AnalysisStateSummary, OutcomeProbabilities, AnalysisMetadata]:
    return (
        AnalysisStateSummary(
            cards_remaining=result.cards_remaining,
            known_cards=result.known_cards,
            hidden_cards=result.hidden_cards,
        ),
        OutcomeProbabilities(
            win=result.outcomes.win,
            push=result.outcomes.push,
            loss=result.outcomes.loss,
        ),
        AnalysisMetadata(
            states_evaluated=result.metrics.states_evaluated,
            cache_hits=result.metrics.cache_hits,
            cache_misses=result.metrics.cache_misses,
            runtime_ms=runtime_ms,
            hidden_states_evaluated=result.hidden_states_evaluated,
            hidden_weight_mass=result.hidden_weight_mass,
        ),
    )


def _validate_summary_target(
    state: ReconstructedTableState,
    target_seat: int,
    target_hand_id: str,
) -> None:
    matching = [
        player
        for player in state.players
        if player.seat == target_seat and player.hand_id == target_hand_id
    ]
    if len(matching) != 1:
        raise ExactAnalysisError(
            "invalid_hand_target",
            "The selected analysis hand does not belong to the specified seat.",
        )


def _hand_summaries_result_from_state(
    state: ReconstructedTableState,
    options: ExactHandSummariesOptions,
) -> ExactHandSummariesResponse:
    target = options.target
    validation = validate_table_state(state)
    if not validation.valid:
        issue = validation.errors[0]
        raise ExactAnalysisError(issue.code, issue.message)
    _validate_summary_target(state, target.seat, target.hand_id)
    hands: list[ExactHandSummaryResponse] = []
    for player in (item for item in state.players if item.seat == target.seat):
        hand_target = ActionForecastTargetResponse(
            seat=player.seat, hand_id=player.hand_id
        )
        if len(player.hand.cards) < 2:
            hands.append(
                ExactHandSummaryResponse(
                    target=hand_target,
                    status="unavailable",
                    error=APIErrorDetail(
                        code="hand_not_ready",
                        message=(
                            "This hand requires two observed cards before exact "
                            "outcomes can be calculated."
                        ),
                    ),
                )
            )
            continue
        selected_state = replace(
            state,
            players=tuple(
                replace(
                    candidate,
                    is_user=(
                        candidate.seat == player.seat
                        and candidate.hand_id == player.hand_id
                    ),
                )
                for candidate in state.players
            ),
        )
        started = perf_counter()
        try:
            result = analyze_exact_table(
                selected_state,
                dealer_check_result=options.dealer_check_result,
            )
        except ExactAnalysisError as error:
            hands.append(
                ExactHandSummaryResponse(
                    target=hand_target,
                    status="unavailable",
                    error=APIErrorDetail(code=error.code, message=error.message),
                )
            )
            continue
        state_summary, outcomes, metadata = _analysis_result_response(
            result, (perf_counter() - started) * 1000.0
        )
        hands.append(
            ExactHandSummaryResponse(
                target=hand_target,
                status="complete",
                state_summary=state_summary,
                outcomes=outcomes,
                metadata=metadata,
            )
        )
    return ExactHandSummariesResponse(
        target=ActionForecastTargetResponse(
            seat=target.seat, hand_id=target.hand_id
        ),
        hands=hands,
    )


def _forecast_response(
    forecast: ExactActionForecast,
    runtime_ms: float,
) -> ExactActionForecastResultResponse:
    if forecast.status == "unavailable":
        return ExactActionForecastResultResponse(
            contract=forecast.contract,
            status="unavailable",
            error=APIErrorDetail(
                code=forecast.code or "action_forecast_unavailable",
                message=forecast.message or "The action forecast is unavailable.",
            ),
        )
    assert forecast.outcomes is not None and forecast.metrics is not None
    return ExactActionForecastResultResponse(
        contract=forecast.contract,
        status="available",
        outcomes=OutcomeProbabilities(
            win=forecast.outcomes.win,
            push=forecast.outcomes.push,
            loss=forecast.outcomes.loss,
        ),
        metadata=AnalysisMetadata(
            states_evaluated=(
                forecast.hidden_states_evaluated
                + forecast.metrics.states_evaluated
            ),
            cache_hits=forecast.metrics.cache_hits,
            cache_misses=forecast.metrics.cache_misses,
            runtime_ms=runtime_ms,
            hidden_states_evaluated=forecast.hidden_states_evaluated,
            hidden_weight_mass=forecast.hidden_weight_mass,
        ),
    )


def _terminal_forecast_response(
    forecast: ExactTerminalActionForecast,
) -> ExactTerminalActionForecastResultResponse:
    if forecast.status == "unavailable":
        return ExactTerminalActionForecastResultResponse(
            status="unavailable",
            error=APIErrorDetail(
                code=forecast.code or "action_forecast_unavailable",
                message=forecast.message or "The action forecast is unavailable.",
            ),
        )
    return ExactTerminalActionForecastResultResponse(
        status="available",
        terminal=forecast.terminal,
    )


def _split_forecast_response(
    forecast: ExactSplitActionForecast,
    runtime_ms: float,
) -> ExactSplitActionForecastResultResponse:
    if forecast.status == "unavailable":
        return ExactSplitActionForecastResultResponse(
            status="unavailable",
            error=APIErrorDetail(
                code=forecast.code or "action_forecast_unavailable",
                message=forecast.message or "The action forecast is unavailable.",
            ),
        )
    assert (
        forecast.child_hand_1 is not None
        and forecast.child_hand_2 is not None
        and forecast.metrics is not None
    )
    return ExactSplitActionForecastResultResponse(
        status="available",
        child_hand_1=OutcomeProbabilities(
            win=forecast.child_hand_1.win,
            push=forecast.child_hand_1.push,
            loss=forecast.child_hand_1.loss,
        ),
        child_hand_2=OutcomeProbabilities(
            win=forecast.child_hand_2.win,
            push=forecast.child_hand_2.push,
            loss=forecast.child_hand_2.loss,
        ),
        metadata=AnalysisMetadata(
            states_evaluated=(
                forecast.hidden_states_evaluated
                + forecast.metrics.states_evaluated
            ),
            cache_hits=forecast.metrics.cache_hits,
            cache_misses=forecast.metrics.cache_misses,
            runtime_ms=runtime_ms,
            hidden_states_evaluated=forecast.hidden_states_evaluated,
            hidden_weight_mass=forecast.hidden_weight_mass,
        ),
    )


def _action_forecast_result(
    payload: AnalysisRequest,
) -> ExactActionForecastResponse:
    assert isinstance(payload.options, ExactActionForecastOptions)
    started = perf_counter()
    target = payload.options.target
    result = analyze_exact_action_forecasts(
        build_table_state(payload.state),
        target_seat=target.seat if target is not None else None,
        target_hand_id=target.hand_id if target is not None else None,
        dealer_check_result=payload.options.dealer_check_result,
    )
    runtime_ms = (perf_counter() - started) * 1000.0
    return ExactActionForecastResponse(
        target=(
            ActionForecastTargetResponse(
                seat=result.target_seat,
                hand_id=result.target_hand_id,
            )
            if result.target_seat is not None and result.target_hand_id is not None
            else None
        ),
        action_forecasts=ExactActionForecastsResponse(
            stand_now=_forecast_response(result.stand_now, runtime_ms),
            hit_once_then_stand=_forecast_response(
                result.hit_once_then_stand, runtime_ms
            ),
            double_one_card_then_stand=_forecast_response(
                result.double_one_card_then_stand, runtime_ms
            ),
            surrender_now=_terminal_forecast_response(result.surrender_now),
            split_one_card_each_then_stand=_split_forecast_response(
                result.split_one_card_each_then_stand, runtime_ms
            ),
        ),
    )


def _summary_values(
    outcomes: list[OutcomeProbabilities],
) -> OutcomeModelSummaryResponse:
    summary = summarize_outcomes(
        OutcomeDistribution(win=value.win, push=value.push, loss=value.loss)
        for value in outcomes
    )
    return OutcomeModelSummaryResponse(
        outcomes=OutcomeProbabilities(
            win=summary.outcomes.win,
            push=summary.outcomes.push,
            loss=summary.outcomes.loss,
        ),
        ranges=OutcomeRangesResponse(
            win=ProbabilityRangeResponse(
                minimum=summary.win_range.minimum,
                maximum=summary.win_range.maximum,
            ),
            push=ProbabilityRangeResponse(
                minimum=summary.push_range.minimum,
                maximum=summary.push_range.maximum,
            ),
            loss=ProbabilityRangeResponse(
                minimum=summary.loss_range.minimum,
                maximum=summary.loss_range.maximum,
            ),
        ),
    )


def _summary_error(code: str, message: str) -> APIErrorDetail:
    return APIErrorDetail(code=code, message=message)


def _deck_model_metadata(
    scenarios: list[ExactScenarioResponse] | list[ExactActionForecastScenarioResponse],
    dealer_soft_17: DealerSoft17,
) -> tuple[list[int], list[ExcludedDeckCountResponse]]:
    group = [
        scenario
        for scenario in scenarios
        if scenario.assumptions.dealer_soft_17 is dealer_soft_17
    ]
    included = sorted(
        scenario.assumptions.decks
        for scenario in group
        if scenario.status != "invalid"
    )
    excluded = [
        ExcludedDeckCountResponse(
            deck_count=scenario.assumptions.decks,
            code=(scenario.error.code if scenario.error else "invalid_model"),
            message=(
                scenario.error.message
                if scenario.error
                else "The deck-count model is physically invalid."
            ),
        )
        for scenario in group
        if scenario.status == "invalid"
    ]
    return included, excluded


def _exact_deck_summaries(
    scenarios: list[ExactScenarioResponse],
) -> list[UniformDeckCountSummaryResponse]:
    summaries: list[UniformDeckCountSummaryResponse] = []
    rules = sorted(
        {scenario.assumptions.dealer_soft_17 for scenario in scenarios},
        key=lambda value: value.value,
    )
    for rule in rules:
        group = [
            scenario
            for scenario in scenarios
            if scenario.assumptions.dealer_soft_17 is rule
        ]
        included, excluded = _deck_model_metadata(scenarios, rule)
        base = dict(
            dealer_soft_17=rule,
            candidate_deck_counts=list(range(1, 9)),
            included_deck_counts=included,
            excluded_deck_counts=excluded,
        )
        if not included:
            summaries.append(
                UniformDeckCountSummaryResponse(
                    **base,
                    status="unavailable",
                    error=_summary_error(
                        "no_valid_deck_models",
                        "No physically valid deck-count models are available.",
                    ),
                )
            )
            continue
        complete = [
            scenario
            for scenario in group
            if scenario.status == "complete" and scenario.result is not None
        ]
        if len(complete) != len(included):
            summaries.append(
                UniformDeckCountSummaryResponse(
                    **base,
                    status="unavailable",
                    error=_summary_error(
                        "deck_model_analysis_unavailable",
                        "At least one valid deck-count model could not be evaluated within the exact resource limit.",
                    ),
                )
            )
            continue
        values = _summary_values([scenario.result.outcomes for scenario in complete])
        summaries.append(
            UniformDeckCountSummaryResponse(
                **base,
                status="available",
                outcomes=values.outcomes,
                ranges=values.ranges,
            )
        )
    return summaries


def _hand_deck_summaries(
    scenarios: list[ExactHandSummariesScenarioResponse],
    ordered_targets: list[ActionForecastTargetResponse],
) -> list[UniformHandDeckCountSummaryResponse]:
    summaries: list[UniformHandDeckCountSummaryResponse] = []
    rules = sorted(
        {scenario.assumptions.dealer_soft_17 for scenario in scenarios},
        key=lambda value: value.value,
    )
    for target in ordered_targets:
        for rule in rules:
            group = [
                scenario
                for scenario in scenarios
                if scenario.assumptions.dealer_soft_17 is rule
            ]
            included, excluded = _deck_model_metadata(scenarios, rule)
            base = dict(
                target=target,
                dealer_soft_17=rule,
                candidate_deck_counts=list(range(1, 9)),
                included_deck_counts=included,
                excluded_deck_counts=excluded,
            )
            if not included:
                summaries.append(
                    UniformHandDeckCountSummaryResponse(
                        **base,
                        status="unavailable",
                        error=_summary_error(
                            "no_valid_deck_models",
                            "No physically valid deck-count models are available.",
                        ),
                    )
                )
                continue
            values: list[OutcomeProbabilities] = []
            hand_error: APIErrorDetail | None = None
            for scenario in group:
                if scenario.status == "invalid":
                    continue
                hand = next(
                    (
                        item
                        for item in (scenario.result.hands if scenario.result else [])
                        if item.target == target
                    ),
                    None,
                )
                if hand is None or hand.status != "complete" or hand.outcomes is None:
                    hand_error = hand.error if hand is not None else scenario.error
                    break
                values.append(hand.outcomes)
            if hand_error is not None or len(values) != len(included):
                summaries.append(
                    UniformHandDeckCountSummaryResponse(
                        **base,
                        status="unavailable",
                        error=hand_error
                        or _summary_error(
                            "deck_model_analysis_unavailable",
                            "At least one valid deck-count model could not be evaluated within the exact resource limit.",
                        ),
                    )
                )
                continue
            summary = _summary_values(values)
            summaries.append(
                UniformHandDeckCountSummaryResponse(
                    **base,
                    status="available",
                    outcomes=summary.outcomes,
                    ranges=summary.ranges,
                )
            )
    return summaries


def _action_outcome_summary(
    contract: str,
    values: list[ExactActionForecastResultResponse],
) -> UniformActionSummaryResponse:
    available = [value for value in values if value.status == "available"]
    if len(available) != len(values) or any(value.outcomes is None for value in available):
        error = next((value.error for value in values if value.error is not None), None)
        if available:
            error = _summary_error(
                "action_availability_varies_by_deck_count",
                "This action is not available across every valid deck-count model.",
            )
        return UniformActionSummaryResponse(
            contract=contract,
            status="unavailable",
            error=error or _summary_error(
                "action_forecast_unavailable",
                "This action is unavailable for every valid deck-count model.",
            ),
        )
    summary = _summary_values([value.outcomes for value in available if value.outcomes])
    return UniformActionSummaryResponse(
        contract=contract,
        status="available",
        outcomes=summary.outcomes,
        ranges=summary.ranges,
    )


def _terminal_action_summary(
    values: list[ExactTerminalActionForecastResultResponse],
) -> UniformActionSummaryResponse:
    if values and all(
        value.status == "available" and value.terminal == "surrendered"
        for value in values
    ):
        return UniformActionSummaryResponse(
            contract="surrender_now", status="available", terminal="surrendered"
        )
    available_count = sum(value.status == "available" for value in values)
    error = next((value.error for value in values if value.error is not None), None)
    if available_count:
        error = _summary_error(
            "action_availability_varies_by_deck_count",
            "Surrender is not available across every valid deck-count model.",
        )
    return UniformActionSummaryResponse(
        contract="surrender_now",
        status="unavailable",
        error=error or _summary_error(
            "action_forecast_unavailable",
            "Surrender is unavailable for every valid deck-count model.",
        ),
    )


def _split_action_summary(
    values: list[ExactSplitActionForecastResultResponse],
) -> UniformActionSummaryResponse:
    available = [value for value in values if value.status == "available"]
    if (
        len(available) != len(values)
        or any(value.child_hand_1 is None for value in available)
        or any(value.child_hand_2 is None for value in available)
    ):
        error = next((value.error for value in values if value.error is not None), None)
        if available:
            error = _summary_error(
                "action_availability_varies_by_deck_count",
                "Split is not available across every valid deck-count model.",
            )
        return UniformActionSummaryResponse(
            contract="split_one_card_each_then_stand",
            status="unavailable",
            error=error or _summary_error(
                "action_forecast_unavailable",
                "Split is unavailable for every valid deck-count model.",
            ),
        )
    return UniformActionSummaryResponse(
        contract="split_one_card_each_then_stand",
        status="available",
        child_hand_1=_summary_values(
            [value.child_hand_1 for value in available if value.child_hand_1]
        ),
        child_hand_2=_summary_values(
            [value.child_hand_2 for value in available if value.child_hand_2]
        ),
    )


def _action_deck_summaries(
    scenarios: list[ExactActionForecastScenarioResponse],
) -> list[UniformActionDeckCountSummaryResponse]:
    summaries: list[UniformActionDeckCountSummaryResponse] = []
    rules = sorted(
        {scenario.assumptions.dealer_soft_17 for scenario in scenarios},
        key=lambda value: value.value,
    )
    for rule in rules:
        group = [
            scenario
            for scenario in scenarios
            if scenario.assumptions.dealer_soft_17 is rule
        ]
        included, excluded = _deck_model_metadata(scenarios, rule)
        base = dict(
            dealer_soft_17=rule,
            candidate_deck_counts=list(range(1, 9)),
            included_deck_counts=included,
            excluded_deck_counts=excluded,
        )
        complete = [
            scenario.result
            for scenario in group
            if scenario.status == "complete" and scenario.result is not None
        ]
        if not included:
            summaries.append(
                UniformActionDeckCountSummaryResponse(
                    **base,
                    status="unavailable",
                    error=_summary_error(
                        "no_valid_deck_models",
                        "No physically valid deck-count models are available.",
                    ),
                )
            )
            continue
        if len(complete) != len(included):
            summaries.append(
                UniformActionDeckCountSummaryResponse(
                    **base,
                    status="unavailable",
                    error=_summary_error(
                        "deck_model_analysis_unavailable",
                        "At least one valid deck-count model could not be evaluated within the exact resource limit.",
                    ),
                )
            )
            continue
        forecasts = [result.action_forecasts for result in complete]
        summaries.append(
            UniformActionDeckCountSummaryResponse(
                **base,
                status="available",
                action_forecasts=UniformActionForecastsResponse(
                    stand_now=_action_outcome_summary(
                        "stand_now", [value.stand_now for value in forecasts]
                    ),
                    hit_once_then_stand=_action_outcome_summary(
                        "hit_once_then_stand",
                        [value.hit_once_then_stand for value in forecasts],
                    ),
                    double_one_card_then_stand=_action_outcome_summary(
                        "double_one_card_then_stand",
                        [value.double_one_card_then_stand for value in forecasts],
                    ),
                    surrender_now=_terminal_action_summary(
                        [value.surrender_now for value in forecasts]
                    ),
                    split_one_card_each_then_stand=_split_action_summary(
                        [value.split_one_card_each_then_stand for value in forecasts]
                    ),
                ),
            )
        )
    return summaries


def _monte_carlo_result(payload: AnalysisRequest) -> MonteCarloAnalysisResponse:
    assert isinstance(
        payload.options, (MonteCarloAnalysisOptions, CompareAnalysisOptions)
    )
    started = perf_counter()
    result = simulate_table(
        build_table_state(payload.state),
        payload.options.simulations,
        seed=payload.options.seed,
        dealer_check_result=payload.options.dealer_check_result,
    )
    intervals = {
        "win": wilson_interval(
            result.counts.win, result.simulations, payload.options.confidence_level
        ),
        "push": wilson_interval(
            result.counts.push, result.simulations, payload.options.confidence_level
        ),
        "loss": wilson_interval(
            result.counts.loss, result.simulations, payload.options.confidence_level
        ),
    }
    return MonteCarloAnalysisResponse(
        state_summary=AnalysisStateSummary(
            cards_remaining=result.cards_remaining,
            known_cards=result.known_cards,
            hidden_cards=result.hidden_cards,
        ),
        simulations=result.simulations,
        seed=result.seed,
        confidence_level=payload.options.confidence_level,
        counts=OutcomeCountsResponse(
            win=result.counts.win,
            push=result.counts.push,
            loss=result.counts.loss,
        ),
        outcomes=MonteCarloOutcomes(
            win=EstimatedOutcome(
                estimate=result.outcomes.win,
                ci_low=intervals["win"].lower,
                ci_high=intervals["win"].upper,
            ),
            push=EstimatedOutcome(
                estimate=result.outcomes.push,
                ci_low=intervals["push"].lower,
                ci_high=intervals["push"].upper,
            ),
            loss=EstimatedOutcome(
                estimate=result.outcomes.loss,
                ci_low=intervals["loss"].lower,
                ci_high=intervals["loss"].upper,
            ),
        ),
        runtime_ms=(perf_counter() - started) * 1000.0,
    )


def _comparison_outcome(
    exact: float, estimated: EstimatedOutcome
) -> ComparisonOutcomeResponse:
    signed_error = estimated.estimate - exact
    return ComparisonOutcomeResponse(
        exact_probability=exact,
        monte_carlo_estimate=estimated.estimate,
        ci_low=estimated.ci_low,
        ci_high=estimated.ci_high,
        signed_error=signed_error,
        absolute_error=abs(signed_error),
        exact_in_confidence_interval=(
            estimated.ci_low <= exact <= estimated.ci_high
        ),
    )


def _compare_result(payload: AnalysisRequest) -> CompareAnalysisResponse:
    assert isinstance(payload.options, CompareAnalysisOptions)
    try:
        exact = _exact_result(payload)
    except ExactAnalysisError as error:
        if error.code != "exact_computation_limit":
            raise
        monte_carlo = _monte_carlo_result(payload)
        return CompareAnalysisResponse(
            status="exact_unavailable",
            state_summary=monte_carlo.state_summary,
            monte_carlo=monte_carlo,
            exact_error=APIErrorDetail(code=error.code, message=error.message),
        )
    monte_carlo = _monte_carlo_result(payload)
    return CompareAnalysisResponse(
        status="complete",
        state_summary=exact.state_summary,
        exact=exact,
        monte_carlo=monte_carlo,
        comparison=ComparisonOutcomesResponse(
            win=_comparison_outcome(exact.outcomes.win, monte_carlo.outcomes.win),
            push=_comparison_outcome(exact.outcomes.push, monte_carlo.outcomes.push),
            loss=_comparison_outcome(exact.outcomes.loss, monte_carlo.outcomes.loss),
        ),
    )
@router.post(
    "/analyze",
    response_model=(
        ExactAnalysisResponse
        | ExactHandSummariesResponse
        | ExactHandSummariesScenarioAnalysisResponse
        | ExactActionForecastResponse
        | ExactActionForecastScenarioAnalysisResponse
        | ExactScenarioAnalysisResponse
        | MonteCarloAnalysisResponse
        | MonteCarloScenarioAnalysisResponse
        | CompareAnalysisResponse
        | CompareScenarioAnalysisResponse
    ),
    responses={422: {"model": APIErrorResponse}},
)
def analyze_exact(
    payload: AnalysisRequest,
) -> (
    ExactAnalysisResponse
    | ExactHandSummariesResponse
    | ExactHandSummariesScenarioAnalysisResponse
    | ExactActionForecastResponse
    | ExactActionForecastScenarioAnalysisResponse
    | ExactScenarioAnalysisResponse
    | MonteCarloAnalysisResponse
    | MonteCarloScenarioAnalysisResponse
    | CompareAnalysisResponse
    | CompareScenarioAnalysisResponse
    | JSONResponse
):
    plan = concrete_scenarios(payload.state)
    summary_state: ReconstructedTableState | None = None
    if isinstance(payload.options, ExactHandSummariesOptions):
        target = payload.options.target
        summary_state = build_table_state(payload.state)
        try:
            _validate_summary_target(
                summary_state, target.seat, target.hand_id
            )
        except ExactAnalysisError as error:
            return _error_response(error)
    if not plan.uncertainty:
        try:
            if isinstance(payload.options, ExactHandSummariesOptions):
                assert summary_state is not None
                return _hand_summaries_result_from_state(
                    summary_state, payload.options
                )
            if isinstance(payload.options, ExactActionForecastOptions):
                return _action_forecast_result(payload)
            if isinstance(payload.options, CompareAnalysisOptions):
                return _compare_result(payload)
            if isinstance(payload.options, MonteCarloAnalysisOptions):
                return _monte_carlo_result(payload)
            return _exact_result(payload)
        except ExactAnalysisError as error:
            return _error_response(error)

    exact_results: list[ExactScenarioResponse] = []
    hand_summary_results: list[ExactHandSummariesScenarioResponse] = []
    action_forecast_results: list[ExactActionForecastScenarioResponse] = []
    monte_carlo_results: list[MonteCarloScenarioResponse] = []
    compare_results: list[CompareScenarioResponse] = []
    for scenario in plan.scenarios:
        assumptions = ScenarioAssumptionsResponse(
            decks=scenario.assumptions.decks,
            dealer_soft_17=scenario.assumptions.dealer_soft_17,
        )
        concrete_request = payload.model_copy(update={"state": scenario.state})
        scenario_state = build_table_state(scenario.state)
        validation = validate_table_state(scenario_state)
        if not validation.valid:
            issue = validation.errors[0]
            error_detail = APIErrorDetail(
                code=issue.code, message=issue.message, field=issue.field
            )
            if isinstance(payload.options, ExactActionForecastOptions):
                action_forecast_results.append(
                    ExactActionForecastScenarioResponse(
                        assumptions=assumptions,
                        status="invalid",
                        error=error_detail,
                    )
                )
            elif isinstance(payload.options, ExactHandSummariesOptions):
                hand_summary_results.append(
                    ExactHandSummariesScenarioResponse(
                        assumptions=assumptions,
                        status="invalid",
                        error=error_detail,
                    )
                )
            elif isinstance(payload.options, CompareAnalysisOptions):
                compare_results.append(
                    CompareScenarioResponse(
                        assumptions=assumptions,
                        status="invalid",
                        error=error_detail,
                    )
                )
            elif isinstance(payload.options, MonteCarloAnalysisOptions):
                monte_carlo_results.append(
                    MonteCarloScenarioResponse(
                        assumptions=assumptions,
                        status="invalid",
                        error=error_detail,
                    )
                )
            else:
                exact_results.append(
                    ExactScenarioResponse(
                        assumptions=assumptions,
                        status="invalid",
                        error=error_detail,
                    )
                )
            continue
        try:
            if isinstance(payload.options, ExactActionForecastOptions):
                result = _action_forecast_result(concrete_request)
            elif isinstance(payload.options, ExactHandSummariesOptions):
                result = _hand_summaries_result_from_state(
                    scenario_state, payload.options
                )
            elif isinstance(payload.options, CompareAnalysisOptions):
                result = _compare_result(concrete_request)
            elif isinstance(payload.options, MonteCarloAnalysisOptions):
                result = _monte_carlo_result(concrete_request)
            else:
                result = _exact_result(concrete_request)
        except ExactAnalysisError as error:
            error_detail = APIErrorDetail(code=error.code, message=error.message)
            scenario_status = (
                "unavailable" if error.code == "exact_computation_limit" else "invalid"
            )
            if isinstance(payload.options, ExactActionForecastOptions):
                action_forecast_results.append(
                    ExactActionForecastScenarioResponse(
                        assumptions=assumptions,
                        status=scenario_status,
                        error=error_detail,
                    )
                )
            elif isinstance(payload.options, ExactHandSummariesOptions):
                hand_summary_results.append(
                    ExactHandSummariesScenarioResponse(
                        assumptions=assumptions,
                        status=scenario_status,
                        error=error_detail,
                    )
                )
            elif isinstance(payload.options, CompareAnalysisOptions):
                compare_results.append(
                    CompareScenarioResponse(
                        assumptions=assumptions,
                        status="invalid",
                        error=error_detail,
                    )
                )
            elif isinstance(payload.options, MonteCarloAnalysisOptions):
                monte_carlo_results.append(
                    MonteCarloScenarioResponse(
                        assumptions=assumptions,
                        status="invalid",
                        error=error_detail,
                    )
                )
            else:
                exact_results.append(
                    ExactScenarioResponse(
                        assumptions=assumptions,
                        status=scenario_status,
                        error=error_detail,
                    )
                )
        else:
            if isinstance(result, ExactActionForecastResponse):
                action_forecast_results.append(
                    ExactActionForecastScenarioResponse(
                        assumptions=assumptions,
                        result=result,
                    )
                )
            elif isinstance(result, ExactHandSummariesResponse):
                hand_summary_results.append(
                    ExactHandSummariesScenarioResponse(
                        assumptions=assumptions,
                        status="complete",
                        result=result,
                    )
                )
            elif isinstance(result, CompareAnalysisResponse):
                compare_results.append(
                    CompareScenarioResponse(
                        assumptions=assumptions,
                        status="complete",
                        result=result,
                    )
                )
            elif isinstance(result, MonteCarloAnalysisResponse):
                monte_carlo_results.append(
                    MonteCarloScenarioResponse(
                        assumptions=assumptions,
                        status="complete",
                        result=result,
                    )
                )
            else:
                exact_results.append(
                    ExactScenarioResponse(
                        assumptions=assumptions,
                        status="complete",
                        result=result,
                    )
                )
    if isinstance(payload.options, ExactActionForecastOptions):
        return ExactActionForecastScenarioAnalysisResponse(
            model_uncertainty=list(plan.uncertainty),
            scenarios=action_forecast_results,
            deck_count_summaries=(
                _action_deck_summaries(action_forecast_results)
                if "deck_count" in plan.uncertainty
                else []
            ),
        )
    if isinstance(payload.options, ExactHandSummariesOptions):
        target = ActionForecastTargetResponse(
            seat=payload.options.target.seat,
            hand_id=payload.options.target.hand_id,
        )
        ordered_targets = [
            ActionForecastTargetResponse(
                seat=player.seat,
                hand_id=player.hand_id or f"seat-{player.seat}-hand-1",
            )
            for player in payload.state.players
            if player.seat == target.seat
        ]
        return ExactHandSummariesScenarioAnalysisResponse(
            target=target,
            model_uncertainty=list(plan.uncertainty),
            scenarios=hand_summary_results,
            deck_count_summaries=(
                _hand_deck_summaries(hand_summary_results, ordered_targets)
                if "deck_count" in plan.uncertainty
                else []
            ),
        )
    if isinstance(payload.options, CompareAnalysisOptions):
        return CompareScenarioAnalysisResponse(
            model_uncertainty=list(plan.uncertainty),
            scenarios=compare_results,
        )
    if isinstance(payload.options, MonteCarloAnalysisOptions):
        return MonteCarloScenarioAnalysisResponse(
            model_uncertainty=list(plan.uncertainty),
            scenarios=monte_carlo_results,
        )
    return ExactScenarioAnalysisResponse(
        model_uncertainty=list(plan.uncertainty),
        scenarios=exact_results,
        deck_count_summaries=(
            _exact_deck_summaries(exact_results)
            if "deck_count" in plan.uncertainty
            else []
        ),
    )
