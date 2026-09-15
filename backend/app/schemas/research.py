from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    field_validator,
)

from app.domain import DealerCheckResult, Rank

from .errors import APIErrorDetail
from .responses import (
    OutcomeProbabilities,
    ScenarioAssumptionsResponse,
    UniformDeckCountSummaryResponse,
)
from .table import TableStateSchema


ResearchDefinitionId = Literal["hi_lo", "wong_halves", "zen_count", "omega_ii"]


class ResearchComparisonOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    primary_definition_ids: list[ResearchDefinitionId] = Field(
        default_factory=lambda: [
            "hi_lo",
            "wong_halves",
            "zen_count",
            "omega_ii",
        ],
        min_length=1,
    )
    include_ace_information: StrictBool = False
    include_exact_reference: StrictBool = True
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED

    @field_validator("primary_definition_ids")
    @classmethod
    def definitions_must_be_unique(
        cls, value: list[ResearchDefinitionId]
    ) -> list[ResearchDefinitionId]:
        if len(value) != len(set(value)):
            raise ValueError("primary research definitions must be unique")
        return value


class ResearchComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: TableStateSchema
    options: ResearchComparisonOptions = Field(
        default_factory=ResearchComparisonOptions
    )


class ResearchSourceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: str
    title: str
    local_path: str
    sha256: str
    locator: str


class PublishedResearchMetricsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["published_static_metadata"] = "published_static_metadata"
    pe: float
    bc: float
    ic: float


class ResearchTagResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    card_value: Rank
    tag_fraction: str
    tag_decimal: float


class ResearchDefinitionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identifier: ResearchDefinitionId
    label: str
    balanced: bool
    level: int
    ace_classification: Literal["ace_reckoned", "ace_neutral"]
    canonical_tags: list[ResearchTagResponse]
    source: ResearchSourceResponse
    published_metrics: PublishedResearchMetricsResponse


class AceInformationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feature_id: Literal["ace_information"] = "ace_information"
    label: Literal["Ace Information"] = "Ace Information"
    source_id: str
    associated_definition_id: ResearchDefinitionId
    primary_ace_classification: Literal["ace_reckoned", "ace_neutral"]
    known_aces_observed: int
    exact_aces_remaining: int | None
    complete: bool


class ResearchScoreResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    definition: ResearchDefinitionResponse
    raw_score: float
    raw_score_fraction: str
    observed_known_cards: int
    unresolved_unknown_cards: int
    complete: bool
    ace_information: AceInformationResponse | None = None


class ResearchExactReferenceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact"] = "exact"
    status: Literal["complete", "unavailable"]
    outcomes: OutcomeProbabilities | None = None
    error: APIErrorDetail | None = None


class ResearchExactScenarioResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assumptions: ScenarioAssumptionsResponse
    status: Literal["complete", "invalid", "unavailable"] = "complete"
    reference: ResearchExactReferenceResponse


class ResearchExactScenarioAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact"] = "exact"
    model_uncertainty: list[Literal["deck_count", "dealer_soft_17"]]
    aggregation: Literal["none"] = "none"
    resource_limit_scope: Literal["per_scenario"] = "per_scenario"
    exact_state_limit_per_scenario: int = 2_000_000
    scenarios: list[ResearchExactScenarioResponse]
    deck_count_summaries: list[UniformDeckCountSummaryResponse] = Field(
        default_factory=list
    )


class ResearchComparisonResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["research_comparison"] = "research_comparison"
    scores: list[ResearchScoreResponse]
    exact_reference: (
        ResearchExactReferenceResponse
        | ResearchExactScenarioAnalysisResponse
        | None
    ) = None


class ResearchBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: TableStateSchema
    definition_ids: list[ResearchDefinitionId] = Field(
        default_factory=lambda: [
            "hi_lo",
            "wong_halves",
            "zen_count",
            "omega_ii",
        ],
        min_length=1,
        max_length=4,
    )
    case_count: StrictInt = Field(default=25, ge=2, le=50)
    removed_cards_per_case: StrictInt = Field(default=6, ge=0, le=20)
    seed: StrictInt = Field(ge=0, le=9_223_372_036_854_775_807)
    include_ace_information: StrictBool = False
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED

    @field_validator("definition_ids")
    @classmethod
    def batch_definitions_must_be_unique(
        cls, value: list[ResearchDefinitionId]
    ) -> list[ResearchDefinitionId]:
        if len(value) != len(set(value)):
            raise ValueError("primary research definitions must be unique")
        return value


class ResearchBatchCaseResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    case_id: str
    case_index: int
    sampled_removed_ranks: list[Rank]
    removed_card_count: int
    exact_reference_status: Literal["available", "unavailable"]
    exact_reference: ResearchExactReferenceResponse
    exact_outcome_balance: float | None
    research_results: list[ResearchScoreResponse]


class ResearchMetricResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metric_id: Literal[
        "pearson_score_vs_win_probability",
        "pearson_score_vs_outcome_balance",
    ]
    definition_id: ResearchDefinitionId
    source_id: str
    target: Literal["exact_win_probability", "exact_outcome_balance"]
    status: Literal[
        "available", "insufficient_data", "undefined_constant_input"
    ]
    value: float | None
    total_cases: int
    eligible_cases: int
    excluded_incomplete_score: int
    excluded_exact_unavailable: int
    excluded_nonfinite: int
    formula: Literal["pearson_centered_sums_v1"]


class ResearchBatchResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["research_batch"] = "research_batch"
    version: Literal["1"] = "1"
    seed: int
    requested_case_count: int
    completed_case_count: int
    removed_cards_per_case: int
    definition_ids: list[ResearchDefinitionId]
    source: ResearchSourceResponse
    definitions: list[ResearchDefinitionResponse]
    cases: list[ResearchBatchCaseResponse]
    metrics: list[ResearchMetricResponse]
    exact_available_count: int
    exact_unavailable_count: int
