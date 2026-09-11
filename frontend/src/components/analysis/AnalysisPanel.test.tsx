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

describe("exact analysis panel", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Analyze exact result" }));

    expect(await screen.findByText("50.00%")).toBeVisible();
    expect(screen.getByText("12.50%")).toBeVisible();
    expect(screen.getByText("37.50%")).toBeVisible();
    expect(screen.getByText(/9 states evaluated/)).toBeVisible();
    expect(screen.getByText(/2 cache hits/)).toBeVisible();
    expect(screen.getByText("No sampling or confidence interval")).toBeVisible();
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
    fireEvent.click(screen.getByRole("button", { name: "Analyze exact result" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Exact analysis requires a known deck count.",
    );
  });
});
