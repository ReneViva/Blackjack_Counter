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


class ActionForecastTargetResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seat: int
    hand_id: str


class ExactHandSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target: ActionForecastTargetResponse
    status: Literal["complete", "unavailable"]
    state_summary: AnalysisStateSummary | None = None
    outcomes: OutcomeProbabilities | None = None
    metadata: AnalysisMetadata | None = None
    error: APIErrorDetail | None = None


class ExactHandSummariesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact_hand_summaries"] = "exact_hand_summaries"
    target: ActionForecastTargetResponse
    hands: list[ExactHandSummaryResponse]


class ExactActionForecastResultResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract: Literal[
        "stand_now",
        "hit_once_then_stand",
        "double_one_card_then_stand",
    ]
    status: Literal["available", "unavailable"]
    method: Literal["exact"] = "exact"
    outcomes: OutcomeProbabilities | None = None
    metadata: AnalysisMetadata | None = None
    error: APIErrorDetail | None = None


class ExactTerminalActionForecastResultResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract: Literal["surrender_now"] = "surrender_now"
    status: Literal["available", "unavailable"]
    method: Literal["exact"] = "exact"
    terminal: Literal["surrendered"] | None = None
    error: APIErrorDetail | None = None


class ExactSplitActionForecastResultResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract: Literal["split_one_card_each_then_stand"] = (
        "split_one_card_each_then_stand"
    )
    status: Literal["available", "unavailable"]
    method: Literal["exact"] = "exact"
    child_hand_1: OutcomeProbabilities | None = None
    child_hand_2: OutcomeProbabilities | None = None
    metadata: AnalysisMetadata | None = None
    error: APIErrorDetail | None = None


class ExactActionForecastsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stand_now: ExactActionForecastResultResponse
    hit_once_then_stand: ExactActionForecastResultResponse
    double_one_card_then_stand: ExactActionForecastResultResponse
    surrender_now: ExactTerminalActionForecastResultResponse
    split_one_card_each_then_stand: ExactSplitActionForecastResultResponse


class ExactActionForecastResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact_action_forecast"] = "exact_action_forecast"
    target: ActionForecastTargetResponse | None = None
    action_forecasts: ExactActionForecastsResponse


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


class ProbabilityRangeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    minimum: float
    maximum: float


class OutcomeRangesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    win: ProbabilityRangeResponse
    push: ProbabilityRangeResponse
    loss: ProbabilityRangeResponse


class ExcludedDeckCountResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    deck_count: int
    code: str
    message: str


class OutcomeModelSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcomes: OutcomeProbabilities
    ranges: OutcomeRangesResponse


class UniformDeckCountSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["uniform_valid_deck_count_mean"] = (
        "uniform_valid_deck_count_mean"
    )
    assumption: Literal["equal_weight_valid_deck_counts"] = (
        "equal_weight_valid_deck_counts"
    )
    dealer_soft_17: DealerSoft17
    status: Literal["available", "unavailable"]
    candidate_deck_counts: list[int]
    included_deck_counts: list[int]
    excluded_deck_counts: list[ExcludedDeckCountResponse]
    outcomes: OutcomeProbabilities | None = None
    ranges: OutcomeRangesResponse | None = None
    error: APIErrorDetail | None = None


class UniformActionSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    contract: Literal[
        "stand_now",
        "hit_once_then_stand",
        "double_one_card_then_stand",
        "surrender_now",
        "split_one_card_each_then_stand",
    ]
    status: Literal["available", "unavailable"]
    outcomes: OutcomeProbabilities | None = None
    ranges: OutcomeRangesResponse | None = None
    terminal: Literal["surrendered"] | None = None
    child_hand_1: OutcomeModelSummaryResponse | None = None
    child_hand_2: OutcomeModelSummaryResponse | None = None
    error: APIErrorDetail | None = None


class UniformActionForecastsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stand_now: UniformActionSummaryResponse
    hit_once_then_stand: UniformActionSummaryResponse
    double_one_card_then_stand: UniformActionSummaryResponse
    surrender_now: UniformActionSummaryResponse
    split_one_card_each_then_stand: UniformActionSummaryResponse


class UniformActionDeckCountSummaryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["uniform_valid_deck_count_mean"] = (
        "uniform_valid_deck_count_mean"
    )
    assumption: Literal["equal_weight_valid_deck_counts"] = (
        "equal_weight_valid_deck_counts"
    )
    dealer_soft_17: DealerSoft17
    status: Literal["available", "unavailable"]
    candidate_deck_counts: list[int]
    included_deck_counts: list[int]
    excluded_deck_counts: list[ExcludedDeckCountResponse]
    action_forecasts: UniformActionForecastsResponse | None = None
    error: APIErrorDetail | None = None


class ExactScenarioResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assumptions: ScenarioAssumptionsResponse
    status: Literal["complete", "invalid", "unavailable"]
    result: ExactAnalysisResponse | None = None
    error: APIErrorDetail | None = None


class ExactScenarioAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact"] = "exact"
    model_uncertainty: list[Literal["deck_count", "dealer_soft_17"]]
    aggregation: Literal["none"] = "none"
    resource_limit_scope: Literal["per_scenario"] = "per_scenario"
    exact_state_limit_per_scenario: int = 2_000_000
    scenarios: list[ExactScenarioResponse]
    deck_count_summaries: list[UniformDeckCountSummaryResponse] = Field(
        default_factory=list
    )


class ExactHandSummariesScenarioResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assumptions: ScenarioAssumptionsResponse
    status: Literal["complete", "invalid", "unavailable"]
    result: ExactHandSummariesResponse | None = None
    error: APIErrorDetail | None = None


class UniformHandDeckCountSummaryResponse(UniformDeckCountSummaryResponse):
    target: ActionForecastTargetResponse


class ExactHandSummariesScenarioAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact_hand_summaries"] = "exact_hand_summaries"
    target: ActionForecastTargetResponse
    model_uncertainty: list[Literal["deck_count", "dealer_soft_17"]]
    aggregation: Literal["none"] = "none"
    resource_limit_scope: Literal["per_scenario"] = "per_scenario"
    exact_state_limit_per_scenario: int = 2_000_000
    scenarios: list[ExactHandSummariesScenarioResponse]
    deck_count_summaries: list[UniformHandDeckCountSummaryResponse] = Field(
        default_factory=list
    )


class ExactActionForecastScenarioResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assumptions: ScenarioAssumptionsResponse
    status: Literal["complete", "invalid", "unavailable"] = "complete"
    result: ExactActionForecastResponse | None = None
    error: APIErrorDetail | None = None


class ExactActionForecastScenarioAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact_action_forecast"] = "exact_action_forecast"
    model_uncertainty: list[Literal["deck_count", "dealer_soft_17"]]
    aggregation: Literal["none"] = "none"
    resource_limit_scope: Literal["per_scenario"] = "per_scenario"
    exact_state_limit_per_scenario: int = 2_000_000
    scenarios: list[ExactActionForecastScenarioResponse]
    deck_count_summaries: list[UniformActionDeckCountSummaryResponse] = Field(
        default_factory=list
    )


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
