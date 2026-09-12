from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator

from app.domain import DealerCheckResult

from .errors import APIErrorDetail
from .responses import OutcomeProbabilities, ScenarioAssumptionsResponse
from .table import TableStateSchema


ResearchDefinitionId = Literal["wong_halves", "zen_count", "omega_ii"]


class ResearchComparisonOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    primary_definition_ids: list[ResearchDefinitionId] = Field(
        default_factory=lambda: ["wong_halves", "zen_count", "omega_ii"],
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


class ResearchDefinitionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identifier: ResearchDefinitionId
    label: str
    balanced: bool
    level: int
    ace_classification: Literal["ace_reckoned", "ace_neutral"]
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
    reference: ResearchExactReferenceResponse


class ResearchExactScenarioAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact"] = "exact"
    model_uncertainty: list[Literal["deck_count", "dealer_soft_17"]]
    aggregation: Literal["none"] = "none"
    scenarios: list[ResearchExactScenarioResponse]


class ResearchComparisonResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["research_comparison"] = "research_comparison"
    scores: list[ResearchScoreResponse]
    exact_reference: (
        ResearchExactReferenceResponse
        | ResearchExactScenarioAnalysisResponse
        | None
    ) = None
