import { describe, expect, it } from "vitest";

import { SEAT_NUMBERS, type SeatNumber } from "../../domain/game";
import {
  calculateBlackjackTableLayout,
  MIN_DESKTOP_TABLE_SIZE,
  type BlackjackTableLayout,
  type TableLayoutRect,
  type TableLayoutSeatInput,
} from "./tableLayout";
import {
  CARD_MIN_READABLE_WIDTH,
  CARD_PREFERRED_GAP,
  minimumReadableCardRowWidth,
  preferredCardRowWidth,
} from "./cardFan";

function seatInput(
  seat: SeatNumber,
  handCount: number,
  occupied = handCount > 0,
): TableLayoutSeatInput {
  return {
    seat,
    occupied,
    hands: Array.from({ length: handCount }, (_, index) => ({
      handId: `seat-${seat}-hand-${index + 1}`,
      cardCount: index + 2,
    })),
  };
}

function layoutFor(
  inputs: readonly TableLayoutSeatInput[],
  width = MIN_DESKTOP_TABLE_SIZE.width,
  height = MIN_DESKTOP_TABLE_SIZE.height,
  mode: "normal" | "pro" = "normal",
): BlackjackTableLayout {
  return calculateBlackjackTableLayout({
    dealerCardCount: 0,
    width,
    height,
    mode,
    seats: inputs,
  });
}

function intersects(left: TableLayoutRect, right: TableLayoutRect): boolean {
  return left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y;
}

function expectInside(rect: TableLayoutRect, bounds: TableLayoutRect): void {
  expect(rect.x).toBeGreaterThanOrEqual(bounds.x - 0.001);
  expect(rect.y).toBeGreaterThanOrEqual(bounds.y - 0.001);
  expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width + 0.001);
  expect(rect.y + rect.height).toBeLessThanOrEqual(bounds.y + bounds.height + 0.001);
}

function expectCollisionFree(layout: BlackjackTableLayout): void {
  const seatLayouts = SEAT_NUMBERS.map((seat) => layout.seats[seat]);
  seatLayouts.forEach((seat) => {
    expectInside(seat.rect, layout.bounds);
    seat.hands.forEach((hand) => {
      expectInside(hand.rect, seat.rect);
      expect(hand.cardVisualWidth).toBeLessThanOrEqual(hand.rect.width);
    });
    for (let left = 0; left < seat.hands.length; left += 1) {
      for (let right = left + 1; right < seat.hands.length; right += 1) {
        const leftRect = seat.hands[left].rect;
        const rightRect = seat.hands[right].rect;
        expect(intersects(leftRect, rightRect)).toBe(false);
        const horizontalGap = Math.max(
          rightRect.x - (leftRect.x + leftRect.width),
          leftRect.x - (rightRect.x + rightRect.width),
        );
        const verticalGap = Math.max(
          rightRect.y - (leftRect.y + leftRect.height),
          leftRect.y - (rightRect.y + rightRect.height),
        );
        expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThanOrEqual(seat.gap - 0.001);
      }
    }
  });

  for (let left = 0; left < seatLayouts.length; left += 1) {
    for (let right = left + 1; right < seatLayouts.length; right += 1) {
      expect(intersects(seatLayouts[left].rect, seatLayouts[right].rect)).toBe(false);
    }
  }
  expect(intersects(layout.seats[1].rect, layout.dealer)).toBe(false);
  expect(intersects(layout.seats[7].rect, layout.dealer)).toBe(false);
}

function expectStableHandOrder(layout: BlackjackTableLayout, seat: SeatNumber): void {
  const hands = layout.seats[seat].hands;
  hands.forEach((hand, index) => {
    expect(hand.handId).toBe(`seat-${seat}-hand-${index + 1}`);
    if (index === 0) return;
    const previous = hands[index - 1].rect;
    const current = hand.rect;
    expect(
      current.y > previous.y ||
      (Math.abs(current.y - previous.y) < 0.001 && current.x > previous.x),
    ).toBe(true);
  });
}

describe("calculateBlackjackTableLayout", () => {
  it("keeps all seven occupied four-hand groups inside the minimum desktop table without collisions", () => {
    const layout = layoutFor(SEAT_NUMBERS.map((seat) => seatInput(seat, 4)));

    expectCollisionFree(layout);
    SEAT_NUMBERS.forEach((seat) => expectStableHandOrder(layout, seat));
  });

  it.each([1, 2, 3, 4])("lays out Seat 4 with %i stable hand(s)", (handCount) => {
    const layout = layoutFor([seatInput(4, handCount)]);

    expect(layout.seats[4].hands).toHaveLength(handCount);
    expectStableHandOrder(layout, 4);
    expectCollisionFree(layout);
  });

  it("separates adjacent multi-hand seats", () => {
    const layout = layoutFor([
      seatInput(3, 4),
      seatInput(4, 4),
      seatInput(5, 3),
    ]);

    expectCollisionFree(layout);
  });

  it("uses the upper side zones for Seats 1 and 7 while respecting the dealer exclusion", () => {
    const layout = layoutFor([seatInput(1, 4), seatInput(7, 4)]);

    expect(layout.seats[1].rect.x + layout.seats[1].rect.width)
      .toBeLessThan(layout.dealer.x);
    expect(layout.seats[7].rect.x)
      .toBeGreaterThan(layout.dealer.x + layout.dealer.width);
    expectCollisionFree(layout);
  });

  it("keeps a mixed populated split table collision-free", () => {
    const layout = layoutFor([
      seatInput(1, 2),
      seatInput(2, 4),
      seatInput(4, 3),
      seatInput(5, 2),
      seatInput(7, 1),
    ], 760, 620);

    expectCollisionFree(layout);
  });

  it("derives deterministic structural layouts from one to two to four hands", () => {
    const layouts = [1, 2, 4].map((count) => layoutFor([seatInput(4, count)]));

    expect(layouts.map((layout) => layout.seats[4].hands.length)).toEqual([1, 2, 4]);
    layouts.forEach((layout) => {
      expect(layout.seats[4].hands[0].handId).toBe("seat-4-hand-1");
      expectCollisionFree(layout);
    });
    expect(layouts[0].seats[4].rect).not.toEqual(layouts[2].seats[4].rect);
  });

  it("removes a player deterministically without moving unrelated anchor groups", () => {
    const populated = SEAT_NUMBERS.map((seat) => seatInput(seat, seat === 4 ? 4 : 1));
    const before = layoutFor(populated);
    const after = layoutFor(populated.map((input) => input.seat === 2
      ? seatInput(2, 0, false)
      : input));

    expect(after.seats[2].occupied).toBe(false);
    expect(after.seats[2].hands).toHaveLength(0);
    expect(after.seats[4]).toEqual(before.seats[4]);
    expectCollisionFree(after);
  });

  it("reflows from the desktop floor to a wider measured table", () => {
    const inputs = SEAT_NUMBERS.map((seat) => seatInput(seat, 4));
    const minimum = layoutFor(inputs);
    const wide = layoutFor(inputs, 920, 680);

    expect(wide.seats[7].rect.x).toBeGreaterThan(minimum.seats[7].rect.x);
    expect(wide.seats[4].columns).toBeGreaterThanOrEqual(minimum.seats[4].columns);
    expectCollisionFree(minimum);
    expectCollisionFree(wide);
  });

  it("preserves seat and hand identity when Pro Mode changes presentation", () => {
    const inputs = [seatInput(2, 2), seatInput(4, 4), seatInput(6, 3)];
    const normal = layoutFor(inputs, 720, 600, "normal");
    const pro = layoutFor(inputs, 720, 600, "pro");

    expect(pro.mode).toBe("pro");
    expect(pro.seats).toEqual(normal.seats);
    SEAT_NUMBERS.forEach((seat) => {
      expect(pro.seats[seat].hands.map((hand) => hand.handId))
        .toEqual(normal.seats[seat].hands.map((hand) => hand.handId));
    });
  });

  it("reserves five complete card widths and positive gaps for a single hand", () => {
    const layout = layoutFor([{
      seat: 4,
      occupied: true,
      hands: [{ handId: "seat-4-hand-1", cardCount: 5 }],
    }]);
    const hand = layout.seats[4].hands[0];

    expect(hand.rect.width).toBeGreaterThanOrEqual(minimumReadableCardRowWidth(5));
    expect(hand.cardWidth).toBeGreaterThanOrEqual(CARD_MIN_READABLE_WIDTH);
    expect(hand.cardGap).toBe(CARD_PREFERRED_GAP);
    expect(hand.cardVisualWidth).toBeGreaterThanOrEqual(minimumReadableCardRowWidth(5));
    expectCollisionFree(layout);
  });

  it("keeps two five-card split rows readable and collision-free at the desktop floor", () => {
    const layout = layoutFor([{
      seat: 4,
      occupied: true,
      hands: [
        { handId: "seat-4-hand-1-1", cardCount: 5 },
        { handId: "seat-4-hand-1-2", cardCount: 5 },
      ],
    }], MIN_DESKTOP_TABLE_SIZE.width, MIN_DESKTOP_TABLE_SIZE.height, "pro");

    expect(layout.seats[4].hands).toHaveLength(2);
    layout.seats[4].hands.forEach((hand) => {
      expect(hand.cardWidth).toBeGreaterThanOrEqual(CARD_MIN_READABLE_WIDTH);
      expect(hand.cardGap).toBe(CARD_PREFERRED_GAP);
      expect(hand.cardVisualWidth).toBeGreaterThanOrEqual(minimumReadableCardRowWidth(5));
    });
    expectCollisionFree(layout);
  });

  it("prefers readable vertical split packing over sub-minimum side-by-side cards", () => {
    const layout = layoutFor([{
      seat: 4,
      occupied: true,
      hands: [
        { handId: "seat-4-hand-1-1", cardCount: 5 },
        { handId: "seat-4-hand-1-2", cardCount: 5 },
      ],
    }], 1036.5625, 560, "normal");

    expect(layout.seats[4].columns).toBe(1);
    layout.seats[4].hands.forEach((hand) => {
      expect(hand.cardWidth).toBeGreaterThanOrEqual(CARD_MIN_READABLE_WIDTH);
      expect(hand.cardGap).toBe(CARD_PREFERRED_GAP);
    });
    expectCollisionFree(layout);
  });

  it("widens the dealer anchor for a non-overlapping five-card row", () => {
    const layout = calculateBlackjackTableLayout({
      dealerCardCount: 5,
      width: MIN_DESKTOP_TABLE_SIZE.width,
      height: MIN_DESKTOP_TABLE_SIZE.height,
      mode: "normal",
      seats: [],
    });

    expect(layout.dealer.width).toBeGreaterThanOrEqual(preferredCardRowWidth(5));
    expectCollisionFree(layout);
  });
});
