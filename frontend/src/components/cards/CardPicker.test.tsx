import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DerivedTableState } from "../../state/selectors";
import CardPicker from "./CardPicker";

function table(overrides: Partial<DerivedTableState> = {}): DerivedTableState {
  return {
    dealerCards: [],
    discardedCards: [],
    playerHands: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
    ...overrides,
  };
}

function pickerProps(
  overrides: Partial<ComponentProps<typeof CardPicker>> = {},
): ComponentProps<typeof CardPicker> {
  return {
    activeTarget: { kind: "dealer" },
    decks: 1,
    table: table(),
    workspaceMode: "normal",
    onKnownCard: vi.fn(),
    onNavigateTarget: vi.fn(),
    onUnknownCard: vi.fn(),
    onValueCard: vi.fn(),
    onWorkspaceModeChange: vi.fn(),
    ...overrides,
  };
}

describe("card assignment panel", () => {
  it("starts in protected Normal Mode with all 52 exact cards and Unknown", () => {
    render(<CardPicker {...pickerProps()} />);

    expect(screen.getByRole("switch", { name: "Pro Mode" })).not.toBeChecked();
    expect(within(screen.getByLabelText("All 52 cards")).getAllByRole("button"))
      .toHaveLength(52);
    expect(screen.getByRole("button", { name: "Eight of hearts" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ten of diamonds" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ace of clubs" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Assign unknown card" })).toBeEnabled();
  });

  it("changes only workspace mode through the accessible toggle", () => {
    const onWorkspaceModeChange = vi.fn();
    const { rerender } = render(<CardPicker {...pickerProps({ onWorkspaceModeChange })} />);

    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    expect(onWorkspaceModeChange).toHaveBeenCalledWith("pro");

    rerender(<CardPicker {...pickerProps({
      workspaceMode: "pro",
      onWorkspaceModeChange,
    })} />);
    expect(screen.getByRole("switch", { name: "Pro Mode" })).toBeChecked();
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    expect(onWorkspaceModeChange).toHaveBeenLastCalledWith("normal");
  });

  it("shows exactly the compact A through 10 picker without suits or face buttons", () => {
    render(<CardPicker {...pickerProps({ workspaceMode: "pro" })} />);

    const values = within(screen.getByLabelText("Card values"));
    expect(values.getAllByRole("button")).toHaveLength(10);
    expect(values.getByRole("button", { name: "Ace, 4 remaining" })).toBeEnabled();
    expect(values.getByRole("button", { name: /Ten-valued card, 16 remaining/ })).toBeEnabled();
    expect(values.getByRole("button", {
      name: /Ten-valued card, 16 remaining; represents ten, jack, queen, or king/,
    })).toBeEnabled();
    expect(screen.queryByLabelText("All 52 cards")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Jack/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Queen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^King/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign unknown card" })).not.toBeInTheDocument();
    expect(screen.getByText("10 = 10/J/Q/K")).toBeVisible();
    expect(screen.getByText(/Pro Mode uses card values only/)).toHaveTextContent(
      /Pro Mode uses card values only\.Exact probabilities and counting systems remain unchanged\./,
    );
    expect(screen.getByLabelText("Keyboard shortcuts")).toHaveTextContent("1= A");
    expect(screen.getByLabelText("Keyboard shortcuts")).toHaveTextContent("2–9= 2–9");
    expect(screen.getByLabelText("Keyboard shortcuts")).toHaveTextContent("0= 10 (10/J/Q/K)");
    expect(screen.getByLabelText("Keyboard shortcuts")).toHaveTextContent(
      "← / →Move between occupied player/split-hand targets",
    );
    expect(screen.getByLabelText("Keyboard shortcuts")).toHaveTextContent("↑Dealer");
    expect(screen.getByLabelText("Keyboard shortcuts")).toHaveTextContent(
      "↓Middle-lower occupied player",
    );
  });

  it("never mutates an arbitrary target when no target is active", () => {
    const onKnownCard = vi.fn();
    const onUnknownCard = vi.fn();
    const onValueCard = vi.fn();
    const { rerender } = render(<CardPicker {...pickerProps({
      activeTarget: null,
      onKnownCard,
      onUnknownCard,
      onValueCard,
    })} />);

    expect(screen.getByRole("button", { name: "Eight of hearts" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Assign unknown card" })).toBeDisabled();
    rerender(<CardPicker {...pickerProps({
      activeTarget: null,
      workspaceMode: "pro",
      onKnownCard,
      onUnknownCard,
      onValueCard,
    })} />);
    fireEvent.click(screen.getByRole("button", { name: "Ace, 4 remaining" }));
    expect(onKnownCard).not.toHaveBeenCalled();
    expect(onUnknownCard).not.toHaveBeenCalled();
    expect(onValueCard).not.toHaveBeenCalled();
  });

  it("assigns known and unknown observations to the active target", () => {
    const onKnownCard = vi.fn();
    const onUnknownCard = vi.fn();
    const activeTarget = { kind: "player-hand", seat: 4, handId: "seat-4-hand-1" } as const;
    render(<CardPicker {...pickerProps({
      activeTarget,
      decks: 2,
      onKnownCard,
      onUnknownCard,
    })} />);

    fireEvent.click(screen.getByRole("button", { name: "Eight of hearts" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign unknown card" }));

    expect(onKnownCard).toHaveBeenCalledWith(activeTarget, {
      kind: "known",
      rank: "8",
      suit: "hearts",
    });
    expect(onUnknownCard).toHaveBeenCalledWith(activeTarget);
  });

  it("assigns a value-only observation to the exact active hand", () => {
    const onValueCard = vi.fn();
    const activeTarget = {
      kind: "player-hand",
      seat: 4,
      handId: "seat-4-hand-1-2",
    } as const;
    render(<CardPicker {...pickerProps({
      activeTarget,
      workspaceMode: "pro",
      onValueCard,
      table: table({
        playerHands: {
          ...table().playerHands,
          4: [{
            handId: "seat-4-hand-1-2",
            parentHandId: "seat-4-hand-1",
            splitDepth: 1,
            fromSplitAces: false,
            cards: [],
          }],
        },
      }),
    })} />);

    fireEvent.click(screen.getByRole("button", { name: "Seven, 4 remaining" }));
    expect(onValueCard).toHaveBeenCalledWith(activeTarget, {
      kind: "value",
      value: "7",
    });
  });

  it("scales known-deck value capacity", () => {
    const { rerender } = render(<CardPicker {...pickerProps({ workspaceMode: "pro" })} />);
    expect(screen.getByRole("button", { name: "Ace, 4 remaining" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Ten-valued card, 16 remaining/ })).toBeEnabled();

    rerender(<CardPicker {...pickerProps({ workspaceMode: "pro", decks: 2 })} />);
    expect(screen.getByRole("button", { name: "Ace, 8 remaining" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Ten-valued card, 32 remaining/ })).toBeEnabled();
  });

  it("combines exact, value-only, split-hand, and discarded consumption", () => {
    const mixedTable = table({
      dealerCards: [{ kind: "known", rank: "Q", suit: "hearts" }],
      discardedCards: [{ kind: "known", rank: "K", suit: "clubs" }],
      playerHands: {
        1: [], 2: [], 3: [], 5: [], 6: [], 7: [],
        4: [
          {
            handId: "seat-4-hand-1-1",
            parentHandId: "seat-4-hand-1",
            splitDepth: 1,
            fromSplitAces: false,
            cards: [{ kind: "value", value: "10" }],
          },
          {
            handId: "seat-4-hand-1-2",
            parentHandId: "seat-4-hand-1",
            splitDepth: 1,
            fromSplitAces: false,
            cards: [{ kind: "known", rank: "A", suit: "spades" }],
          },
        ],
      },
    });
    render(<CardPicker {...pickerProps({
      workspaceMode: "pro",
      table: mixedTable,
    })} />);

    expect(screen.getByRole("button", { name: /Ten-valued card, 13 remaining/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ace, 3 remaining" })).toBeEnabled();
  });

  it("disables an exhausted value with an accessible reason and dispatches nothing", () => {
    const onValueCard = vi.fn();
    render(<CardPicker {...pickerProps({
      workspaceMode: "pro",
      onValueCard,
      table: table({
        dealerCards: (["spades", "hearts", "diamonds", "clubs"] as const).map(
          (suit) => ({ kind: "known", rank: "A", suit }),
        ),
      }),
    })} />);

    const ace = screen.getByRole("button", {
      name: /Ace, 0 remaining; unavailable: value is exhausted for the current shoe/,
    });
    expect(ace).toBeDisabled();
    expect(ace).toHaveAccessibleDescription(/Counts use confirmed exact and value-only observations/);
    fireEvent.click(ace);
    expect(onValueCard).not.toHaveBeenCalled();
  });

  it("shows no fabricated quantities for an unknown deck count", () => {
    render(<CardPicker {...pickerProps({
      workspaceMode: "pro",
      decks: null,
    })} />);

    expect(screen.getByRole("button", {
      name: "Ace, remaining quantity unavailable",
    })).toBeEnabled();
    expect(screen.getByRole("button", {
      name: "Ten-valued card, remaining quantity unavailable; represents ten, jack, queen, or king",
    })).toBeEnabled();
    expect(screen.getByLabelText("Card values")).not.toHaveTextContent("×");
    expect(screen.getByText(/Deck count is unknown, so no fixed remaining quantities are shown/)).toBeVisible();
  });

  it("shows upper bounds instead of exact quantities when Unknown observations exist", () => {
    render(<CardPicker {...pickerProps({
      workspaceMode: "pro",
      table: table({ dealerCards: [{ kind: "unknown" }] }),
    })} />);

    expect(screen.getByRole("button", {
      name: /Ace, up to 4 remaining; Unknown observations make the exact quantity unresolved/,
    })).toBeEnabled();
    expect(screen.getByLabelText("Card values")).toHaveTextContent("≤4");
    expect(screen.getByText(/shown quantities are upper bounds/)).toBeVisible();
  });

  it("preserves Normal Mode physical-card exhaustion behavior", () => {
    const used = { kind: "known", rank: "8", suit: "hearts" } as const;
    const { rerender } = render(<CardPicker {...pickerProps({
      decks: 2,
      table: table({ dealerCards: [used] }),
    })} />);
    expect(screen.getByRole("button", { name: "Eight of hearts" })).toBeEnabled();

    rerender(<CardPicker {...pickerProps({
      decks: 2,
      table: table({ dealerCards: [used, used] }),
    })} />);
    expect(screen.getByRole("button", {
      name: "Eight of hearts, unavailable: all configured copies are already observed",
    })).toBeDisabled();
  });
});
