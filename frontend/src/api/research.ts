import type { SessionState } from "../state/gameReducer";
import type { TableTarget } from "../domain/events";
import type { UniformDeckCountSummary } from "./analysis";
import { getApiBaseUrl } from "./client";
import { toTableStatePayload } from "./tableState";

export const RESEARCH_DEFINITIONS = [
  { id: "wong_halves", label: "Wong Halves" },
  { id: "zen_count", label: "Zen Count" },
  { id: "omega_ii", label: "Omega II" },
] as const;

export type ResearchDefinitionId = (typeof RESEARCH_DEFINITIONS)[number]["id"];
type ExactOutcomes = Readonly<{ win: number; push: number; loss: number }>;
type ApiErrorDetail = Readonly<{ code: string; message: string }>;

export type ResearchDefinition = Readonly<{
  identifier: ResearchDefinitionId;
  label: string;
  balanced: boolean;
  level: number;
  ace_classification: "ace_reckoned" | "ace_neutral";
  source: Readonly<{
    source_id: string;
    title: string;
    local_path: string;
    sha256: string;
    locator: string;
  }>;
  published_metrics: Readonly<{
    kind: "published_static_metadata";
    pe: number;
    bc: number;
    ic: number;
  }>;
}>;

export type ResearchScore = Readonly<{
  definition: ResearchDefinition;
  raw_score: number;
  raw_score_fraction: string;
  observed_known_cards: number;
  unresolved_unknown_cards: number;
  complete: boolean;
  ace_information: Readonly<{
    feature_id: "ace_information";
    label: "Ace Information";
    known_aces_observed: number;
    exact_aces_remaining: number | null;
    complete: boolean;
  }> | null;
}>;

export type ExactReference = Readonly<{
  method: "exact";
  status: "complete" | "unavailable";
  outcomes: ExactOutcomes | null;
  error: ApiErrorDetail | null;
}>;

export type ScenarioExactReference = Readonly<{
  method: "exact";
  model_uncertainty: readonly ("deck_count" | "dealer_soft_17")[];
  aggregation: "none";
  resource_limit_scope: "per_scenario";
  exact_state_limit_per_scenario: number;
  scenarios: readonly Readonly<{
    assumptions: Readonly<{ decks: number; dealer_soft_17: "hit" | "stand" }>;
    status: "complete" | "invalid" | "unavailable";
    reference: ExactReference;
  }>[];
  deck_count_summaries: readonly UniformDeckCountSummary[];
}>;

export type ResearchComparisonResponse = Readonly<{
  method: "research_comparison";
  scores: readonly ResearchScore[];
  exact_reference: ExactReference | ScenarioExactReference | null;
}>;

export type ResearchMetric = Readonly<{
  metric_id:
    | "pearson_score_vs_win_probability"
    | "pearson_score_vs_outcome_balance";
  definition_id: ResearchDefinitionId;
  source_id: string;
  target: "exact_win_probability" | "exact_outcome_balance";
  status: "available" | "insufficient_data" | "undefined_constant_input";
  value: number | null;
  total_cases: number;
  eligible_cases: number;
  excluded_incomplete_score: number;
  excluded_exact_unavailable: number;
  excluded_nonfinite: number;
  formula: "pearson_centered_sums_v1";
}>;

export type ResearchBatchCase = Readonly<{
  case_id: string;
  case_index: number;
  sampled_removed_ranks: readonly string[];
  removed_card_count: number;
  exact_reference_status: "available" | "unavailable";
  exact_reference: ExactReference;
  exact_outcome_balance: number | null;
  research_results: readonly ResearchScore[];
}>;

export type ResearchBatchResponse = Readonly<{
  method: "research_batch";
  version: "1";
  seed: number;
  requested_case_count: number;
  completed_case_count: number;
  removed_cards_per_case: number;
  definition_ids: readonly ResearchDefinitionId[];
  source: ResearchDefinition["source"];
  definitions: readonly ResearchDefinition[];
  cases: readonly ResearchBatchCase[];
  metrics: readonly ResearchMetric[];
  exact_available_count: number;
  exact_unavailable_count: number;
}>;

export class ResearchApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ResearchApiError";
    this.code = code;
  }
}

async function parseResearchResponse<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const detail = (payload as { error?: ApiErrorDetail }).error;
    throw new ResearchApiError(
      detail?.code ?? "research_request_failed",
      detail?.message ?? `Research request failed with HTTP ${response.status}.`,
    );
  }
  return payload as T;
}

export async function compareResearch(
  state: SessionState,
  definitionIds: readonly ResearchDefinitionId[],
  includeAceInformation: boolean,
  signal?: AbortSignal,
  includeExactReference = true,
  analysisTarget: TableTarget | null = null,
): Promise<ResearchComparisonResponse> {
  const response = await fetch(`${getApiBaseUrl()}/research/compare`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      state: toTableStatePayload(state, analysisTarget),
      options: {
        primary_definition_ids: definitionIds,
        include_ace_information: includeAceInformation,
        include_exact_reference: includeExactReference,
      },
    }),
    signal,
  });
  return parseResearchResponse<ResearchComparisonResponse>(response);
}

type BatchSettings = Readonly<{
  definitionIds: readonly ResearchDefinitionId[];
  caseCount: number;
  removedCardsPerCase: number;
  seed: string;
  includeAceInformation: boolean;
}>;

export async function runResearchBatch(
  state: SessionState,
  settings: BatchSettings,
  signal?: AbortSignal,
): Promise<ResearchBatchResponse> {
  if (!/^\d+$/.test(settings.seed)) {
    throw new ResearchApiError("invalid_seed", "Seed must be a non-negative integer.");
  }
  const seed = BigInt(settings.seed);
  if (seed > 9_223_372_036_854_775_807n) {
    throw new ResearchApiError("invalid_seed", "Seed exceeds the supported maximum.");
  }
  const seedPlaceholder = "__EXACT_INTEGER_SEED__";
  const body = JSON.stringify({
    state: toTableStatePayload(state),
    definition_ids: settings.definitionIds,
    case_count: settings.caseCount,
    removed_cards_per_case: settings.removedCardsPerCase,
    seed: seedPlaceholder,
    include_ace_information: settings.includeAceInformation,
  }).replace(`"${seedPlaceholder}"`, settings.seed);
  const response = await fetch(`${getApiBaseUrl()}/research/batch`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body,
    signal,
  });
  return parseResearchResponse<ResearchBatchResponse>(response);
}
