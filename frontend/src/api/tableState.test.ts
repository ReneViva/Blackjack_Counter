import { describe, expect, it } from "vitest";

import type { SessionConfiguration } from "../domain/game";
import { gameReducer } from "../state/gameReducer";
import { createInitialState } from "../state/initialState";
import { toTableStatePayload } from "./tableState";

const configuration: SessionConfiguration = {
  rules: { decks: 2, dealerSoft17: "hit" },
  activeSeats: [1, 3],
  userSeat: 3,
};

describe("table-state transport contract", () => {
  it("serializes an event-derived table snapshot for Python reconstruction", () => {
    let state = gameReducer(createInitialState(configuration), {
      type: "NEW_SHOE",
    });
    state = gameReducer(state, {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "dealer" },
      card: { kind: "known", rank: "K", suit: "hearts" },
    });
    state = gameReducer(state, {
      type: "DEAL_UNKNOWN_CARD",
      target: { kind: "dealer" },
    });
    state = gameReducer(state, {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "player", seat: 3 },
      card: { kind: "known", rank: "A", suit: "spades" },
    });

    expect(toTableStatePayload(state)).toEqual({
      rules: { decks: 2, dealer_soft_17: "hit" },
      dealer: {
        cards: [
          { kind: "known", rank: "K", suit: "H" },
          { kind: "unknown" },
        ],
      },
      players: [
        { seat: 1, is_user: false, cards: [] },
        {
          seat: 3,
          is_user: true,
          cards: [{ kind: "known", rank: "A", suit: "S" }],
        },
      ],
      discarded_cards: [],
    });
  });

  it("preserves unknown deck count without a fallback", () => {
    expect(toTableStatePayload(createInitialState()).rules.decks).toBeNull();
  });

  it("serializes completed-round cards as discards", () => {
    let state = gameReducer(createInitialState(configuration), {
      type: "NEW_SHOE",
    });
    state = gameReducer(state, {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "dealer" },
      card: { kind: "known", rank: "7", suit: "clubs" },
    });
    state = gameReducer(state, { type: "ROUND_COMPLETE" });

    expect(toTableStatePayload(state).discarded_cards).toEqual([
      { kind: "known", rank: "7", suit: "C" },
    ]);
  });
});
