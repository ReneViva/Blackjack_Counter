from pydantic import BaseModel, ConfigDict, Field

from .errors import APIErrorDetail


class ValidationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool = True
    errors: list[APIErrorDetail] = Field(default_factory=list)
    warnings: list[APIErrorDetail] = Field(default_factory=list)
