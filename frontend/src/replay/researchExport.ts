import type { ResearchBatchResponse, ResearchDefinitionId } from "../api/research";
import type { TableStatePayload } from "../api/tableState";

export const RESEARCH_EXPORT_FORMAT = "blackjack-research-batch" as const;
export const RESEARCH_EXPORT_VERSION = 1 as const;

export type ResearchBatchExportRequest = Readonly<{
  state: TableStatePayload;
  definition_ids: readonly ResearchDefinitionId[];
  case_count: number;
  removed_cards_per_case: number;
  seed: string;
  include_ace_information: boolean;
}>;

const REQUEST_SEED = "__BLACKJACK_REQUEST_SEED_LITERAL__";
const RESULT_SEED = "__BLACKJACK_RESULT_SEED_LITERAL__";
const MAX_SEED = 9_223_372_036_854_775_807n;

function requireSeed(seed: string): void {
  if (!/^\d+$/.test(seed) || BigInt(seed) > MAX_SEED) {
    throw new TypeError("Research export seed is outside the supported range.");
  }
}

export function serializeResearchBatchExport(
  request: ResearchBatchExportRequest,
  result: ResearchBatchResponse,
): string {
  requireSeed(request.seed);
  if (BigInt(request.seed) <= BigInt(Number.MAX_SAFE_INTEGER) &&
      result.seed !== Number(request.seed)) {
    throw new TypeError("Research request and response seeds do not match.");
  }
  const envelope = {
    format: RESEARCH_EXPORT_FORMAT,
    version: RESEARCH_EXPORT_VERSION,
    request: { ...request, seed: REQUEST_SEED },
    result: { ...result, seed: RESULT_SEED },
  };
  return `${JSON.stringify(envelope, null, 2)
    .replace(`"${REQUEST_SEED}"`, request.seed)
    .replace(`"${RESULT_SEED}"`, request.seed)}\n`;
}
