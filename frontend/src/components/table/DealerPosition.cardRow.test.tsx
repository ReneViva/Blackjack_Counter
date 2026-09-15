import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ObservedCard } from "../../domain/card";
import DealerPosition from "./DealerPosition";
import {
  CARD_MIN_READABLE_WIDTH,
  CARD_PREFERRED_GAP,
  preferredCardRowWidth,
} from "./cardFan";

const cards: readonly ObservedCard[] = [
  { kind: "known", rank: "4", suit: "spades" },
  { kind: "known", rank: "A", suit: "hearts" },
  { kind: "known", rank: "2", suit: "diamonds" },
  { kind: "value", value: "10" },
  { kind: "unknown" },
];

describe("dealer card row", () => {
  it("uses the same non-overlapping readable primitive for five cards", () => {
    render(
      <DealerPosition
        active={false}
        cards={cards}
        layout={{ x: 0, y: 0, width: preferredCardRowWidth(5), height: 148 }}
        onSelect={vi.fn()}
        workspaceMode="normal"
      />,
    );

    const row = screen.getByLabelText("Dealer observed cards");
    expect(Number(row.getAttribute("data-card-gap"))).toBe(CARD_PREFERRED_GAP);
    expect(Number(row.getAttribute("data-card-width")))
      .toBeGreaterThanOrEqual(CARD_MIN_READABLE_WIDTH);
    expect(within(row).getAllByRole("img")).toHaveLength(5);
    expect(row).toHaveStyle({
      "--dealer-card-gap": `${CARD_PREFERRED_GAP}px`,
      "--dealer-card-width": "38px",
    });
  });
});
