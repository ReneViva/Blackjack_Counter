import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TableTarget } from "../../domain/events";
import { gameReducer, type SessionState } from "../../state/gameReducer";
import { createInitialState, DEFAULT_CONFIGURATION } from "../../state/initialState";
import { selectTableState } from "../../state/selectors";
import AnalysisSidebar from "./AnalysisSidebar";


function response(payload: unknown): Response {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

function researchResponse(): Response {
  return response({ method: "research_comparison", scores: [], exact_reference: null });
}

function summaryResponse(handIds: readonly string[], wins: readonly number[]): Response {
  return response({
    method: "exact_hand_summaries",
    target: { seat: 4, hand_id: handIds[0] },
    hands: handIds.map((handId, index) => ({
      target: { seat: 4, hand_id: handId },
      status: "complete",
      state_summary: { cards_remaining: 45, known_cards: 7, hidden_cards: 0 },
      outcomes: { win: wins[index], push: .1, loss: .9 - wins[index] },
      metadata: { states_evaluated: 10, cache_hits: 2, cache_misses: 8, runtime_ms: 1, hidden_states_evaluated: 0, hidden_weight_mass: 1 },
      error: null,
    })),
  });
}

function unknownSummaryResponse(handIds: readonly string[]): Response {
  return response({
    method: "exact_hand_summaries",
    target: { seat: 4, hand_id: handIds[0] },
    model_uncertainty: ["deck_count"],
    aggregation: "none",
    resource_limit_scope: "per_scenario",
    exact_state_limit_per_scenario: 2_000_000,
    scenarios: [],
    deck_count_summaries: handIds.map((handId, index) => ({
      target: { seat: 4, hand_id: handId },
      method: "uniform_valid_deck_count_mean",
      assumption: "equal_weight_valid_deck_counts",
      dealer_soft_17: "stand",
      status: "available",
      candidate_deck_counts: [1, 2, 3, 4, 5, 6, 7, 8],
      included_deck_counts: [1, 2, 3, 4, 5, 6, 7, 8],
      excluded_deck_counts: [],
      outcomes: { win: .4 + index / 10, push: .1, loss: .5 - index / 10 },
      ranges: {
        win: { minimum: .35 + index / 10, maximum: .45 + index / 10 },
        push: { minimum: .08, maximum: .12 },
        loss: { minimum: .45 - index / 10, maximum: .55 - index / 10 },
      },
      error: null,
    })),
  });
}

function forecastResponse(handId: string, win: number): Response {
  const outcome = (contract: string) => ({
    contract,
    status: "available",
    method: "exact",
    outcomes: { win, push: .1, loss: .9 - win },
    metadata: { states_evaluated: 1, cache_hits: 0, cache_misses: 1, runtime_ms: 1, hidden_states_evaluated: 0, hidden_weight_mass: 1 },
    error: null,
  });
  return response({
    method: "exact_action_forecast",
    target: { seat: 4, hand_id: handId },
    action_forecasts: {
      stand_now: outcome("stand_now"),
      hit_once_then_stand: outcome("hit_once_then_stand"),
      double_one_card_then_stand: outcome("double_one_card_then_stand"),
      surrender_now: { contract: "surrender_now", status: "unavailable", method: "exact", terminal: null, error: { code: "unavailable", message: "Unavailable in fixture.", field: null } },
      split_one_card_each_then_stand: { contract: "split_one_card_each_then_stand", status: "unavailable", method: "exact", child_hand_1: null, child_hand_2: null, metadata: null, error: { code: "unavailable", message: "Unavailable in fixture.", field: null } },
    },
  });
}

function twoHandState(): SessionState {
  let state = gameReducer(createInitialState({
    ...DEFAULT_CONFIGURATION,
    rules: { ...DEFAULT_CONFIGURATION.rules, decks: 1, maxSplitHands: 4 },
  }), { type: "ADD_PLAYER", seat: 4 });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "8", suit: "hearts" } });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "8", suit: "spades" } });
  state = gameReducer(state, { type: "SPLIT_PLAYER_HAND", seat: 4, handId: "seat-4-hand-1", leftHandId: "seat-4-hand-1-1", rightHandId: "seat-4-hand-1-2", splitDepth: 1, fromSplitAces: false });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-1" }, card: { kind: "known", rank: "2", suit: "clubs" } });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" }, card: { kind: "known", rank: "3", suit: "clubs" } });
  return gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "dealer" }, card: { kind: "known", rank: "10", suit: "diamonds" } });
}

function fourHandState(): SessionState {
  let state = gameReducer(createInitialState({
    ...DEFAULT_CONFIGURATION,
    rules: { ...DEFAULT_CONFIGURATION.rules, decks: 1, maxSplitHands: 4 },
  }), { type: "ADD_PLAYER", seat: 4 });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "8", suit: "hearts" } });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "8", suit: "spades" } });
  state = gameReducer(state, { type: "SPLIT_PLAYER_HAND", seat: 4, handId: "seat-4-hand-1", leftHandId: "seat-4-hand-1-1", rightHandId: "seat-4-hand-1-2", splitDepth: 1, fromSplitAces: false });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-1" }, card: { kind: "known", rank: "8", suit: "clubs" } });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" }, card: { kind: "known", rank: "8", suit: "diamonds" } });
  state = gameReducer(state, { type: "SPLIT_PLAYER_HAND", seat: 4, handId: "seat-4-hand-1-1", leftHandId: "seat-4-hand-1-1-1", rightHandId: "seat-4-hand-1-1-2", splitDepth: 2, fromSplitAces: false });
  state = gameReducer(state, { type: "SPLIT_PLAYER_HAND", seat: 4, handId: "seat-4-hand-1-2", leftHandId: "seat-4-hand-1-2-1", rightHandId: "seat-4-hand-1-2-2", splitDepth: 2, fromSplitAces: false });
  for (const [handId, rank] of [
    ["seat-4-hand-1-1-1", "2"],
    ["seat-4-hand-1-1-2", "3"],
    ["seat-4-hand-1-2-1", "4"],
    ["seat-4-hand-1-2-2", "5"],
  ] as const) {
    state = gameReducer(state, { type: "DEAL_VALUE_CARD", target: { kind: "player-hand", seat: 4, handId }, card: { kind: "value", value: rank } });
  }
  return gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "dealer" }, card: { kind: "known", rank: "10", suit: "diamonds" } });
}

function handIds(state: SessionState): string[] {
  return selectTableState(state).playerHands[4].map((hand) => hand.handId);
}

function defaultFetch(state: SessionState, unknownDeck = false) {
  const ids = handIds(state);
  return vi.fn(async (url: string, init: RequestInit) => {
    if (!url.endsWith("/analyze")) return researchResponse();
    const body = JSON.parse(init.body as string);
    if (body.options.method === "exact_action_forecast") {
      const id = body.options.target.hand_id as string;
      return forecastResponse(id, id === ids[1] ? .77 : .31);
    }
    return unknownDeck ? unknownSummaryResponse(ids) : summaryResponse(ids, ids.map((_, index) => .4 + index / 10));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("split hand analysis", () => {
  it("renders two stable-ID exact summaries without the false generic state", async () => {
    const state = twoHandState();
    const ids = handIds(state);
    const fetchMock = defaultFetch(state);
    vi.stubGlobal("fetch", fetchMock);

    render(<AnalysisSidebar activeTarget={{ kind: "player-hand", seat: 4, handId: ids[0] }} state={state} />);

    const first = await screen.findByRole("button", { name: "Select Hand 1 for analysis" }, { timeout: 1500 });
    const second = screen.getByRole("button", { name: "Select Hand 2 for analysis" });
    const firstSummary = first.closest(".split-summary")!;
    const secondSummary = second.closest(".split-summary")!;
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(firstSummary).toHaveTextContent("Win40.0%Push10.0%Loss50.0%"), { timeout: 1500 });
    expect(secondSummary).toHaveTextContent("Win50.0%Push10.0%Loss40.0%");
    expect(screen.queryByText("Analysis needs more observations")).not.toBeInTheDocument();
    const summaryCalls = fetchMock.mock.calls.filter(([, init]) => JSON.parse((init as RequestInit).body as string).options?.method === "exact_hand_summaries");
    expect(summaryCalls).toHaveLength(1);
    const sentPlayers = JSON.parse((summaryCalls[0][1] as RequestInit).body as string).state.players;
    expect(sentPlayers.map((player: { hand_id: string }) => player.hand_id)).toEqual(ids);
  });

  it("selects Hand 2 semantically and switches only the selected-hand forecast", async () => {
    const state = twoHandState();
    const ids = handIds(state);
    vi.stubGlobal("fetch", defaultFetch(state));
    function Harness() {
      const [target, setTarget] = useState<Extract<TableTarget, { kind: "player-hand" }>>({ kind: "player-hand", seat: 4, handId: ids[0] });
      return <AnalysisSidebar activeTarget={target} onSelectAnalysisTarget={setTarget} state={state} />;
    }
    render(<Harness />);
    const hand2 = await screen.findByRole("button", { name: "Select Hand 2 for analysis" }, { timeout: 1500 });

    fireEvent.click(hand2);

    expect(hand2).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Selected Hand 2 feeds the hypothetical action forecast below.")).toBeVisible();
    const stand = await screen.findByLabelText("Stand now forecast", {}, { timeout: 1500 });
    expect(stand).toHaveTextContent("77.0%");
  });

  it("renders every hand in a four-hand resplit without hard-coding two", async () => {
    const state = fourHandState();
    const ids = handIds(state);
    expect(ids).toHaveLength(4);
    vi.stubGlobal("fetch", defaultFetch(state));

    render(<AnalysisSidebar activeTarget={{ kind: "player-hand", seat: 4, handId: ids[0] }} state={state} />);

    expect(await screen.findAllByText("40.0%", {}, { timeout: 1500 })).not.toHaveLength(0);
    for (const number of [1, 2, 3, 4]) {
      expect(screen.getByRole("button", { name: `Select Hand ${number} for analysis` })).toBeVisible();
    }
  });

  it("invalidates all sibling cards and rejects a late older shared-state response", async () => {
    const first = twoHandState();
    const ids = handIds(first);
    let resolveOld!: (value: Response) => void;
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      if (!url.endsWith("/analyze")) return Promise.resolve(researchResponse());
      const body = JSON.parse(init.body as string);
      if (body.options.method === "exact_action_forecast") return Promise.resolve(forecastResponse(body.options.target.hand_id, .2));
      const cardCount = body.state.players.flatMap((player: { cards: unknown[] }) => player.cards).length;
      if (cardCount === 4) return new Promise<Response>((resolve) => { resolveOld = resolve; });
      return Promise.resolve(summaryResponse(ids, [.8, .7]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<AnalysisSidebar activeTarget={{ kind: "player-hand", seat: 4, handId: ids[0] }} state={first} />);
    await waitFor(() => expect(resolveOld).toBeTypeOf("function"), { timeout: 1500 });
    const newer = gameReducer(first, { type: "DEAL_VALUE_CARD", target: { kind: "player-hand", seat: 4, handId: ids[0] }, card: { kind: "value", value: "4" } });

    rerender(<AnalysisSidebar activeTarget={{ kind: "player-hand", seat: 4, handId: ids[0] }} state={newer} />);

    const second = await screen.findByRole("button", { name: "Select Hand 2 for analysis" }, { timeout: 1500 });
    const secondSummary = second.closest(".split-summary")!;
    await waitFor(() => expect(secondSummary).toHaveTextContent("70.0%"), { timeout: 1500 });
    resolveOld(summaryResponse(ids, [.1, .2]));
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(secondSummary).toHaveTextContent("70.0%");
    expect(secondSummary.querySelectorAll("dd")[0]).toHaveTextContent("70.0%");
  });

  it("keeps the previous shared split summaries visible while the next batch updates", async () => {
    const state = twoHandState();
    const ids = handIds(state);
    const fetchMock = defaultFetch(state);
    vi.stubGlobal("fetch", fetchMock);
    const target = { kind: "player-hand" as const, seat: 4 as const, handId: ids[0] };
    const { rerender } = render(<AnalysisSidebar activeTarget={target} state={state} />);
    const hand2 = await screen.findByRole("button", {
      name: "Select Hand 2 for analysis",
    }, { timeout: 1500 });
    const summary = hand2.closest<HTMLElement>(".split-summary")!;
    await waitFor(() => expect(summary).toHaveTextContent("Win50.0%Push10.0%Loss40.0%"), {
      timeout: 1500,
    });

    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const changed = gameReducer(state, {
      type: "DEAL_VALUE_CARD",
      target,
      card: { kind: "value", value: "4" },
    });
    rerender(<AnalysisSidebar activeTarget={target} state={changed} />);

    expect(summary).toHaveTextContent("Win50.0%Push10.0%Loss40.0%");
    expect(summary).toHaveTextContent("Updating exact outcomes…");
    expect(summary.querySelector(".analysis-results--updating")).not.toBeNull();
  });

  it("re-requests the one batch after dealer and unrelated-seat shoe changes", async () => {
    const first = twoHandState();
    const ids = handIds(first);
    const fetchMock = defaultFetch(first);
    vi.stubGlobal("fetch", fetchMock);
    const target = { kind: "player-hand" as const, seat: 4 as const, handId: ids[0] };
    const { rerender } = render(<AnalysisSidebar activeTarget={target} state={first} />);
    const count = () => fetchMock.mock.calls.filter(([, init]) => JSON.parse((init as RequestInit).body as string).options?.method === "exact_hand_summaries").length;
    await waitFor(() => expect(count()).toBe(1), { timeout: 1500 });
    const dealerChanged = gameReducer(first, { type: "DEAL_UNKNOWN_CARD", target: { kind: "dealer" } });
    rerender(<AnalysisSidebar activeTarget={target} state={dealerChanged} />);
    await waitFor(() => expect(count()).toBe(2), { timeout: 1500 });
    let otherChanged = gameReducer(dealerChanged, { type: "ADD_PLAYER", seat: 2 });
    otherChanged = gameReducer(otherChanged, { type: "DEAL_VALUE_CARD", target: { kind: "player", seat: 2 }, card: { kind: "value", value: "10" } });
    rerender(<AnalysisSidebar activeTarget={target} state={otherChanged} />);
    await waitFor(() => expect(count()).toBe(3), { timeout: 1500 });
  });

  it("renders backend-owned unknown-deck summaries for every split hand", async () => {
    const base = twoHandState();
    const state = { ...base, configuration: { ...base.configuration, rules: { ...base.configuration.rules, decks: null } } };
    const ids = handIds(state);
    vi.stubGlobal("fetch", defaultFetch(state, true));

    render(<AnalysisSidebar activeTarget={{ kind: "player-hand", seat: 4, handId: ids[0] }} state={state} />);

    const hand1 = await screen.findByRole("button", { name: "Select Hand 1 for analysis" }, { timeout: 1500 });
    const hand2 = screen.getByRole("button", { name: "Select Hand 2 for analysis" });
    const hand1Summary = hand1.closest<HTMLElement>(".split-summary")!;
    const hand2Summary = hand2.closest(".split-summary")!;
    await waitFor(() => expect(hand1Summary).toHaveTextContent("Uniform summary across 8 valid deck-count models"), { timeout: 1500 });
    expect(hand2Summary).toHaveTextContent("50.0%");
    expect(within(hand1Summary).getAllByText(/Model range/)).toHaveLength(3);
  });

  it("distinguishes a removed target, updating state, and backend failure", async () => {
    const state = twoHandState();
    const ids = handIds(state);
    vi.stubGlobal("fetch", defaultFetch(state));
    const { rerender } = render(<AnalysisSidebar activeTarget={{ kind: "player-hand", seat: 4, handId: "removed-parent" }} state={state} />);
    expect(await screen.findAllByText(/previous analysis target is no longer available/i, {}, { timeout: 1500 })).not.toHaveLength(0);

    const pending = new Promise<Response>(() => undefined);
    vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => {
      if (!url.endsWith("/analyze")) return Promise.resolve(researchResponse());
      const body = JSON.parse(init.body as string);
      return body.options.method === "exact_hand_summaries" ? pending : Promise.resolve(forecastResponse(ids[0], .2));
    }));
    rerender(<AnalysisSidebar activeTarget={{ kind: "player-hand", seat: 4, handId: ids[0] }} state={state} />);
    expect(await screen.findAllByText("Updating exact outcomes…", {}, { timeout: 1500 })).toHaveLength(2);

    vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => {
      if (!url.endsWith("/analyze")) return Promise.resolve(researchResponse());
      const body = JSON.parse(init.body as string);
      return body.options.method === "exact_hand_summaries" ? Promise.reject(new Error("offline")) : Promise.resolve(forecastResponse(ids[0], .2));
    }));
    const changed = gameReducer(state, { type: "DEAL_UNKNOWN_CARD", target: { kind: "dealer" } });
    rerender(<AnalysisSidebar activeTarget={{ kind: "player-hand", seat: 4, handId: ids[0] }} state={changed} />);
    expect(await screen.findByText("Analysis unavailable", {}, { timeout: 1500 })).toBeVisible();
    expect(screen.getAllByText(/Analysis unavailable for the current state/).length).toBeGreaterThan(0);
  });
});
