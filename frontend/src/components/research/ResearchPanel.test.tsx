import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIGURATION, DEFAULT_RULES, createInitialState } from "../../state/initialState";
import ResearchPanel from "./ResearchPanel";

const source = {
  source_id: "approved-counting-systems-2026-09-12",
  title: "Approved counting systems research package",
  local_path: "research/sources/approved-counting-systems.md",
  sha256: "343d59fc6f988e3a711ff16d184531af619774564511eaad63802cd034b91447",
  locator: "comparison table",
};

const definition = {
  identifier: "wong_halves" as const,
  label: "Wong Halves",
  balanced: true,
  level: 3,
  ace_classification: "ace_reckoned" as const,
  source,
  published_metrics: {
    kind: "published_static_metadata" as const,
    pe: 0.56,
    bc: 0.99,
    ic: 0.72,
  },
};

const score = {
  definition,
  raw_score: 0.5,
  raw_score_fraction: "1/2",
  observed_known_cards: 3,
  unresolved_unknown_cards: 1,
  complete: false,
  ace_information: {
    feature_id: "ace_information" as const,
    label: "Ace Information" as const,
    known_aces_observed: 1,
    exact_aces_remaining: null,
    complete: false,
  },
};

function session() {
  return createInitialState({
    ...DEFAULT_CONFIGURATION,
    rules: { ...DEFAULT_RULES, decks: 1 },
  });
}

function response(payload: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => payload } as Response;
}

function comparisonResponse() {
  return {
    method: "research_comparison",
    scores: [score],
    exact_reference: {
      method: "exact",
      status: "complete",
      outcomes: { win: 0.4, push: 0.1, loss: 0.5 },
      error: null,
    },
  };
}

function batchResponse() {
  return {
    method: "research_batch",
    version: "1",
    seed: 12345,
    requested_case_count: 25,
    completed_case_count: 25,
    removed_cards_per_case: 6,
    definition_ids: ["wong_halves"],
    source,
    definitions: [definition],
    exact_available_count: 24,
    exact_unavailable_count: 1,
    metrics: [
      {
        metric_id: "pearson_score_vs_win_probability",
        definition_id: "wong_halves",
        source_id: source.source_id,
        target: "exact_win_probability",
        status: "available",
        value: 0.75,
        total_cases: 25,
        eligible_cases: 24,
        excluded_incomplete_score: 0,
        excluded_exact_unavailable: 1,
        excluded_nonfinite: 0,
        formula: "pearson_centered_sums_v1",
      },
      {
        metric_id: "pearson_score_vs_outcome_balance",
        definition_id: "wong_halves",
        source_id: source.source_id,
        target: "exact_outcome_balance",
        status: "undefined_constant_input",
        value: null,
        total_cases: 25,
        eligible_cases: 24,
        excluded_incomplete_score: 0,
        excluded_exact_unavailable: 1,
        excluded_nonfinite: 0,
        formula: "pearson_centered_sums_v1",
      },
    ],
    cases: [
      {
        case_id: "case-0001",
        case_index: 1,
        sampled_removed_ranks: ["2", "A"],
        removed_card_count: 2,
        exact_reference_status: "unavailable",
        exact_reference: {
          method: "exact",
          status: "unavailable",
          outcomes: null,
          error: { code: "exact_computation_limit", message: "Configured limit reached." },
        },
        exact_outcome_balance: null,
        research_results: [{ ...score, complete: true, unresolved_unknown_cards: 0 }],
      },
    ],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("ResearchPanel", () => {
  it("renders only the three approved primary-system selectors and bounded controls", () => {
    render(<ResearchPanel state={session()} />);

    const systems = screen.getByRole("group", { name: "Primary research systems" });
    expect(within(systems).getByLabelText("Wong Halves")).toBeChecked();
    expect(within(systems).getByLabelText("Zen Count")).toBeChecked();
    expect(within(systems).getByLabelText("Omega II")).toBeChecked();
    expect(within(systems).queryByLabelText(/Ace Information/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Research case count")).toHaveAttribute("min", "2");
    expect(screen.getByLabelText("Research case count")).toHaveAttribute("max", "50");
    expect(screen.getByLabelText("Removed cards per research case")).toHaveAttribute("min", "0");
    expect(screen.getByLabelText("Removed cards per research case")).toHaveAttribute("max", "20");
    expect(screen.getByLabelText("Research seed")).toBeRequired();
  });

  it("renders current raw score, incomplete state, Ace auxiliary, provenance, and separate exact reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(comparisonResponse())));
    render(<ResearchPanel state={session()} />);
    fireEvent.click(screen.getByLabelText(/Include Ace Information/));
    fireEvent.click(screen.getByRole("button", { name: "Compare current state" }));

    expect(await screen.findByText("Approved counting systems research package")).toBeVisible();
    expect(screen.getByRole("table", { name: "Raw research scores" })).toHaveTextContent("1/2");
    expect(screen.getByRole("table", { name: "Raw research scores" })).toHaveTextContent("Incomplete · 1 unresolved");
    expect(screen.getByRole("table", { name: "Raw research scores" })).toHaveTextContent("1 observed; unknown remaining");
    expect(screen.getByRole("heading", { name: "Exact finite-shoe probability reference" })).toBeVisible();
    expect(screen.getByText("40.00%")).toBeVisible();
    expect(screen.getByText("Published source metadata")).toBeVisible();
  });

  it("sends one bounded batch request and renders computed metrics and unavailable cases safely", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(batchResponse()));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchPanel state={session()} />);
    fireEvent.click(screen.getByRole("button", { name: "Run offline experiment" }));

    expect(await screen.findByText(/25\/25 cases/)).toBeVisible();
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/research/batch");
    expect(JSON.parse(request.body as string)).toMatchObject({
      definition_ids: ["wong_halves", "zen_count", "omega_ii"],
      case_count: 25,
      removed_cards_per_case: 6,
      seed: 12345,
    });
    expect(screen.getByRole("table", { name: "Computed experiment metrics" })).toHaveTextContent("Raw score vs exact win probability");
    expect(screen.getByRole("table", { name: "Computed experiment metrics" })).toHaveTextContent("undefined constant input");
    expect(screen.getByRole("table", { name: "Bounded experiment cases" })).toHaveTextContent("Unavailable: Configured limit reached.");
    expect(screen.getByText(/Pearson correlation: \+1 perfect positive/)).toBeVisible();
  });

  it("validates required seed before making a request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchPanel state={session()} />);
    fireEvent.change(screen.getByLabelText("Research seed"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Run offline experiment" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Seed is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves the full approved integer seed as a JSON number literal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(batchResponse()));
    vi.stubGlobal("fetch", fetchMock);
    render(<ResearchPanel state={session()} />);
    fireEvent.change(screen.getByLabelText("Research seed"), { target: { value: "9223372036854775807" } });
    fireEvent.click(screen.getByRole("button", { name: "Run offline experiment" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.body).toContain('"seed":9223372036854775807');
    expect(await screen.findByText(/seed 9223372036854775807/)).toBeVisible();
  });

  it("shows structured API errors without export or gambling controls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "invalid_state", message: "State is not eligible." } }, false, 422)));
    render(<ResearchPanel state={session()} />);
    fireEvent.click(screen.getByRole("button", { name: "Run offline experiment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("State is not eligible.");
    expect(screen.queryByRole("button", { name: /export|download|replay/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/wager|bankroll|bet size|player action/i)).not.toBeInTheDocument();
  });
});
