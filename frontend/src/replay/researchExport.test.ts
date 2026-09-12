import { describe, expect, it } from "vitest";

import type { ResearchBatchResponse } from "../api/research";
import type { ResearchBatchExportRequest } from "./researchExport";
import {
  RESEARCH_EXPORT_FORMAT,
  RESEARCH_EXPORT_VERSION,
  serializeResearchBatchExport,
} from "./researchExport";

const request: ResearchBatchExportRequest = {
  state: {
    rules: {
      decks: 1,
      dealer_soft_17: "stand",
      splitting_enabled: true,
      max_split_hands: 4,
      resplit_aces: false,
      hit_split_aces: false,
      blackjack_after_split: false,
      doubling_enabled: true,
      double_after_split: true,
      surrender: "none",
      dealer_second_card: "hole_card",
      dealer_blackjack_check: "no_peek",
    },
    dealer: { cards: [] },
    players: [{ seat: 1, is_user: true, cards: [] }],
    discarded_cards: [],
  },
  definition_ids: ["wong_halves"],
  case_count: 2,
  removed_cards_per_case: 1,
  seed: "12345",
  include_ace_information: false,
};

const definition = {
  identifier: "wong_halves" as const,
  label: "Wong Halves",
  balanced: true,
  level: 3,
  ace_classification: "ace_reckoned" as const,
  source: {
    source_id: "approved-source",
    title: "Approved package",
    local_path: "research/sources/approved-counting-systems.md",
    sha256: "abc123",
    locator: "comparison table",
  },
  published_metrics: {
    kind: "published_static_metadata" as const,
    pe: 0.56,
    bc: 0.99,
    ic: 0.72,
  },
};

const result = {
  method: "research_batch",
  version: "1",
  seed: 12345,
  requested_case_count: 2,
  completed_case_count: 2,
  removed_cards_per_case: 1,
  definition_ids: ["wong_halves"],
  source: definition.source,
  definitions: [definition],
  cases: [{
    case_id: "case-0001",
    case_index: 1,
    sampled_removed_ranks: ["A"],
    removed_card_count: 1,
    exact_reference_status: "unavailable",
    exact_reference: {
      method: "exact",
      status: "unavailable",
      outcomes: null,
      error: { code: "exact_computation_limit", message: "Limit reached." },
    },
    exact_outcome_balance: null,
    research_results: [{
      definition,
      raw_score: 0.5,
      raw_score_fraction: "1/2",
      observed_known_cards: 4,
      unresolved_unknown_cards: 0,
      complete: true,
      ace_information: null,
    }],
  }],
  metrics: [{
    metric_id: "pearson_score_vs_win_probability",
    definition_id: "wong_halves",
    source_id: "approved-source",
    target: "exact_win_probability",
    status: "available",
    value: 0.75,
    total_cases: 2,
    eligible_cases: 1,
    excluded_incomplete_score: 0,
    excluded_exact_unavailable: 1,
    excluded_nonfinite: 0,
    formula: "pearson_centered_sums_v1",
  }],
  exact_available_count: 1,
  exact_unavailable_count: 1,
} as ResearchBatchResponse;

describe("research batch JSON export", () => {
  it("uses the versioned research format and preserves request and result", () => {
    const parsed = JSON.parse(serializeResearchBatchExport(request, result));

    expect(parsed.format).toBe(RESEARCH_EXPORT_FORMAT);
    expect(parsed.version).toBe(RESEARCH_EXPORT_VERSION);
    expect(parsed.request).toEqual({ ...request, seed: 12345 });
    expect(parsed.result).toEqual(result);
  });

  it("is deterministic and preserves cases, exact statuses, and metric exclusions", () => {
    const first = serializeResearchBatchExport(request, result);
    const parsed = JSON.parse(first);

    expect(serializeResearchBatchExport(request, result)).toBe(first);
    expect(parsed.result.cases).toEqual(result.cases);
    expect(parsed.result.metrics).toEqual(result.metrics);
    expect(parsed.result.metrics[0].excluded_exact_unavailable).toBe(1);
    expect(parsed.result.cases[0].research_results[0].raw_score_fraction).toBe("1/2");
    expect(parsed.result.metrics[0]).toMatchObject({ status: "available", value: 0.75 });
  });

  it("preserves a maximum 64-bit seed as exact JSON numeric literals", () => {
    const seed = "9223372036854775807";
    const serialized = serializeResearchBatchExport(
      { ...request, seed },
      { ...result, seed: Number(seed) },
    );

    expect(serialized.match(/9223372036854775807/g)).toHaveLength(2);
    expect(serialized).not.toContain('"9223372036854775807"');
  });

  it("rejects a mismatched safe request/response seed", () => {
    expect(() => serializeResearchBatchExport(request, { ...result, seed: 7 }))
      .toThrow("Research request and response seeds do not match");
  });

  it("contains provenance but does not embed source-document content", () => {
    const serialized = serializeResearchBatchExport(request, result);

    expect(serialized).toContain("approved-source");
    expect(serialized).toContain("abc123");
    expect(serialized).not.toContain("Free Learning Path for Wong Halves");
  });
});
