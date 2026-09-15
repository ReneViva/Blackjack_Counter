import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ObservedCard } from "../../domain/card";
import type { DerivedPlayerHand } from "../../state/selectors";
import PlayerSeat from "./PlayerSeat";
import { calculateBlackjackTableLayout } from "./tableLayout";
import {
  CARD_MIN_READABLE_WIDTH,
  CARD_PREFERRED_GAP,
} from "./cardFan";

const cards: readonly ObservedCard[] = [
  { kind: "known", rank: "10", suit: "spades" },
  { kind: "known", rank: "8", suit: "hearts" },
  { kind: "known", rank: "3", suit: "clubs" },
  { kind: "value", value: "10" },
  { kind: "unknown" },
];

function renderHand(cardCount: number, workspaceMode: "normal" | "pro" = "normal") {
  const hand: DerivedPlayerHand = {
    handId: "seat-4-hand-stable",
    parentHandId: null,
    splitDepth: 0,
    fromSplitAces: false,
    cards: cards.slice(0, cardCount),
  };
  const layout = calculateBlackjackTableLayout({
    dealerCardCount: 0,
    width: 544,
    height: 560,
    mode: workspaceMode,
    seats: [{
      seat: 4,
      occupied: true,
      hands: [{ handId: hand.handId, cardCount }],
    }],
  });
  render(
    <PlayerSeat
      activeHandId={hand.handId}
      hands={[hand]}
      isOccupied
      isUser
      layout={layout.seats[4]}
      onAdd={vi.fn()}
      onSelect={vi.fn()}
      seat={4}
      workspaceMode={workspaceMode}
    />,
  );
  return screen.getByRole("button", {
    name: /Seat 4, occupied, primary hand, active target, Hand 1/,
  });
}

describe("intra-hand card row", () => {
  it.each([1, 2, 3, 5])("preserves order, stacking, and active metadata for %i card(s)", (cardCount) => {
    const hand = renderHand(cardCount);
    const renderedCards = within(hand).getAllByRole("img");

    expect(renderedCards.map((card) => card.getAttribute("data-stack-index")))
      .toEqual(Array.from({ length: cardCount }, (_, index) => String(index)));
    expect(renderedCards.map((card) => card.style.zIndex))
      .toEqual(Array.from({ length: cardCount }, (_, index) => String(index + 1)));
    const cardRow = within(hand).getByLabelText("Seat 4 observed cards");
    expect(Number(cardRow.getAttribute("data-card-gap")))
      .toBe(cardCount === 1 ? 0 : CARD_PREFERRED_GAP);
    expect(Number(cardRow.getAttribute("data-card-width")))
      .toBeGreaterThanOrEqual(CARD_MIN_READABLE_WIDTH);
    expect(Number(cardRow.getAttribute("data-fan-width")))
      .toBeGreaterThanOrEqual(34);
    expect(within(hand).getByText("Hand 1")).toBeVisible();
    expect(within(hand).getByText("Active")).toBeVisible();
  });

  it("keeps exact, value-only, and Unknown semantics in the Pro fan", () => {
    const hand = renderHand(5, "pro");

    expect(within(hand).getByRole("img", {
      name: "10 value card (exact Ten of spades)",
    })).toBeVisible();
    expect(within(hand).getByRole("img", {
      name: "10 value card",
    })).toBeVisible();
    expect(within(hand).getByRole("img", {
      name: "Unknown card",
    })).toBeVisible();
    expect(within(hand).getAllByText(/^(8|3|10|\?)$/)).toHaveLength(5);
  });

  it("keeps Normal exact ranks, suits, generic ten, and Unknown in source order", () => {
    const hand = renderHand(5, "normal");

    expect(within(hand).getAllByRole("img").map((card) => card.getAttribute("aria-label")))
      .toEqual([
        "Ten of spades",
        "Eight of hearts",
        "Three of clubs",
        "10 value card",
        "Unknown card",
      ]);
  });
});
