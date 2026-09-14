import { afterEach, describe, expect, it, vi } from "vitest";

import { gameReducer } from "../state/gameReducer";
import { createInitialState, DEFAULT_CONFIGURATION } from "../state/initialState";
import { analyzeActionForecast } from "./analysis";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("exact action forecast API", () => {
  it("sends an explicit hand identity and marks only that split hand for analysis", async () => {
    let state = gameReducer(createInitialState({
      ...DEFAULT_CONFIGURATION,
      rules: { ...DEFAULT_CONFIGURATION.rules, decks: 1 },
    }), { type: "ADD_PLAYER", seat: 4 });
    state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "8", suit: "hearts" } });
    state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "8", suit: "spades" } });
    state = gameReducer(state, { type: "SPLIT_PLAYER_HAND", seat: 4, handId: "seat-4-hand-1", leftHandId: "seat-4-hand-1-1", rightHandId: "seat-4-hand-1-2", splitDepth: 1, fromSplitAces: false });
    const target = { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" } as const;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        method: "exact_action_forecast",
        target: { seat: 4, hand_id: target.handId },
        action_forecasts: {
          stand_now: { contract: "stand_now", status: "unavailable", method: "exact", outcomes: null, metadata: null, error: { code: "terminal_hand", message: "Unavailable.", field: null } },
          hit_once_then_stand: { contract: "hit_once_then_stand", status: "unavailable", method: "exact", outcomes: null, metadata: null, error: { code: "terminal_hand", message: "Unavailable.", field: null } },
        },
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await analyzeActionForecast(state, target);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.options).toEqual({
      method: "exact_action_forecast",
      target: { seat: 4, hand_id: "seat-4-hand-1-2" },
    });
    expect(body.state.players.filter((hand: { is_user: boolean }) => hand.is_user)).toHaveLength(1);
    expect(body.state.players.find((hand: { is_user: boolean }) => hand.is_user).hand_id).toBe("seat-4-hand-1-2");
  });
});
