from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.domain import DealerCheckResult
from app.engine import ReconstructedTableState, build_table_state, validate_table_state
from app.probability import (
    ExactAnalysisError,
    OutcomeDistribution,
    analyze_exact_table,
    concrete_scenarios,
    summarize_outcomes,
)
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
    OutcomeRangesResponse,
    ProbabilityRangeResponse,
    ExcludedDeckCountResponse,
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
    ResearchTagResponse,
    ScenarioAssumptionsResponse,
    UniformDeckCountSummaryResponse,
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
        canonical_tags=[
            ResearchTagResponse(
                card_value=rank,
                tag_fraction=str(tag),
                tag_decimal=float(tag),
            )
            for rank, tag in definition.tags
        ],
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
    scenarios: list[ResearchExactScenarioResponse] = []
    for scenario in plan.scenarios:
        assumptions = ScenarioAssumptionsResponse(
            decks=scenario.assumptions.decks,
            dealer_soft_17=scenario.assumptions.dealer_soft_17,
        )
        concrete_state = build_table_state(scenario.state)
        validation = validate_table_state(concrete_state)
        if not validation.valid:
            issue = validation.errors[0]
            scenarios.append(
                ResearchExactScenarioResponse(
                    assumptions=assumptions,
                    status="invalid",
                    reference=ResearchExactReferenceResponse(
                        status="unavailable",
                        error=APIErrorDetail(
                            code=issue.code,
                            message=issue.message,
                            field=issue.field,
                        ),
                    ),
                )
            )
            continue
        reference = _exact_reference(
            concrete_state, payload.options.dealer_check_result
        )
        scenarios.append(
            ResearchExactScenarioResponse(
                assumptions=assumptions,
                status=(
                    "complete"
                    if reference.status == "complete"
                    else "unavailable"
                ),
                reference=reference,
            )
        )
    return ResearchExactScenarioAnalysisResponse(
        model_uncertainty=list(plan.uncertainty),
        scenarios=scenarios,
        deck_count_summaries=(
            _research_deck_summaries(scenarios)
            if "deck_count" in plan.uncertainty
            else []
        ),
    )


def _research_deck_summaries(
    scenarios: list[ResearchExactScenarioResponse],
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
        included = sorted(
            scenario.assumptions.decks
            for scenario in group
            if scenario.status != "invalid"
        )
        excluded = [
            ExcludedDeckCountResponse(
                deck_count=scenario.assumptions.decks,
                code=(
                    scenario.reference.error.code
                    if scenario.reference.error
                    else "invalid_model"
                ),
                message=(
                    scenario.reference.error.message
                    if scenario.reference.error
                    else "The deck-count model is physically invalid."
                ),
            )
            for scenario in group
            if scenario.status == "invalid"
        ]
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
                    error=APIErrorDetail(
                        code="no_valid_deck_models",
                        message="No physically valid deck-count models are available.",
                    ),
                )
            )
            continue
        complete = [
            scenario
            for scenario in group
            if scenario.status == "complete"
            and scenario.reference.outcomes is not None
        ]
        if len(complete) != len(included):
            summaries.append(
                UniformDeckCountSummaryResponse(
                    **base,
                    status="unavailable",
                    error=APIErrorDetail(
                        code="deck_model_analysis_unavailable",
                        message=(
                            "At least one valid deck-count model could not be "
                            "evaluated within the exact resource limit."
                        ),
                    ),
                )
            )
            continue
        model_summary = summarize_outcomes(
            OutcomeDistribution(
                win=scenario.reference.outcomes.win,
                push=scenario.reference.outcomes.push,
                loss=scenario.reference.outcomes.loss,
            )
            for scenario in complete
            if scenario.reference.outcomes is not None
        )
        summaries.append(
            UniformDeckCountSummaryResponse(
                **base,
                status="available",
                outcomes=OutcomeProbabilities(
                    win=model_summary.outcomes.win,
                    push=model_summary.outcomes.push,
                    loss=model_summary.outcomes.loss,
                ),
                ranges=OutcomeRangesResponse(
                    win=ProbabilityRangeResponse(
                        minimum=model_summary.win_range.minimum,
                        maximum=model_summary.win_range.maximum,
                    ),
                    push=ProbabilityRangeResponse(
                        minimum=model_summary.push_range.minimum,
                        maximum=model_summary.push_range.maximum,
                    ),
                    loss=ProbabilityRangeResponse(
                        minimum=model_summary.loss_range.minimum,
                        maximum=model_summary.loss_range.maximum,
                    ),
                ),
            )
        )
    return summaries


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
