from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .errors import APIErrorDetail


class ValidationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool = True
    errors: list[APIErrorDetail] = Field(default_factory=list)
    warnings: list[APIErrorDetail] = Field(default_factory=list)


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


class ExactAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact"] = "exact"
    state_summary: AnalysisStateSummary
    outcomes: OutcomeProbabilities
    metadata: AnalysisMetadata


class APIErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error: APIErrorDetail
