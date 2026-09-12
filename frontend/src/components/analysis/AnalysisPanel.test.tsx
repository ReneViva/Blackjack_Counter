import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CONFIGURATION } from "../../state/initialState";
import type { SessionState } from "../../state/gameReducer";
import AnalysisPanel from "./AnalysisPanel";

const state: SessionState = {
  configuration: {
    ...DEFAULT_CONFIGURATION,
    rules: { ...DEFAULT_CONFIGURATION.rules, decks: 1 },
  },
  events: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analysis panel", () => {
  it("displays backend-computed exact outcomes and diagnostics", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        method: "exact",
        state_summary: { cards_remaining: 2, known_cards: 50, hidden_cards: 0 },
        outcomes: { win: 0.5, push: 0.125, loss: 0.375 },
        metadata: {
          states_evaluated: 9,
          cache_hits: 2,
          cache_misses: 9,
          runtime_ms: 1.5,
        },
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<AnalysisPanel state={state} />);
    expect(screen.queryByLabelText("Simulation trials")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));

    expect(await screen.findByText("50.00%")).toBeVisible();
    expect(screen.getByText("12.50%")).toBeVisible();
    expect(screen.getByText("37.50%")).toBeVisible();
    expect(screen.getByText(/9 states evaluated/)).toBeVisible();
    expect(screen.getByText(/2 cache hits/)).toBeVisible();
    expect(screen.getByText(/No sampling confidence interval/)).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).options).toEqual({ method: "exact" });
  });

  it("displays structured backend errors without calculating locally", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: "exact_analysis_requires_known_deck",
          message: "Exact analysis requires a known deck count.",
          field: null,
        },
      }),
    } as Response));

    render(<AnalysisPanel state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Exact analysis requires a known deck count.",
    );
  });

  it("shows Monte Carlo estimates, sampling intervals, and typed controls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        method: "monte_carlo",
        state_summary: { cards_remaining: 48, known_cards: 4, hidden_cards: 0 },
        simulations: 1000,
        seed: 12345,
        confidence_level: 0.95,
        counts: { win: 500, push: 100, loss: 400 },
        outcomes: {
          win: { estimate: 0.5, ci_low: 0.469, ci_high: 0.531 },
          push: { estimate: 0.1, ci_low: 0.083, ci_high: 0.12 },
          loss: { estimate: 0.4, ci_low: 0.37, ci_high: 0.431 },
        },
        runtime_ms: 20,
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<AnalysisPanel state={state} />);

    fireEvent.change(screen.getByLabelText("Analysis method"), { target: { value: "monte_carlo" } });
    fireEvent.change(screen.getByLabelText("Simulation trials"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));

    expect(await screen.findByText("Win estimate")).toBeVisible();
    expect(screen.getAllByText(/95% sampling CI/)).toHaveLength(3);
    expect(screen.getByText(/1,000 completed trials/)).toBeVisible();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.options).toEqual({ method: "monte_carlo", simulations: 1000, confidence_level: 0.95, seed: 12345 });
  });

  it("visually distinguishes exact and Monte Carlo comparison values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        method: "compare",
        status: "complete",
        state_summary: { cards_remaining: 2, known_cards: 50, hidden_cards: 0 },
        exact: { method: "exact", state_summary: { cards_remaining: 2, known_cards: 50, hidden_cards: 0 }, outcomes: { win: 0.5, push: 0, loss: 0.5 }, metadata: { states_evaluated: 3, cache_hits: 0, cache_misses: 33, runtime_ms: 1, hidden_states_evaluated: 0, hidden_weight_mass: 1 } },
        monte_carlo: { method: "monte_carlo", state_summary: { cards_remaining: 2, known_cards: 50, hidden_cards: 0 }, simulations: 10000, seed: 12345, confidence_level: 0.95, counts: { win: 5020, push: 0, loss: 4980 }, outcomes: { win: { estimate: 0.502, ci_low: 0.492, ci_high: 0.512 }, push: { estimate: 0, ci_low: 0, ci_high: 0.001 }, loss: { estimate: 0.498, ci_low: 0.488, ci_high: 0.508 } }, runtime_ms: 10 },
        comparison: {
          win: { exact_probability: 0.5, monte_carlo_estimate: 0.502, ci_low: 0.492, ci_high: 0.512, signed_error: 0.002, absolute_error: 0.002, exact_in_confidence_interval: true },
          push: { exact_probability: 0, monte_carlo_estimate: 0, ci_low: 0, ci_high: 0.001, signed_error: 0, absolute_error: 0, exact_in_confidence_interval: true },
          loss: { exact_probability: 0.5, monte_carlo_estimate: 0.498, ci_low: 0.488, ci_high: 0.508, signed_error: -0.002, absolute_error: 0.002, exact_in_confidence_interval: true },
        },
        exact_error: null,
      }),
    } as Response));
    render(<AnalysisPanel state={state} />);
    fireEvent.change(screen.getByLabelText("Analysis method"), { target: { value: "compare" } });
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));

    expect(await screen.findAllByText(/Exact probability:/)).toHaveLength(3);
    expect(screen.getAllByText(/Monte Carlo estimate:/)).toHaveLength(3);
    expect(screen.getAllByText(/Sampling CI:/)).toHaveLength(3);
  });

  it("labels model-uncertainty scenarios without averaging", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        method: "exact",
        model_uncertainty: ["deck_count"],
        aggregation: "none",
        scenarios: [{
          assumptions: { decks: 1, dealer_soft_17: "stand" },
          status: "complete",
          result: {
            method: "exact",
            state_summary: { cards_remaining: 2, known_cards: 50, hidden_cards: 0 },
            outcomes: { win: 0.5, push: 0, loss: 0.5 },
            metadata: { states_evaluated: 3, cache_hits: 0, cache_misses: 3, runtime_ms: 1, hidden_states_evaluated: 0, hidden_weight_mass: 1 },
          },
          error: null,
        }],
      }),
    } as Response));
    render(<AnalysisPanel state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Run analysis" }));

    expect(await screen.findByText(/Model uncertainty is shown as separate scenarios/)).toBeVisible();
    expect(screen.getByText(/1 deck · dealer stands on soft 17/)).toBeVisible();
    expect(screen.getByText(/no averaging is applied/)).toBeVisible();
  });
});
