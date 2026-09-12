import type { SessionState } from "../state/gameReducer";
import { getApiBaseUrl } from "./client";
import { toTableStatePayload } from "./tableState";

export type ValidationIssue = Readonly<{
  code: string;
  message: string;
  field: string | null;
}>;

export type ValidationResponse = Readonly<{
  valid: boolean;
  errors: readonly ValidationIssue[];
  warnings: readonly ValidationIssue[];
}>;

export class ValidationApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ValidationApiError";
    this.code = code;
  }
}

function isIssue(value: unknown): value is ValidationIssue {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Record<string, unknown>;
  return typeof issue.code === "string" &&
    typeof issue.message === "string" &&
    (issue.field === null || typeof issue.field === "string");
}

function isValidationResponse(value: unknown): value is ValidationResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return typeof response.valid === "boolean" &&
    Array.isArray(response.errors) && response.errors.every(isIssue) &&
    Array.isArray(response.warnings) && response.warnings.every(isIssue);
}

export async function validateSessionState(
  state: SessionState,
  signal?: AbortSignal,
): Promise<ValidationResponse> {
  const response = await fetch(`${getApiBaseUrl()}/validate`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(toTableStatePayload(state)),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isValidationResponse(payload)) {
    throw new ValidationApiError(
      "validation_request_failed",
      response.ok
        ? "Validation response did not match the expected contract."
        : `Replay validation failed with HTTP ${response.status}.`,
    );
  }
  return payload;
}
