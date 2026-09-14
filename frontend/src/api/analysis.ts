import type { SessionState } from "../state/gameReducer";
import type { TableTarget } from "../domain/events";
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

export type ErrorDetail = Readonly<{ code: string; message: string; field: string | null }>;
export type ProbabilityRange = Readonly<{ minimum: number; maximum: number }>;
export type OutcomeRanges = Readonly<{
  win: ProbabilityRange;
  push: ProbabilityRange;
  loss: ProbabilityRange;
}>;
export type ExcludedDeckCount = Readonly<{
  deck_count: number;
  code: string;
  message: string;
}>;
export type OutcomeModelSummary = Readonly<{
  outcomes: OutcomeProbabilities;
  ranges: OutcomeRanges;
}>;
type DeckSummaryMetadata = Readonly<{
  method: "uniform_valid_deck_count_mean";
  assumption: "equal_weight_valid_deck_counts";
  dealer_soft_17: "hit" | "stand";
  status: "available" | "unavailable";
  candidate_deck_counts: readonly number[];
  included_deck_counts: readonly number[];
  excluded_deck_counts: readonly ExcludedDeckCount[];
  error: ErrorDetail | null;
}>;
export type UniformDeckCountSummary = DeckSummaryMetadata & Readonly<{
  outcomes: OutcomeProbabilities | null;
  ranges: OutcomeRanges | null;
}>;
export type ExactActionForecastResult = Readonly<{
  contract: "stand_now" | "hit_once_then_stand" | "double_one_card_then_stand";
  status: "available" | "unavailable";
  method: "exact";
  outcomes: OutcomeProbabilities | null;
  metadata: ExactAnalysisResponse["metadata"] | null;
  error: ErrorDetail | null;
}>;
export type ExactTerminalActionForecastResult = Readonly<{
  contract: "surrender_now";
  status: "available" | "unavailable";
  method: "exact";
  terminal: "surrendered" | null;
  error: ErrorDetail | null;
}>;
export type ExactSplitActionForecastResult = Readonly<{
  contract: "split_one_card_each_then_stand";
  status: "available" | "unavailable";
  method: "exact";
  child_hand_1: OutcomeProbabilities | null;
  child_hand_2: OutcomeProbabilities | null;
  metadata: ExactAnalysisResponse["metadata"] | null;
  error: ErrorDetail | null;
}>;
export type ExactActionForecastResponse = Readonly<{
  method: "exact_action_forecast";
  target: Readonly<{ seat: number; hand_id: string }> | null;
  action_forecasts: Readonly<{
    stand_now: ExactActionForecastResult;
    hit_once_then_stand: ExactActionForecastResult;
    double_one_card_then_stand: ExactActionForecastResult;
    surrender_now: ExactTerminalActionForecastResult;
    split_one_card_each_then_stand: ExactSplitActionForecastResult;
  }>;
}>;
export type UniformActionSummary = Readonly<{
  contract: "stand_now" | "hit_once_then_stand" | "double_one_card_then_stand" |
    "surrender_now" | "split_one_card_each_then_stand";
  status: "available" | "unavailable";
  outcomes: OutcomeProbabilities | null;
  ranges: OutcomeRanges | null;
  terminal: "surrendered" | null;
  child_hand_1: OutcomeModelSummary | null;
  child_hand_2: OutcomeModelSummary | null;
  error: ErrorDetail | null;
}>;
export type UniformActionDeckCountSummary = DeckSummaryMetadata & Readonly<{
  action_forecasts: Readonly<{
    stand_now: UniformActionSummary;
    hit_once_then_stand: UniformActionSummary;
    double_one_card_then_stand: UniformActionSummary;
    surrender_now: UniformActionSummary;
    split_one_card_each_then_stand: UniformActionSummary;
  }> | null;
}>;
export type ExactActionForecastScenarioAnalysisResponse = Readonly<{
  method: "exact_action_forecast";
  model_uncertainty: readonly ("deck_count" | "dealer_soft_17")[];
  aggregation: "none";
  resource_limit_scope?: "per_scenario";
  exact_state_limit_per_scenario?: number;
  scenarios: readonly Readonly<{
    assumptions: Readonly<{ decks: number; dealer_soft_17: "hit" | "stand" }>;
    status: "complete" | "invalid" | "unavailable";
    result: ExactActionForecastResponse | null;
    error: ErrorDetail | null;
  }>[];
  deck_count_summaries: readonly UniformActionDeckCountSummary[];
}>;
export type ActionForecastResponse =
  | ExactActionForecastResponse
  | ExactActionForecastScenarioAnalysisResponse;
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
  resource_limit_scope?: "per_scenario";
  exact_state_limit_per_scenario?: number;
  scenarios: readonly Readonly<{
    assumptions: Readonly<{ decks: number; dealer_soft_17: "hit" | "stand" }>;
    status: "complete" | "invalid" | "unavailable";
    result: SingleAnalysisResponse | null;
    error: ErrorDetail | null;
  }>[];
  deck_count_summaries?: readonly UniformDeckCountSummary[];
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

function isActionForecastResponse(value: unknown): value is ActionForecastResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { method?: unknown; action_forecasts?: unknown; scenarios?: unknown };
  return candidate.method === "exact_action_forecast" &&
    ((typeof candidate.action_forecasts === "object" && candidate.action_forecasts !== null) ||
      Array.isArray(candidate.scenarios));
}

export async function analyze(state: SessionState, options: AnalysisOptions, signal?: AbortSignal, analysisTarget: TableTarget | null = null): Promise<AnalysisResponse> {
  const response = await fetch(`${getApiBaseUrl()}/analyze`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ state: toTableStatePayload(state, analysisTarget), options }),
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

export function analyzeExact(state: SessionState, signal?: AbortSignal, analysisTarget: TableTarget | null = null): Promise<AnalysisResponse> {
  return analyze(state, { method: "exact" }, signal, analysisTarget);
}

export async function analyzeActionForecast(
  state: SessionState,
  target: Extract<TableTarget, { kind: "player-hand" }> | null,
  signal?: AbortSignal,
): Promise<ActionForecastResponse> {
  const response = await fetch(`${getApiBaseUrl()}/analyze`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      state: toTableStatePayload(state, target),
      options: {
        method: "exact_action_forecast",
        target: target === null ? null : { seat: target.seat, hand_id: target.handId },
      },
    }),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    if (isErrorResponse(payload)) throw new AnalysisApiError(payload.error.code, payload.error.message);
    throw new AnalysisApiError("analysis_request_failed", `Analysis failed with HTTP ${response.status}.`);
  }
  if (!isActionForecastResponse(payload)) {
    throw new AnalysisApiError(
      "invalid_analysis_response",
      "Action forecast response did not match the expected contract.",
    );
  }
  return payload;
}
