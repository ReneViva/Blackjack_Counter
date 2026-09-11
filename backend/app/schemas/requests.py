from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .table import TableStateSchema


class ExactAnalysisOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: Literal["exact"] = "exact"


class ExactAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: TableStateSchema
    options: ExactAnalysisOptions = Field(default_factory=ExactAnalysisOptions)
