from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.domain import DealerCheckResult
from app.engine import ReconstructedTableState, build_table_state, validate_table_state
from app.probability import ExactAnalysisError, analyze_exact_table, concrete_scenarios
from app.research import (
    ACE_INFORMATION,
    EXPERIMENT_VERSION,
    ExperimentValidationError,
    PearsonMetric,
    ResearchScore,
    compare_table_research,
    compute_experiment_metrics,
    generate_batch_experiment,
    get_primary_definition,
)
from app.schemas import (
    APIErrorDetail,
    APIErrorResponse,
    AceInformationResponse,
    OutcomeProbabilities,
    PublishedResearchMetricsResponse,
    ResearchBatchCaseResponse,
    ResearchBatchRequest,
    ResearchBatchResponse,
    ResearchComparisonRequest,
    ResearchComparisonResponse,
    ResearchDefinitionResponse,
    ResearchExactReferenceResponse,
    ResearchExactScenarioAnalysisResponse,
    ResearchExactScenarioResponse,
    ResearchMetricResponse,
    ResearchScoreResponse,
    ResearchSourceResponse,
    ScenarioAssumptionsResponse,
)


router = APIRouter(prefix="/api/research", tags=["research"])


def _error_response(code: str, message: str) -> JSONResponse:
    payload = APIErrorResponse(error=APIErrorDetail(code=code, message=message))
    return JSONResponse(status_code=422, content=payload.model_dump())


def _source_response(definition_id: str) -> ResearchSourceResponse:
    source = get_primary_definition(definition_id).source
    return ResearchSourceResponse(
        source_id=source.source_id,
        title=source.title,
        local_path=source.local_path,
        sha256=source.sha256,
        locator=source.locator,
    )


def _score_response(score: ResearchScore) -> ResearchScoreResponse:
    definition = get_primary_definition(score.definition_id)
    ace_information = None
    if score.ace_information is not None:
        ace_information = AceInformationResponse(
            source_id=ACE_INFORMATION.source.source_id,
            associated_definition_id=score.definition_id,
            primary_ace_classification=(
                score.ace_information.primary_ace_classification.value
            ),
            known_aces_observed=score.ace_information.known_aces_observed,
            exact_aces_remaining=score.ace_information.exact_aces_remaining,
            complete=score.ace_information.complete,
        )
    return ResearchScoreResponse(
        definition=_definition_response(definition.identifier),
        raw_score=float(score.score),
        raw_score_fraction=str(score.score),
        observed_known_cards=score.observed_known_cards,
        unresolved_unknown_cards=score.unresolved_unknown_cards,
        complete=score.complete,
        ace_information=ace_information,
    )


def _definition_response(definition_id: str) -> ResearchDefinitionResponse:
    definition = get_primary_definition(definition_id)
    metrics = definition.published_metrics
    return ResearchDefinitionResponse(
        identifier=definition.identifier,
        label=definition.label,
        balanced=definition.balanced,
        level=definition.level,
        ace_classification=definition.ace_classification.value,
        source=_source_response(definition.identifier),
        published_metrics=PublishedResearchMetricsResponse(
            pe=float(metrics.playing_efficiency),
            bc=float(metrics.betting_correlation),
            ic=float(metrics.insurance_correlation),
        ),
    )


def _metric_response(metric: PearsonMetric) -> ResearchMetricResponse:
    return ResearchMetricResponse(
        metric_id=metric.metric_id,
        definition_id=metric.definition_id,
        source_id=metric.source_id,
        target=metric.target,
        status=metric.status,
        value=metric.value,
        total_cases=metric.total_cases,
        eligible_cases=metric.eligible_cases,
        excluded_incomplete_score=metric.excluded_incomplete_score,
        excluded_exact_unavailable=metric.excluded_exact_unavailable,
        excluded_nonfinite=metric.excluded_nonfinite,
        formula=metric.formula,
    )


def _exact_reference(
    state: ReconstructedTableState,
    dealer_check_result: DealerCheckResult,
) -> ResearchExactReferenceResponse:
    try:
        result = analyze_exact_table(
            state, dealer_check_result=dealer_check_result
        )
    except ExactAnalysisError as error:
        return ResearchExactReferenceResponse(
            status="unavailable",
            error=APIErrorDetail(code=error.code, message=error.message),
        )
    return ResearchExactReferenceResponse(
        status="complete",
        outcomes=OutcomeProbabilities(
            win=result.outcomes.win,
            push=result.outcomes.push,
            loss=result.outcomes.loss,
        ),
    )


def _scenario_exact_reference(
    payload: ResearchComparisonRequest,
) -> ResearchExactScenarioAnalysisResponse:
    plan = concrete_scenarios(payload.state)
    return ResearchExactScenarioAnalysisResponse(
        model_uncertainty=list(plan.uncertainty),
        scenarios=[
            ResearchExactScenarioResponse(
                assumptions=ScenarioAssumptionsResponse(
                    decks=scenario.assumptions.decks,
                    dealer_soft_17=scenario.assumptions.dealer_soft_17,
                ),
                reference=_exact_reference(
                    build_table_state(scenario.state),
                    payload.options.dealer_check_result,
                ),
            )
            for scenario in plan.scenarios
        ],
    )


@router.post(
    "/compare",
    response_model=ResearchComparisonResponse,
    responses={422: {"model": APIErrorResponse}},
)
def compare_research(
    payload: ResearchComparisonRequest,
) -> ResearchComparisonResponse | JSONResponse:
    state = build_table_state(payload.state)
    validation = validate_table_state(state)
    if not validation.valid:
        issue = validation.errors[0]
        return _error_response("invalid_state", issue.message)

    comparison = compare_table_research(
        state,
        tuple(payload.options.primary_definition_ids),
        include_ace_information=payload.options.include_ace_information,
    )

    exact_reference = None
    if payload.options.include_exact_reference:
        plan = concrete_scenarios(payload.state)
        exact_reference = (
            _exact_reference(state, payload.options.dealer_check_result)
            if not plan.uncertainty
            else _scenario_exact_reference(payload)
        )

    return ResearchComparisonResponse(
        scores=[_score_response(score) for score in comparison.scores],
        exact_reference=exact_reference,
    )


@router.post(
    "/batch",
    response_model=ResearchBatchResponse,
    responses={422: {"model": APIErrorResponse}},
)
def run_research_batch(
    payload: ResearchBatchRequest,
) -> ResearchBatchResponse | JSONResponse:
    state = build_table_state(payload.state)
    definitions = tuple(
        get_primary_definition(identifier) for identifier in payload.definition_ids
    )
    try:
        experiment = generate_batch_experiment(
            state,
            definitions,
            case_count=payload.case_count,
            removed_cards_per_case=payload.removed_cards_per_case,
            seed=payload.seed,
            include_ace_information=payload.include_ace_information,
            dealer_check_result=payload.dealer_check_result,
        )
    except ExperimentValidationError as error:
        return _error_response(error.code, error.message)

    metrics = compute_experiment_metrics(
        experiment.cases, experiment.definition_ids
    )
    cases: list[ResearchBatchCaseResponse] = []
    for case in experiment.cases:
        reference = case.exact_reference
        exact_response = (
            ResearchExactReferenceResponse(
                status="complete",
                outcomes=OutcomeProbabilities(
                    win=reference.outcomes.win,
                    push=reference.outcomes.push,
                    loss=reference.outcomes.loss,
                ),
            )
            if reference.outcomes is not None
            else ResearchExactReferenceResponse(
                status="unavailable",
                error=APIErrorDetail(
                    code=reference.error_code or "exact_unavailable",
                    message=reference.error_message or "Exact analysis unavailable.",
                ),
            )
        )
        cases.append(
            ResearchBatchCaseResponse(
                case_id=case.case_id,
                case_index=case.case_index,
                sampled_removed_ranks=list(case.sampled_removed_ranks),
                removed_card_count=len(case.sampled_removed_ranks),
                exact_reference_status=case.exact_reference.status,
                exact_reference=exact_response,
                exact_outcome_balance=case.exact_outcome_balance,
                research_results=[
                    _score_response(result) for result in case.research_results
                ],
            )
        )
    return ResearchBatchResponse(
        version=EXPERIMENT_VERSION,
        seed=experiment.seed,
        requested_case_count=experiment.requested_case_count,
        completed_case_count=len(experiment.cases),
        removed_cards_per_case=experiment.removed_cards_per_case,
        definition_ids=list(experiment.definition_ids),
        source=_source_response(experiment.definition_ids[0]),
        definitions=[
            _definition_response(identifier)
            for identifier in experiment.definition_ids
        ],
        cases=cases,
        metrics=[_metric_response(metric) for metric in metrics],
        exact_available_count=(
            len(experiment.cases) - experiment.exact_unavailable_count
        ),
        exact_unavailable_count=experiment.exact_unavailable_count,
    )
