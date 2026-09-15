import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResearchDefinition } from "../../api/research";
import { gameReducer, type SessionState } from "../../state/gameReducer";
import { createInitialState, DEFAULT_CONFIGURATION } from "../../state/initialState";
import AnalysisSidebar from "./AnalysisSidebar";

const definitions: readonly ResearchDefinition[] = [
  ["hi_lo", "Hi-Lo"],
  ["wong_halves", "Wong Halves"],
  ["zen_count", "Zen Count"],
  ["omega_ii", "Omega II"],
].map(([identifier, label]) => ({
  identifier: identifier as ResearchDefinition["identifier"],
  label,
  balanced: true,
  level: 2,
  ace_classification: "ace_neutral",
  canonical_tags: [
    { card_value: "A", tag_fraction: "-1", tag_decimal: -1 },
    { card_value: "2", tag_fraction: "1", tag_decimal: 1 },
    { card_value: "10", tag_fraction: "-1", tag_decimal: -1 },
  ],
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
    contract: "stand_now" | "hit_once_then_stand" | "double_one_card_then_stand",
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
        double_one_card_then_stand: result("double_one_card_then_stand", hitWin),
        surrender_now: {
          contract: "surrender_now",
          status: "available",
          method: "exact",
          terminal: "surrendered",
          error: null,
        },
        split_one_card_each_then_stand: {
          contract: "split_one_card_each_then_stand",
          status: "available",
          method: "exact",
          child_hand_1: { win: .3, push: .2, loss: .5 },
          child_hand_2: { win: .25, push: .15, loss: .6 },
          metadata: {
            states_evaluated: 20,
            cache_hits: 4,
            cache_misses: 16,
            runtime_ms: 2,
            hidden_states_evaluated: 0,
            hidden_weight_mass: 1,
          },
          error: null,
        },
      },
    }),
  } as Response;
}

async function forecastPayload(standWin: number, hitWin: number) {
  return forecastResponse(standWin, hitWin).json();
}

function unknownExactResponse(): Response {
  const scenarios = Array.from({ length: 8 }, (_, index) => ({
    assumptions: { decks: index + 1, dealer_soft_17: "stand" },
    status: index === 0 ? "invalid" : "complete",
    result: index === 0 ? null : {
      method: "exact",
      state_summary: { cards_remaining: 52 * (index + 1) - 4, known_cards: 4, hidden_cards: 0 },
      outcomes: { win: .42, push: .08, loss: .5 },
      metadata: { states_evaluated: 10, cache_hits: 2, cache_misses: 8, runtime_ms: 1, hidden_states_evaluated: 0, hidden_weight_mass: 1 },
    },
    error: index === 0 ? { code: "exact_card_multiplicity_exceeded", message: "Observed card multiplicity is impossible for one deck.", field: "cards" } : null,
  }));
  return {
    ok: true,
    status: 200,
    json: async () => ({
      method: "exact",
      model_uncertainty: ["deck_count"],
      aggregation: "none",
      scenarios,
      deck_count_summaries: [{
        method: "uniform_valid_deck_count_mean",
        assumption: "equal_weight_valid_deck_counts",
        dealer_soft_17: "stand",
        status: "available",
        candidate_deck_counts: [1, 2, 3, 4, 5, 6, 7, 8],
        included_deck_counts: [2, 3, 4, 5, 6, 7, 8],
        excluded_deck_counts: [{ deck_count: 1, code: "exact_card_multiplicity_exceeded", message: "Observed card multiplicity is impossible for one deck." }],
        outcomes: { win: .42, push: .08, loss: .5 },
        ranges: { win: { minimum: .4, maximum: .44 }, push: { minimum: .07, maximum: .09 }, loss: { minimum: .49, maximum: .51 } },
        error: null,
      }],
    }),
  } as Response;
}

function unknownForecastResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => {
      const direct = await forecastPayload(.41, .43) as Record<string, any>;
      const scenarios = Array.from({ length: 8 }, (_, index) => ({
        assumptions: { decks: index + 1, dealer_soft_17: "stand" },
        status: "complete",
        result: direct,
        error: null,
      }));
      const outcome = (contract: string, win: number) => ({
        contract,
        status: "available",
        outcomes: { win, push: .1, loss: .9 - win },
        ranges: { win: { minimum: win - .02, maximum: win + .02 }, push: { minimum: .09, maximum: .11 }, loss: { minimum: .9 - win - .02, maximum: .9 - win + .02 } },
        terminal: null,
        child_hand_1: null,
        child_hand_2: null,
        error: null,
      });
      const child = { outcomes: { win: .3, push: .2, loss: .5 }, ranges: { win: { minimum: .28, maximum: .32 }, push: { minimum: .18, maximum: .22 }, loss: { minimum: .48, maximum: .52 } } };
      return {
        method: "exact_action_forecast",
        model_uncertainty: ["deck_count"],
        aggregation: "none",
        scenarios,
        deck_count_summaries: [{
          method: "uniform_valid_deck_count_mean",
          assumption: "equal_weight_valid_deck_counts",
          dealer_soft_17: "stand",
          status: "available",
          candidate_deck_counts: [1, 2, 3, 4, 5, 6, 7, 8],
          included_deck_counts: [1, 2, 3, 4, 5, 6, 7, 8],
          excluded_deck_counts: [],
          error: null,
          action_forecasts: {
            stand_now: outcome("stand_now", .41),
            hit_once_then_stand: outcome("hit_once_then_stand", .43),
            double_one_card_then_stand: outcome("double_one_card_then_stand", .43),
            surrender_now: { contract: "surrender_now", status: "available", outcomes: null, ranges: null, terminal: "surrendered", child_hand_1: null, child_hand_2: null, error: null },
            split_one_card_each_then_stand: { contract: "split_one_card_each_then_stand", status: "available", outcomes: null, ranges: null, terminal: null, child_hand_1: child, child_hand_2: child, error: null },
          },
        }],
      };
    },
  } as Response;
}

function unavailableExtendedForecastResponse(): Response {
  const base = forecastResponse(.4, .2);
  return {
    ok: true,
    status: 200,
    json: async () => {
      const payload = await base.json();
      const unavailable = (contract: string, code: string, message: string) => ({
        contract,
        status: "unavailable",
        method: "exact",
        outcomes: null,
        metadata: null,
        error: { code, message, field: null },
      });
      return {
        ...payload,
        action_forecasts: {
          ...payload.action_forecasts,
          double_one_card_then_stand: unavailable(
            "double_one_card_then_stand",
            "double_not_allowed",
            "Doubling is not allowed.",
          ),
          surrender_now: {
            contract: "surrender_now",
            status: "unavailable",
            method: "exact",
            terminal: null,
            error: {
              code: "surrender_not_allowed",
              message: "Late surrender is not allowed for this hand.",
              field: null,
            },
          },
          split_one_card_each_then_stand: {
            contract: "split_one_card_each_then_stand",
            status: "unavailable",
            method: "exact",
            child_hand_1: null,
            child_hand_2: null,
            metadata: null,
            error: {
              code: "exact_pair_required",
              message: "Splitting requires two known cards of the same exact rank.",
              field: null,
            },
          },
        },
      };
    },
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
        raw_score: definition.identifier === "hi_lo" ? 0 : rawScore,
        raw_score_fraction: definition.identifier === "hi_lo" ? "0" : `${rawScore}/1`,
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

function unknownDeckState(): SessionState {
  const current = startedState();
  return {
    ...current,
    configuration: {
      ...current.configuration,
      rules: { ...current.configuration.rules, decks: null },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("automatic analysis sidebar", () => {
  it("renders compact Pro research rows with accessible Level 2 disclosures", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (!url.endsWith("/analyze")) return researchResponse(2);
      const body = JSON.parse(init.body as string);
      return body.options.method === "exact_action_forecast"
        ? forecastResponse(.4, .2)
        : exactResponse(.5);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <AnalysisSidebar
        activeTarget={{ kind: "player-hand", seat: 4, handId: "seat-4-hand-1" }}
        state={startedState()}
        workspaceMode="pro"
      />,
    );

    const summaries = await screen.findByRole("list", {
      name: "Compact research-system summaries",
    }, { timeout: 1500 });
    for (const label of ["Hi-Lo", "Wong Halves", "Zen Count", "Omega II"]) {
      const row = within(summaries).getByRole("listitem", {
        name: `${label} compact research summary`,
      });
      expect(row).toHaveTextContent(label);
      expect(row).toHaveTextContent("PE0.55BC0.92IC0.78");
      if (label === "Hi-Lo") expect(row).toHaveTextContent("0");
    }
    const details = screen.getByText("Research details").parentElement!;
    const comparison = screen.getByText("Compare systems").parentElement!;
    expect(details).not.toHaveAttribute("open");
    expect(comparison).not.toHaveAttribute("open");
    expect(within(details).getByText(/Raw research scores summarize/)).toBeInTheDocument();
    expect(within(details).getByText(/Ace Information is a separate auxiliary/)).toBeInTheDocument();
    expect(container.querySelector(".action-forecast__results > .forecast-list"))
      .toBeInTheDocument();
    for (const label of [
      "Stand now forecast",
      "Hit once, then stand forecast",
      "Double — one card, then stand forecast",
      "Surrender now forecast",
      "Split one card to each hand, then stand forecast",
    ]) {
      expect(screen.getByRole("article", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("region", { name: "Ace Information" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Table Information" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Research details"));
    expect(details).toHaveAttribute("open");
    expect(screen.getAllByText("What this means")).toHaveLength(4);
    fireEvent.click(screen.getByText("Compare systems"));
    expect(comparison).toHaveAttribute("open");
    expect(screen.getByRole("table", { name: "Research-system comparison" })).toHaveTextContent("Hi-Lo");
    expect(screen.getByText("Known aces observed").nextSibling).toHaveTextContent("1");
    expect(screen.getByLabelText("Exact win probability")).toHaveAttribute("aria-valuetext", "50.0%");
  });

  it("distinguishes incomplete and unavailable analysis states in live status text", async () => {
    const incomplete = gameReducer(createInitialState(), { type: "ADD_PLAYER", seat: 4 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(researchResponse(0)));
    const { rerender } = render(<AnalysisSidebar state={incomplete} />);

    expect(await screen.findByText("Awaiting required observations", {}, { timeout: 1500 })).toBeVisible();

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
    expect(screen.getAllByText("2/1")).toHaveLength(6);
    expect(screen.getByText("Known aces observed").nextSibling).toHaveTextContent("1");
    expect(screen.getByRole("heading", { name: "Hi-Lo" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Wong Halves" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Zen Count" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Omega II" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Selected-hand outcomes" })).toBeVisible();
    expect(screen.getByLabelText("Stand now forecast")).toHaveTextContent("40.0%");
    expect(screen.getByLabelText("Hit once, then stand forecast")).toHaveTextContent("20.0%");
    expect(screen.getByLabelText("Double — one card, then stand forecast")).toHaveTextContent("20.0%");
    const surrender = screen.getByLabelText("Surrender now forecast");
    expect(surrender).toHaveTextContent("Terminal outcomeSurrendered");
    expect(surrender).toHaveTextContent("No further cards are drawn.");
    expect(within(surrender).queryByText(/Win|Push|Loss/)).not.toBeInTheDocument();
    const split = screen.getByLabelText("Split one card to each hand, then stand forecast");
    expect(within(split).getByRole("heading", { name: "Hand 1" })).toBeVisible();
    expect(within(split).getByRole("heading", { name: "Hand 2" })).toBeVisible();
    expect(split).toHaveTextContent("30.0%");
    expect(split).toHaveTextContent("25.0%");
    expect(screen.getByText("Exact finite-shoe")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([
      "http://127.0.0.1:8000/api/analyze",
      "http://127.0.0.1:8000/api/research/compare",
    ]));
    expect(screen.queryByText(/Suggested (Hit|Stand|Double|Split)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Better|Best|Recommended|Choose|Optimal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Payout|Wager|Stake|Expected value|Bet size|Player advantage is/i)).not.toBeInTheDocument();
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

  it("keeps previous exact and forecast values visible while the next state updates", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (!url.endsWith("/analyze")) return researchResponse(2);
      const body = JSON.parse(init.body as string);
      return body.options.method === "exact_action_forecast"
        ? forecastResponse(.4, .2)
        : exactResponse(.5);
    });
    vi.stubGlobal("fetch", fetchMock);
    const state = startedState();
    const target = { kind: "player-hand" as const, seat: 4 as const, handId: "seat-4-hand-1" };
    const { rerender } = render(<AnalysisSidebar activeTarget={target} state={state} />);
    expect(await screen.findByLabelText("Exact win probability", {}, { timeout: 1500 }))
      .toHaveAttribute("aria-valuetext", "50.0%");
    expect(await screen.findByLabelText("Stand now forecast", {}, { timeout: 1500 }))
      .toHaveTextContent("40.0%");

    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const changed = gameReducer(state, {
      type: "DEAL_VALUE_CARD",
      target,
      card: { kind: "value", value: "2" },
    });
    rerender(<AnalysisSidebar activeTarget={target} state={changed} />);

    expect(screen.getByText("Updating from Python…")).toBeVisible();
    expect(screen.getByLabelText("Exact win probability"))
      .toHaveAttribute("aria-valuetext", "50.0%");
    expect(screen.getByLabelText("Stand now forecast")).toHaveTextContent("40.0%");
    expect(screen.getByText(/previous values remain visible/i)).toBeVisible();
    expect(screen.getByLabelText("Stand now forecast").closest(".analysis-results--updating"))
      .not.toBeNull();
  });

  it("renders independent backend explanations for unavailable extended actions", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (!url.endsWith("/analyze")) return researchResponse(0);
      const body = JSON.parse(init.body as string);
      return body.options.method === "exact_action_forecast"
        ? unavailableExtendedForecastResponse()
        : exactResponse(.5);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AnalysisSidebar
        activeTarget={{ kind: "player-hand", seat: 4, handId: "seat-4-hand-1" }}
        state={startedState()}
      />,
    );

    expect(await screen.findByLabelText("Double — one card, then stand forecast", {}, { timeout: 1500 })).toHaveTextContent(
      "Unavailable. Doubling is not allowed.",
    );
    expect(screen.getByLabelText("Surrender now forecast")).toHaveTextContent(
      "Unavailable. Late surrender is not allowed for this hand.",
    );
    expect(screen.getByLabelText("Split one card to each hand, then stand forecast")).toHaveTextContent(
      "Unavailable. Splitting requires two known cards of the same exact rank.",
    );
  });

  it("renders compact unknown-deck exact and action summaries with accessible scenarios", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (!url.endsWith("/analyze")) return researchResponse(0);
      const body = JSON.parse(init.body as string);
      return body.options.method === "exact_action_forecast"
        ? unknownForecastResponse()
        : unknownExactResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AnalysisSidebar
        activeTarget={{ kind: "player-hand", seat: 4, handId: "seat-4-hand-1" }}
        state={unknownDeckState()}
      />,
    );

    const exactSummary = await screen.findByLabelText("STAND uniform deck-count summary", {}, { timeout: 1500 });
    expect(exactSummary).toHaveTextContent("Equal-weight assumption across valid deck counts");
    expect(exactSummary).toHaveTextContent("Valid deck scenarios: 7 / 8");
    expect(exactSummary).toHaveTextContent("Included: 2, 3, 4, 5, 6, 7, 8");
    expect(exactSummary).toHaveTextContent("1 deck excluded — Observed card multiplicity is impossible");
    expect(exactSummary).toHaveTextContent("Win42.0%Model range 40.0%–44.0%");

    const exactDisclosure = within(exactSummary).getByText("Show deck scenarios");
    expect(exactDisclosure.parentElement).not.toHaveAttribute("open");
    fireEvent.click(exactDisclosure);
    expect(exactDisclosure.parentElement).toHaveAttribute("open");
    expect(within(exactSummary).getByRole("heading", { name: "8 decks · Exact finite-shoe" })).toBeVisible();
    fireEvent.click(exactDisclosure);
    expect(exactDisclosure.parentElement).not.toHaveAttribute("open");

    const actionSummary = await screen.findByLabelText("STAND action forecast deck-count summary", {}, { timeout: 1500 });
    expect(within(actionSummary).getByLabelText("Stand now uniform deck-count summary")).toHaveTextContent("41.0%");
    expect(within(actionSummary).getByLabelText("Hit once, then stand uniform deck-count summary")).toHaveTextContent("43.0%");
    expect(within(actionSummary).getByLabelText("Double — one card, then stand uniform deck-count summary")).toHaveTextContent("43.0%");
    const surrender = within(actionSummary).getByLabelText("Surrender uniform deck-count summary");
    expect(surrender).toHaveTextContent("Terminal outcomeSurrendered");
    expect(surrender).toHaveTextContent("No probability mean is assigned");
    expect(within(surrender).queryByText(/Win|Push|Loss/)).not.toBeInTheDocument();
    const split = within(actionSummary).getByLabelText("Split uniform deck-count summary");
    expect(within(split).getByRole("heading", { name: "Child Hand 1" })).toBeVisible();
    expect(within(split).getByRole("heading", { name: "Child Hand 2" })).toBeVisible();
    expect(split).not.toHaveTextContent(/overall|combined/i);
    expect(actionSummary).not.toHaveTextContent(/confidence|recommended|best|optimal|ranking/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
    expect(await screen.findAllByText("80.0%", {}, { timeout: 1500 })).toHaveLength(5);
    expect(screen.getAllByText("8/1")).toHaveLength(6);

    oldResolvers[0](exactResponse(.1));
    oldResolvers[1](researchResponse(1));
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(screen.getAllByText("80.0%")).toHaveLength(5);
    expect(screen.queryAllByText("1/1")).toHaveLength(0);
  });
});
