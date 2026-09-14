from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr

from app.domain import DealerCheckResult

from .table import SeatNumber, TableStateSchema


class PlayerHandTargetSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seat: SeatNumber
    hand_id: Annotated[StrictStr, Field(min_length=1)]


class PlayerActionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: TableStateSchema
    target: PlayerHandTargetSchema


class ExactAnalysisOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact"] = "exact"
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED


class ExactAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: TableStateSchema
    options: ExactAnalysisOptions = Field(default_factory=ExactAnalysisOptions)


class ExactActionForecastOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact_action_forecast"] = "exact_action_forecast"
    target: PlayerHandTargetSchema | None = None
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED


class MonteCarloAnalysisOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["monte_carlo"]
    simulations: Annotated[StrictInt, Field(ge=1, le=1_000_000)] = 10_000
    seed: StrictInt | None = None
    confidence_level: Literal[0.9, 0.95, 0.99] = 0.95
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED


class CompareAnalysisOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["compare"]
    simulations: Annotated[StrictInt, Field(ge=1, le=1_000_000)] = 10_000
    seed: StrictInt | None = None
    confidence_level: Literal[0.9, 0.95, 0.99] = 0.95
    dealer_check_result: DealerCheckResult = DealerCheckResult.NOT_REQUIRED


AnalysisOptions = Annotated[
    ExactAnalysisOptions
    | ExactActionForecastOptions
    | MonteCarloAnalysisOptions
    | CompareAnalysisOptions,
    Field(discriminator="method"),
]


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: TableStateSchema
    options: AnalysisOptions
