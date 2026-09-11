from pydantic import BaseModel, ConfigDict


class APIErrorDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    field: str | None = None
