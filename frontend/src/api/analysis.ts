import type { SessionState } from "../state/gameReducer";
import { getApiBaseUrl } from "./client";
import { toTableStatePayload } from "./tableState";

export type AnalysisMethod = "exact" | "monte_carlo" | "compare";
export type ConfidenceLevel = 0.9 | 0.95 | 0.99;
export type OutcomeProbabilities = Readonly<{ win: number; push: number; loss: number }>;
type StateSummary = Readonly<{ cards_remaining: number; known_cards: number; hidden_cards: number }>;

export type ExactAnalysisResponse = Readonly<{
  method: "exact";
  state_summary: StateSummary;
  outcomes: OutcomeProbabilities;
  metadata: Readonly<{
    states_evaluated: number;
    cache_hits: number;
    cache_misses: number;
    runtime_ms: number;
    hidden_states_evaluated: number;
    hidden_weight_mass: number;
  }>;
}>;

export type EstimatedOutcome = Readonly<{ estimate: number; ci_low: number; ci_high: number }>;
export type MonteCarloAnalysisResponse = Readonly<{
  method: "monte_carlo";
  state_summary: StateSummary;
  simulations: number;
  seed: number | null;
  confidence_level: ConfidenceLevel;
  counts: Readonly<{ win: number; push: number; loss: number }>;
  outcomes: Readonly<{ win: EstimatedOutcome; push: EstimatedOutcome; loss: EstimatedOutcome }>;
  runtime_ms: number;
}>;

export type ComparisonOutcome = Readonly<{
  exact_probability: number;
  monte_carlo_estimate: number;
  ci_low: number;
  ci_high: number;
  signed_error: number;
  absolute_error: number;
  exact_in_confidence_interval: boolean;
}>;

type ErrorDetail = Readonly<{ code: string; message: string; field: string | null }>;
export type CompareAnalysisResponse = Readonly<{
  method: "compare";
  status: "complete" | "exact_unavailable";
  state_summary: StateSummary;
  exact: ExactAnalysisResponse | null;
  monte_carlo: MonteCarloAnalysisResponse;
  comparison: Readonly<{ win: ComparisonOutcome; push: ComparisonOutcome; loss: ComparisonOutcome }> | null;
  exact_error: ErrorDetail | null;
}>;

export type SingleAnalysisResponse = ExactAnalysisResponse | MonteCarloAnalysisResponse | CompareAnalysisResponse;
export type ScenarioAnalysisResponse = Readonly<{
  method: AnalysisMethod;
  model_uncertainty: readonly ("deck_count" | "dealer_soft_17")[];
  aggregation: "none";
  scenarios: readonly Readonly<{
    assumptions: Readonly<{ decks: number; dealer_soft_17: "hit" | "stand" }>;
    status: "complete" | "invalid";
    result: SingleAnalysisResponse | null;
    error: ErrorDetail | null;
  }>[];
}>;
export type AnalysisResponse = SingleAnalysisResponse | ScenarioAnalysisResponse;
export type AnalysisOptions =
  | Readonly<{ method: "exact" }>
  | Readonly<{ method: "monte_carlo" | "compare"; simulations: number; confidence_level: ConfidenceLevel; seed: number | null }>;
type ErrorResponse = Readonly<{ error: ErrorDetail }>;

export class AnalysisApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AnalysisApiError";
    this.code = code;
  }
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error?: unknown }).error;
  return typeof error === "object" && error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string";
}

function isAnalysisResponse(value: unknown): value is AnalysisResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { method?: unknown; scenarios?: unknown };
  return ["exact", "monte_carlo", "compare"].includes(candidate.method as string) &&
    (Array.isArray(candidate.scenarios) || "state_summary" in candidate);
}

export async function analyze(state: SessionState, options: AnalysisOptions, signal?: AbortSignal): Promise<AnalysisResponse> {
  const response = await fetch(`${getApiBaseUrl()}/analyze`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ state: toTableStatePayload(state), options }),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    if (isErrorResponse(payload)) throw new AnalysisApiError(payload.error.code, payload.error.message);
    throw new AnalysisApiError("analysis_request_failed", `Analysis failed with HTTP ${response.status}.`);
  }
  if (!isAnalysisResponse(payload)) throw new AnalysisApiError("invalid_analysis_response", "Analysis response did not match the expected contract.");
  return payload;
}

export function analyzeExact(state: SessionState, signal?: AbortSignal): Promise<AnalysisResponse> {
  return analyze(state, { method: "exact" }, signal);
}
