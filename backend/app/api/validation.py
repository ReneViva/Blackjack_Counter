from fastapi import APIRouter

from app.engine import ValidationIssue, build_table_state, validate_table_state
from app.schemas import APIErrorDetail, TableStateSchema, ValidationResponse


router = APIRouter(prefix="/api", tags=["state"])


def _to_api_issue(issue: ValidationIssue) -> APIErrorDetail:
    return APIErrorDetail(
        code=issue.code,
        message=issue.message,
        field=issue.field,
    )


@router.post("/validate", response_model=ValidationResponse)
def validate_state(payload: TableStateSchema) -> ValidationResponse:
    result = validate_table_state(build_table_state(payload))
    return ValidationResponse(
        valid=result.valid,
        errors=[_to_api_issue(issue) for issue in result.errors],
        warnings=[_to_api_issue(issue) for issue in result.warnings],
    )
