import { describe, expect, it } from "vitest";

import type { SessionConfiguration } from "../domain/game";
import { gameReducer } from "./gameReducer";
import { createInitialState, DEFAULT_RULES } from "./initialState";
import {
  selectObservedCardCount,
  selectTableState,
  selectUnknownCardCount,
} from "./selectors";

const configuredSession: SessionConfiguration = {
  rules: { ...DEFAULT_RULES, decks: 6, dealerSoft17: "stand" },
  activeSeats: [1, 2, 3],
  userSeat: 2,
};

function startSession() {
  return gameReducer(createInitialState(configuredSession), {
    type: "NEW_SHOE",
  });
}

describe("frontend session and event model", () => {
  it("starts with an explicit unknown deck count", () => {
    const state = createInitialState();

    expect(state.configuration.rules.decks).toBeNull();
    expect(state.events).toEqual([]);
  });

  it("records deterministic chronological event identities", () => {
    const started = startSession();
    const dealt = gameReducer(started, {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "player", seat: 2 },
      card: { kind: "known", rank: "A", suit: "spades" },
    });

    expect(dealt.events.map(({ id, sequence, type }) => ({ id, sequence, type })))
      .toEqual([
        { id: "evt_0001", sequence: 1, type: "NEW_SHOE" },
        { id: "evt_0002", sequence: 2, type: "DEAL_KNOWN_CARD" },
      ]);
  });

  it("derives known and unknown observations for their targets", () => {
    let state = startSession();
    state = gameReducer(state, {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "player", seat: 2 },
      card: { kind: "known", rank: "K", suit: "hearts" },
    });
    state = gameReducer(state, {
      type: "DEAL_UNKNOWN_CARD",
      target: { kind: "dealer" },
    });

    const table = selectTableState(state);
    expect(table.playerCards[2]).toEqual([
      { kind: "known", rank: "K", suit: "hearts" },
    ]);
    expect(table.dealerCards).toEqual([{ kind: "unknown" }]);
    expect(selectObservedCardCount(state)).toBe(2);
    expect(selectUnknownCardCount(state)).toBe(1);
  });

  it("undoes the latest recorded event deterministically", () => {
    const withCard = gameReducer(startSession(), {
      type: "DEAL_UNKNOWN_CARD",
      target: { kind: "dealer" },
    });
    const undone = gameReducer(withCard, { type: "UNDO" });

    expect(undone.events).toHaveLength(1);
    expect(selectTableState(undone).dealerCards).toEqual([]);
  });

  it("resets session configuration and history", () => {
    const reset = gameReducer(startSession(), { type: "RESET" });

    expect(reset).toEqual(createInitialState());
  });

  it("locks configuration after chronology begins", () => {
    const started = startSession();
    const attempted = gameReducer(started, {
      type: "CONFIGURE_SESSION",
      configuration: {
        ...configuredSession,
        rules: { ...configuredSession.rules, decks: 8 },
      },
    });

    expect(attempted).toBe(started);
  });

  it("clears visible cards when a shuffle event is recorded", () => {
    const withCard = gameReducer(startSession(), {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "dealer" },
      card: { kind: "known", rank: "10", suit: "clubs" },
    });
    const shuffled = gameReducer(withCard, { type: "SHUFFLE" });

    expect(selectTableState(shuffled).dealerCards).toEqual([]);
    expect(shuffled.events.at(-1)?.type).toBe("SHUFFLE");
  });

  it("moves completed-round observations into the discard history", () => {
    let state = gameReducer(startSession(), {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "player", seat: 2 },
      card: { kind: "known", rank: "Q", suit: "diamonds" },
    });
    state = gameReducer(state, {
      type: "DEAL_UNKNOWN_CARD",
      target: { kind: "dealer" },
    });
    state = gameReducer(state, { type: "ROUND_COMPLETE" });

    const table = selectTableState(state);
    expect(table.dealerCards).toEqual([]);
    expect(table.playerCards[2]).toEqual([]);
    expect(table.discardedCards).toEqual([
      { kind: "unknown" },
      { kind: "known", rank: "Q", suit: "diamonds" },
    ]);
    expect(selectObservedCardCount(state)).toBe(2);
    expect(selectUnknownCardCount(state)).toBe(1);
  });
});
