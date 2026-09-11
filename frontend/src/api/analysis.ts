import type { SessionState } from "../state/gameReducer";
import { getApiBaseUrl } from "./client";
import { toTableStatePayload } from "./tableState";

export type ExactAnalysisResponse = Readonly<{
  method: "exact";
  state_summary: Readonly<{
    cards_remaining: number;
    known_cards: number;
    hidden_cards: number;
  }>;
  outcomes: Readonly<{
    win: number;
    push: number;
    loss: number;
  }>;
  metadata: Readonly<{
    states_evaluated: number;
    cache_hits: number;
    cache_misses: number;
    runtime_ms: number;
  }>;
}>;

type ErrorResponse = Readonly<{
  error: Readonly<{
    code: string;
    message: string;
    field: string | null;
  }>;
}>;

export class AnalysisApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AnalysisApiError";
    this.code = code;
  }
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error = (value as { error?: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function isExactAnalysisResponse(value: unknown): value is ExactAnalysisResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ExactAnalysisResponse>;
  return (
    candidate.method === "exact" &&
    typeof candidate.outcomes?.win === "number" &&
    typeof candidate.outcomes.push === "number" &&
    typeof candidate.outcomes.loss === "number" &&
    typeof candidate.metadata?.states_evaluated === "number"
  );
}

export async function analyzeExact(
  state: SessionState,
  signal?: AbortSignal,
): Promise<ExactAnalysisResponse> {
  const response = await fetch(`${getApiBaseUrl()}/analyze`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      state: toTableStatePayload(state),
      options: { method: "exact" },
    }),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    if (isErrorResponse(payload)) {
      throw new AnalysisApiError(payload.error.code, payload.error.message);
    }
    throw new AnalysisApiError(
      "analysis_request_failed",
      `Exact analysis failed with HTTP ${response.status}.`,
    );
  }
  if (!isExactAnalysisResponse(payload)) {
    throw new AnalysisApiError(
      "invalid_analysis_response",
      "Exact analysis response did not match the expected contract.",
    );
  }
  return payload;
}
