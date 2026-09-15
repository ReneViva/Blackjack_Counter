import { describe, expect, it } from "vitest";

import { toTableStatePayload } from "../api/tableState";
import type { KnownCard } from "../domain/card";
import { splitChildHandIds } from "../domain/hands";
import { gameReducer, type SessionState } from "./gameReducer";
import { createInitialState } from "./initialState";
import {
  selectObservedCardCount,
  selectTableState,
  selectUnknownCardCount,
} from "./selectors";

const eightHearts: KnownCard = { kind: "known", rank: "8", suit: "hearts" };
const eightClubs: KnownCard = { kind: "known", rank: "8", suit: "clubs" };
const eightSpades: KnownCard = { kind: "known", rank: "8", suit: "spades" };

function dealTo(
  state: SessionState,
  handId: string,
  card: KnownCard,
): SessionState {
  return gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "player-hand", seat: 4, handId },
    card,
  });
}

function pairedSeat(): SessionState {
  let state = gameReducer(createInitialState(), { type: "ADD_PLAYER", seat: 4 });
  state = dealTo(state, "seat-4-hand-1", eightHearts);
  return dealTo(state, "seat-4-hand-1", eightClubs);
}

function split(
  state: SessionState,
  handId = "seat-4-hand-1",
): SessionState {
  const hand = selectTableState(state).playerHands[4].find(
    (candidate) => candidate.handId === handId,
  );
  if (!hand) throw new Error("missing split test hand");
  const [leftHandId, rightHandId] = splitChildHandIds(handId);
  return gameReducer(state, {
    type: "SPLIT_PLAYER_HAND",
    seat: 4,
    handId,
    leftHandId,
    rightHandId,
    splitDepth: hand.splitDepth + 1,
    fromSplitAces: hand.fromSplitAces || hand.cards[0]?.kind === "known" &&
      hand.cards[0].rank === "A",
  });
}

describe("multi-hand session chronology", () => {
  it("partitions a pair without adding, losing, or returning a physical card", () => {
    const original = pairedSeat();
    const next = split(original);
    const hands = selectTableState(next).playerHands[4];

    expect(hands).toEqual([
      {
        handId: "seat-4-hand-1-1",
        parentHandId: "seat-4-hand-1",
        splitDepth: 1,
        fromSplitAces: false,
        cards: [eightHearts],
      },
      {
        handId: "seat-4-hand-1-2",
        parentHandId: "seat-4-hand-1",
        splitDepth: 1,
        fromSplitAces: false,
        cards: [eightClubs],
      },
    ]);
    expect(selectObservedCardCount(next)).toBe(2);
    expect(next.events.at(-1)?.type).toBe("PLAYER_HAND_SPLIT");
  });

  it("targets replacement observations to one exact hand and supports resplit lineage", () => {
    let state = split(pairedSeat());
    state = dealTo(state, "seat-4-hand-1-1", eightSpades);
    state = gameReducer(state, {
      type: "DEAL_UNKNOWN_CARD",
      target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" },
    });

    let hands = selectTableState(state).playerHands[4];
    expect(hands[0].cards).toEqual([eightHearts, eightSpades]);
    expect(hands[1].cards).toEqual([eightClubs, { kind: "unknown" }]);
    expect(selectObservedCardCount(state)).toBe(4);
    expect(selectUnknownCardCount(state)).toBe(1);

    state = split(state, "seat-4-hand-1-1");
    hands = selectTableState(state).playerHands[4];
    expect(hands.map((hand) => hand.handId)).toEqual([
      "seat-4-hand-1-1-1",
      "seat-4-hand-1-1-2",
      "seat-4-hand-1-2",
    ]);
    expect(hands.slice(0, 2).map((hand) => hand.parentHandId)).toEqual([
      "seat-4-hand-1-1",
      "seat-4-hand-1-1",
    ]);
    expect(hands.slice(0, 2).map((hand) => hand.splitDepth)).toEqual([2, 2]);
    expect(selectObservedCardCount(state)).toBe(4);
  });

  it("targets and undoes a value-only observation on one split child", () => {
    const splitState = split(pairedSeat());
    const withValue = gameReducer(splitState, {
      type: "DEAL_VALUE_CARD",
      target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" },
      card: { kind: "value", value: "10" },
    });

    expect(selectTableState(withValue).playerHands[4]).toEqual([
      expect.objectContaining({
        handId: "seat-4-hand-1-1",
        parentHandId: "seat-4-hand-1",
        cards: [eightHearts],
      }),
      expect.objectContaining({
        handId: "seat-4-hand-1-2",
        parentHandId: "seat-4-hand-1",
        cards: [eightClubs, { kind: "value", value: "10" }],
      }),
    ]);

    const undoneCard = gameReducer(withValue, { type: "UNDO" });
    expect(undoneCard).toEqual(splitState);
    expect(undoneCard.events.at(-1)?.type).toBe("PLAYER_HAND_SPLIT");
    expect(gameReducer(undoneCard, { type: "UNDO" })).toEqual(pairedSeat());
  });

  it("serializes every hand with exact composition and one explicit analysis hand", () => {
    const state = split(pairedSeat());
    const withoutTarget = toTableStatePayload(state);
    const selected = toTableStatePayload(state, {
      kind: "player-hand",
      seat: 4,
      handId: "seat-4-hand-1-2",
    });

    expect(withoutTarget.players.map((hand) => hand.is_user)).toEqual([false, false]);
    expect(selected.players).toEqual([
      {
        seat: 4,
        is_user: false,
        hand_id: "seat-4-hand-1-1",
        parent_hand_id: "seat-4-hand-1",
        split_depth: 1,
        from_split_aces: false,
        status: "active",
        cards: [{ kind: "known", rank: "8", suit: "H" }],
      },
      {
        seat: 4,
        is_user: true,
        hand_id: "seat-4-hand-1-2",
        parent_hand_id: "seat-4-hand-1",
        split_depth: 1,
        from_split_aces: false,
        status: "active",
        cards: [{ kind: "known", rank: "8", suit: "C" }],
      },
    ]);
  });

  it("moves every departed-hand observation to discard and permits an empty rejoin", () => {
    let state = split(pairedSeat());
    state = dealTo(state, "seat-4-hand-1-1", eightSpades);
    state = gameReducer(state, {
      type: "DEAL_UNKNOWN_CARD",
      target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" },
    });
    state = gameReducer(state, { type: "LEAVE_PLAYER", seat: 4 });

    let table = selectTableState(state);
    expect(state.configuration.activeSeats).toEqual([]);
    expect(state.configuration.userSeat).toBeNull();
    expect(table.playerHands[4]).toEqual([]);
    expect(table.discardedCards).toEqual([
      eightHearts,
      eightSpades,
      eightClubs,
      { kind: "unknown" },
    ]);
    expect(selectObservedCardCount(state)).toBe(4);

    state = gameReducer(state, { type: "ADD_PLAYER", seat: 4 });
    table = selectTableState(state);
    expect(table.playerHands[4]).toEqual([{
      handId: "seat-4-hand-1",
      parentHandId: null,
      splitDepth: 0,
      fromSplitAces: false,
      cards: [],
    }]);
    expect(table.discardedCards).toHaveLength(4);
    expect(state.configuration.userSeat).toBeNull();
  });

  it("undoes leave and split with exact deterministic structure and counts", () => {
    const original = pairedSeat();
    const splitState = split(original);
    const departed = gameReducer(splitState, { type: "LEAVE_PLAYER", seat: 4 });

    const restoredSplit = gameReducer(departed, { type: "UNDO" });
    expect(restoredSplit).toEqual(splitState);
    expect(selectObservedCardCount(restoredSplit)).toBe(2);

    const restoredOriginal = gameReducer(restoredSplit, { type: "UNDO" });
    expect(restoredOriginal).toEqual(original);
    expect(selectTableState(restoredOriginal).playerHands[4][0].cards).toEqual([
      eightHearts,
      eightClubs,
    ]);
    expect(selectObservedCardCount(restoredOriginal)).toBe(2);
  });

  it("rejects structurally forged split chronology without appending an event", () => {
    const original = pairedSeat();
    const forged = gameReducer(original, {
      type: "SPLIT_PLAYER_HAND",
      seat: 4,
      handId: "seat-4-hand-1",
      leftHandId: "random-left",
      rightHandId: "random-right",
      splitDepth: 99,
      fromSplitAces: true,
    });

    expect(forged).toBe(original);
  });
});
