import { describe, expect, it } from "vitest";

import type { SessionConfiguration } from "../domain/game";
import { gameReducer } from "../state/gameReducer";
import { createInitialState, DEFAULT_RULES } from "../state/initialState";
import { toTableStatePayload } from "./tableState";

const configuration: SessionConfiguration = {
  rules: { ...DEFAULT_RULES, decks: 2, dealerSoft17: "hit" },
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
      rules: {
        decks: 2,
        dealer_soft_17: "hit",
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
      dealer: {
        cards: [
          { kind: "known", rank: "K", suit: "H" },
          { kind: "unknown" },
        ],
      },
      players: [
        {
          seat: 1,
          is_user: false,
          hand_id: "seat-1-hand-1",
          parent_hand_id: null,
          split_depth: 0,
          from_split_aces: false,
          cards: [],
        },
        {
          seat: 3,
          is_user: true,
          hand_id: "seat-3-hand-1",
          parent_hand_id: null,
          split_depth: 0,
          from_split_aces: false,
          cards: [{ kind: "known", rank: "A", suit: "S" }],
        },
      ],
      discarded_cards: [],
    });
  });

  it("preserves unknown deck count without a fallback", () => {
    expect(toTableStatePayload(createInitialState({
      ...configuration,
      rules: { ...configuration.rules, decks: null },
    })).rules.decks).toBeNull();
  });

  it("serializes every configurable gameplay rule", () => {
    const state = createInitialState({
      ...configuration,
      rules: {
        decks: 8,
        dealerSoft17: "stand",
        splittingEnabled: false,
        maxSplitHands: 1,
        resplitAces: true,
        hitSplitAces: true,
        blackjackAfterSplit: true,
        doublingEnabled: false,
        doubleAfterSplit: false,
        surrender: "late",
        dealerSecondCard: "no_hole_card",
        dealerBlackjackCheck: "no_peek",
      },
    });

    expect(toTableStatePayload(state).rules).toEqual({
      decks: 8,
      dealer_soft_17: "stand",
      splitting_enabled: false,
      max_split_hands: 1,
      resplit_aces: true,
      hit_split_aces: true,
      blackjack_after_split: true,
      doubling_enabled: false,
      double_after_split: false,
      surrender: "late",
      dealer_second_card: "no_hole_card",
      dealer_blackjack_check: "no_peek",
    });
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
