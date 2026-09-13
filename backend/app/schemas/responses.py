from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .errors import APIErrorDetail
from app.domain import DealerSoft17


class ValidationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool = True
    errors: list[APIErrorDetail] = Field(default_factory=list)
    warnings: list[APIErrorDetail] = Field(default_factory=list)


class LegalActionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allowed: bool
    code: str | None = None
    reason: str | None = None


class PlayerActionsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    split: LegalActionResponse


class OutcomeProbabilities(BaseModel):
    model_config = ConfigDict(extra="forbid")

    win: float
    push: float
    loss: float


class AnalysisStateSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cards_remaining: int
    known_cards: int
    hidden_cards: int


class AnalysisMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    states_evaluated: int
    cache_hits: int
    cache_misses: int
    runtime_ms: float
    hidden_states_evaluated: int = 0
    hidden_weight_mass: float = 1.0


class ExactAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact"] = "exact"
    state_summary: AnalysisStateSummary
    outcomes: OutcomeProbabilities
    metadata: AnalysisMetadata


class OutcomeCountsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    win: int
    push: int
    loss: int


class EstimatedOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estimate: float
    ci_low: float
    ci_high: float


class MonteCarloOutcomes(BaseModel):
    model_config = ConfigDict(extra="forbid")

    win: EstimatedOutcome
    push: EstimatedOutcome
    loss: EstimatedOutcome


class MonteCarloAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["monte_carlo"] = "monte_carlo"
    state_summary: AnalysisStateSummary
    simulations: int
    seed: int | None
    confidence_level: Literal[0.9, 0.95, 0.99]
    counts: OutcomeCountsResponse
    outcomes: MonteCarloOutcomes
    runtime_ms: float


class ComparisonOutcomeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exact_probability: float
    monte_carlo_estimate: float
    ci_low: float
    ci_high: float
    signed_error: float
    absolute_error: float
    exact_in_confidence_interval: bool


class ComparisonOutcomesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    win: ComparisonOutcomeResponse
    push: ComparisonOutcomeResponse
    loss: ComparisonOutcomeResponse


class CompareAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["compare"] = "compare"
    status: Literal["complete", "exact_unavailable"]
    state_summary: AnalysisStateSummary
    exact: ExactAnalysisResponse | None = None
    monte_carlo: MonteCarloAnalysisResponse
    comparison: ComparisonOutcomesResponse | None = None
    exact_error: APIErrorDetail | None = None


class ScenarioAssumptionsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decks: int
    dealer_soft_17: DealerSoft17


class ExactScenarioResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assumptions: ScenarioAssumptionsResponse
    status: Literal["complete", "invalid"]
    result: ExactAnalysisResponse | None = None
    error: APIErrorDetail | None = None


class ExactScenarioAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact"] = "exact"
    model_uncertainty: list[Literal["deck_count", "dealer_soft_17"]]
    aggregation: Literal["none"] = "none"
    scenarios: list[ExactScenarioResponse]


class MonteCarloScenarioResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assumptions: ScenarioAssumptionsResponse
    status: Literal["complete", "invalid"]
    result: MonteCarloAnalysisResponse | None = None
    error: APIErrorDetail | None = None


class MonteCarloScenarioAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["monte_carlo"] = "monte_carlo"
    model_uncertainty: list[Literal["deck_count", "dealer_soft_17"]]
    aggregation: Literal["none"] = "none"
    scenarios: list[MonteCarloScenarioResponse]


class CompareScenarioResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assumptions: ScenarioAssumptionsResponse
    status: Literal["complete", "invalid"]
    result: CompareAnalysisResponse | None = None
    error: APIErrorDetail | None = None


class CompareScenarioAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["compare"] = "compare"
    model_uncertainty: list[Literal["deck_count", "dealer_soft_17"]]
    aggregation: Literal["none"] = "none"
    scenarios: list[CompareScenarioResponse]


class APIErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error: APIErrorDetail
