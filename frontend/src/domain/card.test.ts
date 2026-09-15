import { describe, expect, it } from "vitest";

import {
  BLACKJACK_VALUE_CLASSES,
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
});
