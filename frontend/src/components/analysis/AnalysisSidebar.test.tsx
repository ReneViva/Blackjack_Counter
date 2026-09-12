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
  it("debounces backend exact and research requests and renders only returned mathematics", async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith("/analyze") ? exactResponse(.5) : researchResponse(2));
    vi.stubGlobal("fetch", fetchMock);
    render(<AnalysisSidebar state={startedState()} />);

    expect(screen.getByText("Updating from Python…")).toBeVisible();
    expect(await screen.findByText("50.0%", {}, { timeout: 1500 })).toBeVisible();
    expect(screen.getAllByText("2/1")).toHaveLength(3);
    expect(screen.getByText("Known aces observed").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Wong Halves")).toBeVisible();
    expect(screen.getByText("Zen Count")).toBeVisible();
    expect(screen.getByText("Omega II")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
      "http://127.0.0.1:8000/api/analyze",
      "http://127.0.0.1:8000/api/research/compare",
    ]));
    expect(screen.queryByText(/Suggested (Hit|Stand|Double|Split)/i)).not.toBeInTheDocument();
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
