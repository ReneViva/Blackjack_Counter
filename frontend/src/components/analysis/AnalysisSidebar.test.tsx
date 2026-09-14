import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResearchDefinition } from "../../api/research";
import { gameReducer, type SessionState } from "../../state/gameReducer";
import { createInitialState, DEFAULT_CONFIGURATION } from "../../state/initialState";
import AnalysisSidebar from "./AnalysisSidebar";

const definitions: readonly ResearchDefinition[] = [
  ["wong_halves", "Wong Halves"],
  ["zen_count", "Zen Count"],
  ["omega_ii", "Omega II"],
].map(([identifier, label]) => ({
  identifier: identifier as ResearchDefinition["identifier"],
  label,
  balanced: true,
  level: 2,
  ace_classification: "ace_neutral",
  source: { source_id: "approved-source", title: "Approved Counting Systems", local_path: "research/sources/approved-counting-systems.md", sha256: "343d", locator: "fixture" },
  published_metrics: { kind: "published_static_metadata", pe: .55, bc: .92, ic: .78 },
}));

function exactResponse(win: number): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      method: "exact",
      state_summary: { cards_remaining: 49, known_cards: 3, hidden_cards: 0 },
      outcomes: { win, push: .1, loss: .9 - win },
      metadata: { states_evaluated: 10, cache_hits: 2, cache_misses: 8, runtime_ms: 1, hidden_states_evaluated: 0, hidden_weight_mass: 1 },
    }),
  } as Response;
}

function forecastResponse(
  standWin: number,
  hitWin: number,
  handId = "seat-4-hand-1",
): Response {
  const result = (
    contract: "stand_now" | "hit_once_then_stand",
    win: number,
  ) => ({
    contract,
    status: "available",
    method: "exact",
    outcomes: { win, push: .1, loss: .9 - win },
    metadata: {
      states_evaluated: 10,
      cache_hits: 2,
      cache_misses: 8,
      runtime_ms: 1,
      hidden_states_evaluated: 0,
      hidden_weight_mass: 1,
    },
    error: null,
  });
  return {
    ok: true,
    status: 200,
    json: async () => ({
      method: "exact_action_forecast",
      target: { seat: 4, hand_id: handId },
      action_forecasts: {
        stand_now: result("stand_now", standWin),
        hit_once_then_stand: result("hit_once_then_stand", hitWin),
      },
    }),
  } as Response;
}

function researchResponse(rawScore: number): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      method: "research_comparison",
      scores: definitions.map((definition) => ({
        definition,
        raw_score: rawScore,
        raw_score_fraction: `${rawScore}/1`,
        observed_known_cards: 3,
        unresolved_unknown_cards: 0,
        complete: true,
        ace_information: { feature_id: "ace_information", label: "Ace Information", known_aces_observed: 1, exact_aces_remaining: 3, complete: true },
      })),
      exact_reference: null,
    }),
  } as Response;
}

function startedState(): SessionState {
  let state = gameReducer(createInitialState({
    ...DEFAULT_CONFIGURATION,
    rules: { ...DEFAULT_CONFIGURATION.rules, decks: 1 },
  }), { type: "ADD_PLAYER", seat: 4 });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "8", suit: "hearts" } });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "6", suit: "spades" } });
  return gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "dealer" }, card: { kind: "known", rank: "10", suit: "diamonds" } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("automatic analysis sidebar", () => {
  it("distinguishes incomplete and unavailable analysis states in live status text", async () => {
    const incomplete = gameReducer(createInitialState(), { type: "ADD_PLAYER", seat: 4 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(researchResponse(0)));
    const { rerender } = render(<AnalysisSidebar state={incomplete} />);

    expect(await screen.findByText("Analysis needs more observations", {}, { timeout: 1500 })).toBeVisible();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    rerender(<AnalysisSidebar state={startedState()} />);
    expect(await screen.findByText("Analysis unavailable", {}, { timeout: 1500 })).toBeVisible();
    expect(screen.getByText(/Analysis unavailable for the current state/)).toBeVisible();
  });

  it("debounces backend exact and research requests and renders only returned mathematics", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (!url.endsWith("/analyze")) return researchResponse(2);
      const body = JSON.parse(init.body as string);
      return body.options.method === "exact_action_forecast"
        ? forecastResponse(.4, .2)
        : exactResponse(.5);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AnalysisSidebar
        activeTarget={{ kind: "player-hand", seat: 4, handId: "seat-4-hand-1" }}
        state={startedState()}
      />,
    );

    expect(screen.getByText("Updating from Python…")).toBeVisible();
    expect(await screen.findByLabelText("Exact win probability", {}, { timeout: 1500 })).toHaveAttribute("aria-valuetext", "50.0%");
    expect(screen.getAllByText("2/1")).toHaveLength(3);
    expect(screen.getByText("Known aces observed").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Wong Halves")).toBeVisible();
    expect(screen.getByText("Zen Count")).toBeVisible();
    expect(screen.getByText("Omega II")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Selected-hand outcomes" })).toBeVisible();
    expect(screen.getByLabelText("Stand now forecast")).toHaveTextContent("40.0%");
    expect(screen.getByLabelText("Hit once, then stand forecast")).toHaveTextContent("20.0%");
    expect(screen.getByText("Exact finite-shoe")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
      "http://127.0.0.1:8000/api/analyze",
      "http://127.0.0.1:8000/api/research/compare",
    ]));
    expect(screen.queryByText(/Suggested (Hit|Stand|Double|Split)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Better|Best|Recommended|Choose|Optimal/i)).not.toBeInTheDocument();
  });

  it("shows understandable loading and unavailable states for forecasts", async () => {
    const pending = new Promise<Response>(() => undefined);
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      if (!url.endsWith("/analyze")) return Promise.resolve(researchResponse(0));
      const body = JSON.parse(init.body as string);
      return body.options.method === "exact_action_forecast"
        ? pending
        : Promise.resolve(exactResponse(.5));
    });
    vi.stubGlobal("fetch", fetchMock);
    const state = startedState();
    const { rerender } = render(
      <AnalysisSidebar
        activeTarget={{ kind: "player-hand", seat: 4, handId: "seat-4-hand-1" }}
        state={state}
      />,
    );

    expect(await screen.findByText("Calculating exact hypothetical outcomes...", {}, { timeout: 1500 })).toBeVisible();
    rerender(<AnalysisSidebar activeTarget={null} state={state} />);
    expect(await screen.findByText("Select a primary hand to calculate its hypothetical outcomes.", {}, { timeout: 1500 })).toBeVisible();
  });

  it("does not let an older hand forecast overwrite the newly selected split hand", async () => {
    let state = gameReducer(createInitialState({
      ...DEFAULT_CONFIGURATION,
      rules: { ...DEFAULT_CONFIGURATION.rules, decks: 1 },
    }), { type: "ADD_PLAYER", seat: 4 });
    state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "8", suit: "hearts" } });
    state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "8", suit: "spades" } });
    state = gameReducer(state, { type: "SPLIT_PLAYER_HAND", seat: 4, handId: "seat-4-hand-1", leftHandId: "seat-4-hand-1-1", rightHandId: "seat-4-hand-1-2", splitDepth: 1, fromSplitAces: false });
    state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-1" }, card: { kind: "known", rank: "2", suit: "clubs" } });
    state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" }, card: { kind: "known", rank: "3", suit: "clubs" } });
    state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "dealer" }, card: { kind: "known", rank: "10", suit: "diamonds" } });

    let resolveOld!: (response: Response) => void;
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      if (!url.endsWith("/analyze")) return Promise.resolve(researchResponse(0));
      const body = JSON.parse(init.body as string);
      if (body.options.method !== "exact_action_forecast") return Promise.resolve(exactResponse(.5));
      if (body.options.target.hand_id === "seat-4-hand-1-1") {
        return new Promise<Response>((resolve) => { resolveOld = resolve; });
      }
      return Promise.resolve(forecastResponse(.73, .21, "seat-4-hand-1-2"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <AnalysisSidebar
        activeTarget={{ kind: "player-hand", seat: 4, handId: "seat-4-hand-1-1" }}
        state={state}
      />,
    );
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"), { timeout: 1500 });

    rerender(
      <AnalysisSidebar
        activeTarget={{ kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" }}
        state={state}
      />,
    );
    expect(await screen.findByText("73.0%", {}, { timeout: 1500 })).toBeVisible();
    resolveOld(forecastResponse(.11, .12, "seat-4-hand-1-1"));
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(screen.getByText("73.0%")).toBeVisible();
    expect(screen.queryByText("11.0%")).not.toBeInTheDocument();
  });

  it("prevents an older response from overwriting a newer table state", async () => {
    const oldResolvers: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const knownCards = body.state.players.flatMap((player: { cards: unknown[] }) => player.cards).length;
      if (knownCards === 2) return new Promise<Response>((resolve) => oldResolvers.push(resolve));
      return Promise.resolve(url.endsWith("/analyze") ? exactResponse(.8) : researchResponse(8));
    });
    vi.stubGlobal("fetch", fetchMock);
    const first = startedState();
    const { rerender } = render(<AnalysisSidebar state={first} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 1500 });

    const newer = gameReducer(first, {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "player", seat: 4 },
      card: { kind: "known", rank: "A", suit: "clubs" },
    });
    rerender(<AnalysisSidebar state={newer} />);
    expect(await screen.findByText("80.0%", {}, { timeout: 1500 })).toBeVisible();
    expect(screen.getAllByText("8/1")).toHaveLength(3);

    oldResolvers[0](exactResponse(.1));
    oldResolvers[1](researchResponse(1));
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(screen.getByText("80.0%")).toBeVisible();
    expect(screen.queryAllByText("1/1")).toHaveLength(0);
  });
});
