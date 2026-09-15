import { describe, expect, it } from "vitest";

import {
  BLACKJACK_VALUE_CLASSES,
  isKnownExactPair,
  type CardObservation,
  type ValueOnlyCard,
} from "./card";

describe("card observation domain", () => {
  it("defines exactly the ten blackjack value classes", () => {
    expect(BLACKJACK_VALUE_CLASSES).toEqual([
      "A",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
  });

  it("keeps value-only cards distinct and suitless", () => {
    const valueOnly: ValueOnlyCard = { kind: "value", value: "10" };
    const observations: readonly CardObservation[] = [
      { kind: "known", rank: "K", suit: "hearts" },
      valueOnly,
      { kind: "unknown" },
    ];

    expect(observations.map((observation) => observation.kind)).toEqual([
      "known",
      "value",
      "unknown",
    ]);
    expect(valueOnly).toEqual({ kind: "value", value: "10" });
    expect("rank" in valueOnly).toBe(false);
    expect("suit" in valueOnly).toBe(false);
  });

  it.each([
    [[{ kind: "value", value: "6" }, { kind: "value", value: "6" }], true],
    [[{ kind: "value", value: "A" }, { kind: "value", value: "A" }], true],
    [[{ kind: "known", rank: "6", suit: "spades" }, { kind: "value", value: "6" }], true],
    [[{ kind: "value", value: "6" }, { kind: "value", value: "7" }], false],
    [[{ kind: "value", value: "10" }, { kind: "value", value: "10" }], false],
    [[{ kind: "known", rank: "Q", suit: "spades" }, { kind: "known", rank: "Q", suit: "hearts" }], true],
    [[{ kind: "known", rank: "Q", suit: "spades" }, { kind: "value", value: "10" }], false],
    [[{ kind: "known", rank: "10", suit: "spades" }, { kind: "known", rank: "J", suit: "hearts" }], false],
  ] as const)("derives exact-pair identity without guessing for %o", (cards, expected) => {
    expect(isKnownExactPair(cards)).toBe(expected);
  });
});
