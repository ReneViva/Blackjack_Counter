import { describe, expect, it } from "vitest";

import {
  CARD_MIN_READABLE_WIDTH,
  CARD_PREFERRED_GAP,
  CARD_PREFERRED_WIDTH,
  calculateCardFan,
  minimumReadableCardRowWidth,
  preferredCardRowWidth,
} from "./cardFan";

describe("calculateCardFan", () => {
  it.each([1, 2, 3, 4, 5])("lays out %i readable card(s) without overlap", (cardCount) => {
    const availableWidth = preferredCardRowWidth(cardCount);
    const fan = calculateCardFan({
      availableHeight: 52,
      availableWidth,
      cardCount,
    });

    expect(fan.visualWidth).toBeLessThanOrEqual(availableWidth);
    expect(fan.cardWidth).toBeGreaterThanOrEqual(CARD_MIN_READABLE_WIDTH);
    expect(fan.cardGap).toBe(cardCount === 1 ? 0 : CARD_PREFERRED_GAP);
    expect(fan.cardStep).toBe(cardCount === 1
      ? 0
      : fan.cardWidth + CARD_PREFERRED_GAP);
    expect(fan.readable).toBe(true);
  });

  it("never reintroduces overlap when a dense five-card cell is too narrow", () => {
    const fan = calculateCardFan({
      availableHeight: 52,
      availableWidth: 58,
      cardCount: 5,
    });

    expect(fan.cardWidth).toBeCloseTo(9.2);
    expect(fan.cardGap).toBe(CARD_PREFERRED_GAP);
    expect(fan.cardStep).toBeGreaterThanOrEqual(fan.cardWidth);
    expect(fan.visualWidth).toBeCloseTo(58);
    expect(fan.readable).toBe(false);
  });

  it("calculates the five-card footprint from five complete cards plus positive gaps", () => {
    expect(preferredCardRowWidth(5)).toBe(
      CARD_PREFERRED_WIDTH * 5 + CARD_PREFERRED_GAP * 4
    );
    expect(minimumReadableCardRowWidth(5)).toBe(
      CARD_MIN_READABLE_WIDTH * 5 + CARD_PREFERRED_GAP * 4
    );
  });
});
