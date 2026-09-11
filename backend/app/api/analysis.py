from time import perf_counter

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.engine import build_table_state
from app.probability import ExactAnalysisError, analyze_exact_table
from app.schemas import (
    APIErrorDetail,
    APIErrorResponse,
    AnalysisMetadata,
    AnalysisStateSummary,
    ExactAnalysisRequest,
    ExactAnalysisResponse,
    OutcomeProbabilities,
)


router = APIRouter(prefix="/api", tags=["analysis"])


def _error_response(error: ExactAnalysisError) -> JSONResponse:
    payload = APIErrorResponse(
        error=APIErrorDetail(code=error.code, message=error.message)
    )
    return JSONResponse(status_code=422, content=payload.model_dump())


@router.post(
    "/analyze",
    response_model=ExactAnalysisResponse,
    responses={422: {"model": APIErrorResponse}},
)
def analyze_exact(
    payload: ExactAnalysisRequest,
) -> ExactAnalysisResponse | JSONResponse:
    started = perf_counter()
    try:
        result = analyze_exact_table(build_table_state(payload.state))
    except ExactAnalysisError as error:
        return _error_response(error)
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
        ),
    )
