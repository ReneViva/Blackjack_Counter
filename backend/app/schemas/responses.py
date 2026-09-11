from pydantic import BaseModel, ConfigDict, Field


class ValidationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool = True
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
