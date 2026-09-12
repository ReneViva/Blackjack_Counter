from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.domain import DealerCheckResult
from app.engine import ReconstructedTableState, build_table_state, validate_table_state
from app.probability import ExactAnalysisError, analyze_exact_table, concrete_scenarios
from app.research import (
    ACE_INFORMATION,
    ResearchScore,
    compare_table_research,
    get_primary_definition,
)
from app.schemas import (
    APIErrorDetail,
    APIErrorResponse,
    AceInformationResponse,
    OutcomeProbabilities,
    PublishedResearchMetricsResponse,
    ResearchComparisonRequest,
    ResearchComparisonResponse,
    ResearchDefinitionResponse,
    ResearchExactReferenceResponse,
    ResearchExactScenarioAnalysisResponse,
    ResearchExactScenarioResponse,
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
    metrics = definition.published_metrics
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
        definition=ResearchDefinitionResponse(
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
        ),
        raw_score=float(score.score),
        raw_score_fraction=str(score.score),
        observed_known_cards=score.observed_known_cards,
        unresolved_unknown_cards=score.unresolved_unknown_cards,
        complete=score.complete,
        ace_information=ace_information,
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
