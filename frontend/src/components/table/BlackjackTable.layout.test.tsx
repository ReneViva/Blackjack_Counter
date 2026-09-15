import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { DerivedTableState } from "../../state/selectors";
import BlackjackTable from "./BlackjackTable";

let resizeCallback: ResizeObserverCallback | null = null;

class TestResizeObserver implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }

  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

const table: DerivedTableState = {
  dealerCards: [],
  discardedCards: [],
  playerHands: {
    1: [],
    2: [],
    3: [],
    4: [{
      handId: "seat-4-hand-1",
      parentHandId: null,
      splitDepth: 0,
      fromSplitAces: false,
      cards: [{ kind: "known", rank: "8", suit: "hearts" }],
    }],
    5: [],
    6: [],
    7: [],
  },
};

afterEach(() => {
  resizeCallback = null;
  vi.unstubAllGlobals();
});

it("recomputes measured geometry and preserves concrete hand identity across mode toggles", () => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  const props = {
    activeSeats: [4] as const,
    activeTarget: { kind: "player-hand" as const, seat: 4 as const, handId: "seat-4-hand-1" },
    onAddPlayer: vi.fn(),
    onSelectTarget: vi.fn(),
    table,
    userSeat: 4 as const,
  };
  const { container, rerender } = render(
    <BlackjackTable {...props} workspaceMode="normal" />,
  );
  const felt = container.querySelector<HTMLElement>(".table-felt");
  const seat = container.querySelector<HTMLElement>(".player-seat--4");
  const hand = container.querySelector<HTMLButtonElement>(".seat-hand");
  if (!felt || !seat || !hand || !resizeCallback) throw new Error("Table layout fixture did not render.");
  const initialX = seat.dataset.layoutX;

  act(() => {
    resizeCallback?.([{
      target: felt,
      contentRect: {
        x: 0,
        y: 0,
        top: 0,
        right: 920,
        bottom: 680,
        left: 0,
        width: 920,
        height: 680,
        toJSON: () => ({}),
      },
    } as unknown as ResizeObserverEntry], {} as ResizeObserver);
  });

  expect(seat.dataset.layoutX).not.toBe(initialX);
  expect(felt).toHaveAttribute("data-layout-mode", "normal");
  expect(hand).toHaveAttribute("aria-label", expect.stringContaining("Hand 1"));

  rerender(<BlackjackTable {...props} workspaceMode="pro" />);

  expect(felt).toHaveAttribute("data-layout-mode", "pro");
  expect(container.querySelector<HTMLButtonElement>(".seat-hand"))
    .toHaveAttribute("aria-label", expect.stringContaining("Hand 1"));
  expect(container.querySelector<HTMLButtonElement>(".seat-hand"))
    .toHaveAttribute("aria-pressed", "true");
});
