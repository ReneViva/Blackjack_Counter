import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DerivedTableState } from "../../state/selectors";
import CardPicker from "./CardPicker";

function table(overrides: Partial<DerivedTableState> = {}): DerivedTableState {
  return {
    dealerCards: [],
    discardedCards: [],
    playerCards: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
    ...overrides,
  };
}

describe("card assignment panel", () => {
  it("represents all 52 cards with accessible names plus a separate unknown card", () => {
    render(<CardPicker activeTarget={{ kind: "dealer" }} decks={1} table={table()} onKnownCard={vi.fn()} onUnknownCard={vi.fn()} />);

    expect(within(screen.getByLabelText("All 52 cards")).getAllByRole("button")).toHaveLength(52);
    expect(screen.getByRole("button", { name: "Eight of hearts" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ten of diamonds" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ace of clubs" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Assign unknown card" })).toBeEnabled();
  });

  it("never mutates an arbitrary target when no target is active", () => {
    const onKnownCard = vi.fn();
    const onUnknownCard = vi.fn();
    render(<CardPicker activeTarget={null} decks={1} table={table()} onKnownCard={onKnownCard} onUnknownCard={onUnknownCard} />);

    expect(screen.getByRole("button", { name: "Eight of hearts" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Assign unknown card" })).toBeDisabled();
    expect(onKnownCard).not.toHaveBeenCalled();
    expect(onUnknownCard).not.toHaveBeenCalled();
  });

  it("assigns known and unknown observations to the active target", () => {
    const onKnownCard = vi.fn();
    const onUnknownCard = vi.fn();
    const activeTarget = { kind: "player", seat: 4 } as const;
    render(<CardPicker activeTarget={activeTarget} decks={2} table={table()} onKnownCard={onKnownCard} onUnknownCard={onUnknownCard} />);

    fireEvent.click(screen.getByRole("button", { name: "Eight of hearts" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign unknown card" }));

    expect(onKnownCard).toHaveBeenCalledWith(activeTarget, { kind: "known", rank: "8", suit: "hearts" });
    expect(onUnknownCard).toHaveBeenCalledWith(activeTarget);
  });

  it("disables an exhausted physical card while allowing remaining multi-deck copies", () => {
    const used = { kind: "known", rank: "8", suit: "hearts" } as const;
    const { rerender } = render(<CardPicker activeTarget={{ kind: "dealer" }} decks={2} table={table({ dealerCards: [used] })} onKnownCard={vi.fn()} onUnknownCard={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Eight of hearts" })).toBeEnabled();

    rerender(<CardPicker activeTarget={{ kind: "dealer" }} decks={2} table={table({ dealerCards: [used, used] })} onKnownCard={vi.fn()} onUnknownCard={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Eight of hearts, unavailable" })).toBeDisabled();
  });
});
