from time import perf_counter

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.engine import build_table_state
from app.probability import (
    ExactAnalysisError,
    ExactActionForecast,
    analyze_exact_action_forecasts,
    analyze_exact_table,
    concrete_scenarios,
    simulate_table,
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
    ExactActionForecastResponse,
    ExactActionForecastResultResponse,
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
    ScenarioAssumptionsResponse,
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
        ),
    )


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
    if not plan.uncertainty:
        try:
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
    action_forecast_results: list[ExactActionForecastScenarioResponse] = []
    monte_carlo_results: list[MonteCarloScenarioResponse] = []
    compare_results: list[CompareScenarioResponse] = []
    for scenario in plan.scenarios:
        assumptions = ScenarioAssumptionsResponse(
            decks=scenario.assumptions.decks,
            dealer_soft_17=scenario.assumptions.dealer_soft_17,
        )
        concrete_request = payload.model_copy(update={"state": scenario.state})
        try:
            if isinstance(payload.options, ExactActionForecastOptions):
                result = _action_forecast_result(concrete_request)
            elif isinstance(payload.options, CompareAnalysisOptions):
                result = _compare_result(concrete_request)
            elif isinstance(payload.options, MonteCarloAnalysisOptions):
                result = _monte_carlo_result(concrete_request)
            else:
                result = _exact_result(concrete_request)
        except ExactAnalysisError as error:
            error_detail = APIErrorDetail(code=error.code, message=error.message)
            if isinstance(payload.options, ExactActionForecastOptions):
                action_forecast_results.append(
                    ExactActionForecastScenarioResponse(
                        assumptions=assumptions,
                        result=_action_forecast_result(concrete_request),
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
        else:
            if isinstance(result, ExactActionForecastResponse):
                action_forecast_results.append(
                    ExactActionForecastScenarioResponse(
                        assumptions=assumptions,
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
        model_uncertainty=list(plan.uncertainty), scenarios=exact_results
    )
