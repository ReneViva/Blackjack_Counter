from fastapi import APIRouter

from app.engine import build_table_state
from app.schemas import TableStateSchema, ValidationResponse


router = APIRouter(prefix="/api", tags=["state"])


@router.post("/validate", response_model=ValidationResponse)
def reconstruct_state(payload: TableStateSchema) -> ValidationResponse:
    build_table_state(payload)
    return ValidationResponse()
