import { describe, expect, it } from "vitest";

import { splitChildHandIds } from "../../domain/hands";
import { gameReducer, type SessionState } from "../../state/gameReducer";
import { createInitialState } from "../../state/initialState";
import { selectTableState, type DerivedPlayerHand, type DerivedTableState } from "../../state/selectors";
import {
  deriveAssignmentTargets,
  navigateAssignmentTarget,
} from "./assignmentNavigation";

function hand(handId: string): DerivedPlayerHand {
  return {
    handId,
    parentHandId: null,
    splitDepth: 0,
    fromSplitAces: false,
    cards: [],
  };
}

function table(
  playerHands: Partial<DerivedTableState["playerHands"]> = {},
): DerivedTableState {
  return {
    dealerCards: [],
    discardedCards: [],
    playerHands: {
      1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [],
      ...playerHands,
    },
  };
}

function target(seat: 1 | 2 | 3 | 4 | 5 | 6 | 7, handId = `seat-${seat}-hand-1`) {
  return { kind: "player-hand" as const, seat, handId };
}

function split(state: SessionState, handId: string): SessionState {
  const source = selectTableState(state).playerHands[4].find(
    (candidate) => candidate.handId === handId,
  );
  if (!source) throw new Error("Missing split fixture hand");
  const [leftHandId, rightHandId] = splitChildHandIds(handId);
  return gameReducer(state, {
    type: "SPLIT_PLAYER_HAND",
    seat: 4,
    handId,
    leftHandId,
    rightHandId,
    splitDepth: source.splitDepth + 1,
    fromSplitAces: false,
  });
}

describe("derived assignment navigation", () => {
  it("uses authored seat order, skips gaps, preserves hand order, and ends at Dealer", () => {
    const current = table({
      1: [hand("seat-1-hand-1")],
      3: [hand("seat-3-hand-1-1"), hand("seat-3-hand-1-2")],
      7: [hand("seat-7-hand-1")],
    });

    expect(deriveAssignmentTargets(current)).toEqual([
      target(1),
      target(3, "seat-3-hand-1-1"),
      target(3, "seat-3-hand-1-2"),
      target(7),
      { kind: "dealer" },
    ]);
    expect(navigateAssignmentTarget(current, target(1), "next"))
      .toEqual(target(3, "seat-3-hand-1-1"));
    expect(navigateAssignmentTarget(current, target(3, "seat-3-hand-1-1"), "previous"))
      .toEqual(target(1));
    expect(navigateAssignmentTarget(current, target(7), "next"))
      .toEqual({ kind: "dealer" });
  });

  it("does not wrap and never navigates from a nonexistent hand", () => {
    const current = table({ 2: [hand("seat-2-hand-1")] });

    expect(navigateAssignmentTarget(current, target(2), "previous")).toEqual(target(2));
    expect(navigateAssignmentTarget(current, { kind: "dealer" }, "next"))
      .toEqual({ kind: "dealer" });
    expect(navigateAssignmentTarget(current, target(2, "missing"), "next")).toBeNull();
    expect(navigateAssignmentTarget(current, null, "previous")).toBeNull();
  });

  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [6, 3],
  ] as const)("Down chooses candidate %s of %s using the lower middle", (count, expectedSeat) => {
    const hands = Object.fromEntries(
      Array.from({ length: count }, (_, index) => {
        const seat = index + 1 as 1 | 2 | 3 | 4 | 5 | 6;
        return [seat, [hand(`seat-${seat}-hand-1`)]];
      }),
    );

    expect(navigateAssignmentTarget(table(hands), { kind: "dealer" }, "middle-player"))
      .toEqual(target(expectedSeat));
  });

  it("Down ignores empty/departed seats and chooses the first valid hand of the middle seat", () => {
    const current = table({
      1: [hand("seat-1-hand-1")],
      3: [hand("seat-3-hand-1-1"), hand("seat-3-hand-1-2")],
      5: [hand("seat-5-hand-1")],
    });

    expect(navigateAssignmentTarget(current, { kind: "dealer" }, "middle-player"))
      .toEqual(target(3, "seat-3-hand-1-1"));
    expect(navigateAssignmentTarget(table(), { kind: "dealer" }, "middle-player"))
      .toBeNull();
  });

  it("re-derives additions, departures, split/resplit order, and round replacement", () => {
    let state = gameReducer(createInitialState(), { type: "ADD_PLAYER", seat: 4 });
    state = gameReducer(state, { type: "ADD_PLAYER", seat: 7 });
    expect(deriveAssignmentTargets(selectTableState(state))).toEqual([
      target(4), target(7), { kind: "dealer" },
    ]);

    state = gameReducer(state, { type: "LEAVE_PLAYER", seat: 7 });
    for (const suit of ["hearts", "clubs"] as const) {
      state = gameReducer(state, {
        type: "DEAL_KNOWN_CARD",
        target: target(4),
        card: { kind: "known", rank: "8", suit },
      });
    }
    state = split(state, "seat-4-hand-1");
    state = gameReducer(state, {
      type: "DEAL_KNOWN_CARD",
      target: target(4, "seat-4-hand-1-1"),
      card: { kind: "known", rank: "8", suit: "spades" },
    });
    state = split(state, "seat-4-hand-1-1");
    state = gameReducer(state, {
      type: "DEAL_KNOWN_CARD",
      target: target(4, "seat-4-hand-1-2"),
      card: { kind: "known", rank: "8", suit: "diamonds" },
    });
    state = split(state, "seat-4-hand-1-2");

    expect(deriveAssignmentTargets(selectTableState(state))).toEqual([
      target(4, "seat-4-hand-1-1-1"),
      target(4, "seat-4-hand-1-1-2"),
      target(4, "seat-4-hand-1-2-1"),
      target(4, "seat-4-hand-1-2-2"),
      { kind: "dealer" },
    ]);

    state = gameReducer(state, { type: "ROUND_COMPLETE" });
    expect(deriveAssignmentTargets(selectTableState(state))).toEqual([
      target(4),
      { kind: "dealer" },
    ]);
  });

  it("ArrowUp always resolves to Dealer", () => {
    const current = table({
      4: [hand("ordinary"), hand("split"), hand("resplit")],
    });
    for (const active of [
      target(4, "ordinary"),
      target(4, "split"),
      target(4, "resplit"),
      { kind: "dealer" as const },
    ]) {
      expect(navigateAssignmentTarget(current, active, "dealer"))
        .toEqual({ kind: "dealer" });
    }
  });
});
