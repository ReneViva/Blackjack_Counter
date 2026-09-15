import { StrictMode, useState, type ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BlackjackValueClass } from "../../domain/card";
import type { TableTarget } from "../../domain/events";
import type { WorkspaceMode } from "../../domain/workspace";
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
    workspaceMode: "pro",
    onKnownCard: vi.fn(),
    onNavigateTarget: vi.fn(),
    onUnknownCard: vi.fn(),
    onValueCard: vi.fn(),
    onWorkspaceModeChange: vi.fn(),
    ...overrides,
  };
}

const KEY_CASES = [
  ["1", "A"],
  ["2", "2"],
  ["3", "3"],
  ["4", "4"],
  ["5", "5"],
  ["6", "6"],
  ["7", "7"],
  ["8", "8"],
  ["9", "9"],
  ["0", "10"],
] as const satisfies readonly (readonly [string, BlackjackValueClass])[];

describe("Pro Mode keyboard assignment", () => {
  it.each(KEY_CASES)("maps %s to %s", (key, value) => {
    const onValueCard = vi.fn();
    render(<CardPicker {...pickerProps({ onValueCard })} />);

    fireEvent.keyDown(window, { key });

    expect(onValueCard).toHaveBeenCalledOnce();
    expect(onValueCard).toHaveBeenCalledWith(
      { kind: "dealer" },
      { kind: "value", value },
    );
  });

  it("does not assign numeric keys in Normal Mode", () => {
    const onValueCard = vi.fn();
    render(<CardPicker {...pickerProps({ workspaceMode: "normal", onValueCard })} />);

    fireEvent.keyDown(window, { key: "1" });

    expect(onValueCard).not.toHaveBeenCalled();
  });

  it.each([
    ["Dealer", { kind: "dealer" }],
    ["ordinary hand", { kind: "player-hand", seat: 4, handId: "seat-4-hand-1" }],
    ["split child", { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" }],
  ] as const)("assigns to the exact current %s target", (_label, activeTarget) => {
    const onValueCard = vi.fn();
    const playerHands = activeTarget.kind === "dealer"
      ? table().playerHands
      : {
          ...table().playerHands,
          4: [{
            handId: activeTarget.handId,
            parentHandId: activeTarget.handId.endsWith("-2") ? "seat-4-hand-1" : null,
            splitDepth: activeTarget.handId.endsWith("-2") ? 1 : 0,
            fromSplitAces: false,
            cards: [],
          }],
        };
    render(<CardPicker {...pickerProps({
      activeTarget: activeTarget as TableTarget,
      onValueCard,
      table: table({ playerHands }),
    })} />);

    fireEvent.keyDown(window, { key: "0" });

    expect(onValueCard).toHaveBeenCalledWith(activeTarget, {
      kind: "value",
      value: "10",
    });
  });

  it("uses the latest hand after the active target changes", () => {
    const onValueCard = vi.fn();
    const hands = [{
      handId: "seat-4-hand-1-1",
      parentHandId: "seat-4-hand-1",
      splitDepth: 1,
      fromSplitAces: false,
      cards: [],
    }, {
      handId: "seat-4-hand-1-2",
      parentHandId: "seat-4-hand-1",
      splitDepth: 1,
      fromSplitAces: false,
      cards: [],
    }];
    const currentTable = table({
      playerHands: { ...table().playerHands, 4: hands },
    });
    const { rerender } = render(<CardPicker {...pickerProps({
      activeTarget: { kind: "player-hand", seat: 4, handId: hands[0].handId },
      onValueCard,
      table: currentTable,
    })} />);

    rerender(<CardPicker {...pickerProps({
      activeTarget: { kind: "player-hand", seat: 4, handId: hands[1].handId },
      onValueCard,
      table: currentTable,
    })} />);
    fireEvent.keyDown(window, { key: "0" });

    expect(onValueCard).toHaveBeenCalledOnce();
    expect(onValueCard).toHaveBeenCalledWith(
      { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" },
      { kind: "value", value: "10" },
    );
  });

  it.each([
    ["input", <input aria-label="Editable input" key="input" />],
    ["textarea", <textarea aria-label="Editable textarea" key="textarea" />],
    ["select", <select aria-label="Editable select" key="select"><option>1</option></select>],
    ["contenteditable", <div aria-label="Editable content" contentEditable suppressContentEditableWarning tabIndex={0} key="editable">1</div>],
  ])("does not capture a mapped key from %s", (_label, editable) => {
    const onValueCard = vi.fn();
    render(<><CardPicker {...pickerProps({ onValueCard })} />{editable}</>);
    const control = screen.getByLabelText(`Editable ${_label === "contenteditable" ? "content" : _label}`);
    control.focus();

    fireEvent.keyDown(control, { key: "1" });

    expect(onValueCard).not.toHaveBeenCalled();
  });

  it.each([
    ["Control", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Alt", { altKey: true }],
  ])("does not capture %s plus a mapped key", (_label, modifier) => {
    const onValueCard = vi.fn();
    render(<CardPicker {...pickerProps({ onValueCard })} />);

    fireEvent.keyDown(window, { key: "1", ...modifier });

    expect(onValueCard).not.toHaveBeenCalled();
  });

  it("rejects a definitively exhausted value with live feedback", () => {
    const onValueCard = vi.fn();
    render(<CardPicker {...pickerProps({
      onValueCard,
      table: table({
        dealerCards: (["spades", "hearts", "diamonds", "clubs"] as const)
          .map((suit) => ({ kind: "known", rank: "A", suit })),
      }),
    })} />);

    fireEvent.keyDown(window, { key: "1" });

    expect(onValueCard).not.toHaveBeenCalled();
    expect(screen.getByText("A cannot be added — unavailable for the current shoe."))
      .toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("button", { name: /Ace, 0 remaining/ })).toBeDisabled();
  });

  it("rejects a mapped key without a target and announces what is needed", () => {
    const onValueCard = vi.fn();
    render(<CardPicker {...pickerProps({ activeTarget: null, onValueCard })} />);

    fireEvent.keyDown(window, { key: "5" });

    expect(onValueCard).not.toHaveBeenCalled();
    expect(screen.getByText("5 cannot be added — select the dealer or a player hand first."))
      .toHaveAttribute("aria-live", "polite");
  });

  it("announces a successful assignment without moving focus", () => {
    const onValueCard = vi.fn();
    render(<CardPicker {...pickerProps({ onValueCard })} />);
    const toggle = screen.getByRole("switch", { name: "Pro Mode" });
    toggle.focus();

    fireEvent.keyDown(window, { key: "1" });

    expect(screen.getByText("A assigned to Dealer."))
      .toHaveAttribute("aria-live", "polite");
    expect(toggle).toHaveFocus();
  });

  it("preserves the rapid 2-5-0-7 sequence exactly once and in order", () => {
    const onValueCard = vi.fn();
    render(<CardPicker {...pickerProps({ onValueCard })} />);

    for (const key of ["2", "5", "0", "7"]) fireEvent.keyDown(window, { key });

    expect(onValueCard).toHaveBeenCalledTimes(4);
    expect(onValueCard.mock.calls.map(([, card]) => card.value))
      .toEqual(["2", "5", "10", "7"]);
  });

  it("does not duplicate listeners across Pro, Normal, and Pro transitions", () => {
    const onValueCard = vi.fn();

    function ModeHarness() {
      const [mode, setMode] = useState<WorkspaceMode>("pro");
      return <CardPicker {...pickerProps({
        onValueCard,
        onWorkspaceModeChange: setMode,
        workspaceMode: mode,
      })} />;
    }

    render(<ModeHarness />);
    fireEvent.keyDown(window, { key: "5" });
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    fireEvent.keyDown(window, { key: "6" });
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    fireEvent.keyDown(window, { key: "7" });

    expect(onValueCard.mock.calls.map(([, card]) => card.value)).toEqual(["5", "7"]);
  });

  it("creates one assignment per keydown under React Strict Mode", () => {
    const onValueCard = vi.fn();
    render(<StrictMode><CardPicker {...pickerProps({ onValueCard })} /></StrictMode>);

    fireEvent.keyDown(window, { key: "2" });

    expect(onValueCard).toHaveBeenCalledOnce();
  });

  it("removes its listener on unmount", () => {
    const onValueCard = vi.fn();
    const { unmount } = render(<CardPicker {...pickerProps({ onValueCard })} />);

    unmount();
    fireEvent.keyDown(window, { key: "3" });

    expect(onValueCard).not.toHaveBeenCalled();
  });
});

describe("Pro Mode arrow target navigation", () => {
  const splitHands = [{
    handId: "seat-4-hand-1-1",
    parentHandId: "seat-4-hand-1",
    splitDepth: 1,
    fromSplitAces: false,
    cards: [],
  }, {
    handId: "seat-4-hand-1-2",
    parentHandId: "seat-4-hand-1",
    splitDepth: 1,
    fromSplitAces: false,
    cards: [],
  }];
  const splitTable = table({
    playerHands: { ...table().playerHands, 4: splitHands },
  });

  function NavigationHarness({
    initialTarget = { kind: "player-hand", seat: 4, handId: splitHands[0].handId },
    onNavigate = vi.fn(),
    onValueCard = vi.fn(),
  }: Readonly<{
    initialTarget?: TableTarget;
    onNavigate?: (target: TableTarget) => void;
    onValueCard?: ComponentProps<typeof CardPicker>["onValueCard"];
  }>) {
    const [activeTarget, setActiveTarget] = useState<TableTarget>(initialTarget);
    return <CardPicker {...pickerProps({
      activeTarget,
      onNavigateTarget: (target) => {
        onNavigate(target);
        setActiveTarget(target);
      },
      onValueCard,
      table: splitTable,
    })} />;
  }

  it("moves between split hands and immediately assigns to the new target", () => {
    const onNavigate = vi.fn();
    const onValueCard = vi.fn();
    render(<NavigationHarness onNavigate={onNavigate} onValueCard={onValueCard} />);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "0" });

    expect(onNavigate).toHaveBeenCalledWith({
      kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2",
    });
    expect(onValueCard).toHaveBeenCalledWith(
      { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" },
      { kind: "value", value: "10" },
    );
    expect(screen.getByText("10 assigned to Seat 4, Hand 2.")).toBeVisible();
  });

  it("moves Left, Up, and Down through the same active-target callback", () => {
    const onNavigate = vi.fn();
    render(<NavigationHarness
      initialTarget={{ kind: "player-hand", seat: 4, handId: splitHands[1].handId }}
      onNavigate={onNavigate}
    />);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(onNavigate.mock.calls.map(([target]) => target)).toEqual([
      { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-1" },
      { kind: "dealer" },
      { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-1" },
    ]);
    expect(screen.getByText("Active target: Seat 4, Hand 1."))
      .toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/Assigning to:/)).toHaveAttribute("aria-live", "off");
    expect(screen.getByRole("region", { name: "Card Assignment" })
      .querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it("preserves target and announces safely when Down has no player candidate", () => {
    const onNavigateTarget = vi.fn();
    render(<CardPicker {...pickerProps({
      onNavigateTarget,
      table: table(),
    })} />);

    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(onNavigateTarget).not.toHaveBeenCalled();
    expect(screen.getByText("No occupied player target is available."))
      .toHaveAttribute("aria-live", "polite");
  });

  it("does not capture arrows in Normal Mode", () => {
    const onNavigateTarget = vi.fn();
    render(<CardPicker {...pickerProps({ workspaceMode: "normal", onNavigateTarget })} />);
    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp", bubbles: true, cancelable: true,
    });

    window.dispatchEvent(event);

    expect(onNavigateTarget).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each([
    ["input", <input aria-label="Arrow input" key="input" />],
    ["textarea", <textarea aria-label="Arrow textarea" key="textarea" />],
    ["select", <select aria-label="Arrow select" key="select"><option>One</option></select>],
    ["contenteditable", <div aria-label="Arrow contenteditable" contentEditable suppressContentEditableWarning tabIndex={0} key="editable" />],
  ])("does not capture arrows from %s", (label, editable) => {
    const onNavigateTarget = vi.fn();
    render(<><CardPicker {...pickerProps({ onNavigateTarget })} />{editable}</>);
    const control = screen.getByLabelText(`Arrow ${label}`);
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight", bubbles: true, cancelable: true,
    });

    control.dispatchEvent(event);

    expect(onNavigateTarget).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not capture arrows inside a protected dialog", () => {
    const onNavigateTarget = vi.fn();
    render(<>
      <CardPicker {...pickerProps({ onNavigateTarget })} />
      <div role="dialog" aria-label="Editor"><button type="button">Edit</button></div>
    </>);

    fireEvent.keyDown(screen.getByRole("button", { name: "Edit" }), {
      key: "ArrowRight",
    });

    expect(onNavigateTarget).not.toHaveBeenCalled();
  });

  it.each([
    ["Control", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Alt", { altKey: true }],
  ])("does not capture %s plus ArrowRight", (_label, modifier) => {
    const onNavigateTarget = vi.fn();
    render(<CardPicker {...pickerProps({ onNavigateTarget })} />);

    fireEvent.keyDown(window, { key: "ArrowRight", ...modifier });

    expect(onNavigateTarget).not.toHaveBeenCalled();
  });

  it("prevents the browser default only for an owned Pro arrow", () => {
    const onNavigateTarget = vi.fn();
    render(<NavigationHarness onNavigate={onNavigateTarget} />);
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight", bubbles: true, cancelable: true,
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onNavigateTarget).toHaveBeenCalledOnce();
  });

  it("creates one navigation transition under React Strict Mode", () => {
    const onNavigate = vi.fn();
    render(<StrictMode><NavigationHarness onNavigate={onNavigate} /></StrictMode>);

    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("does not accumulate navigation listeners after rerender", () => {
    const onNavigateTarget = vi.fn();
    const { rerender } = render(<CardPicker {...pickerProps({
      activeTarget: { kind: "player-hand", seat: 4, handId: splitHands[0].handId },
      onNavigateTarget,
      table: splitTable,
    })} />);
    rerender(<CardPicker {...pickerProps({
      activeTarget: { kind: "player-hand", seat: 4, handId: splitHands[0].handId },
      onNavigateTarget,
      table: splitTable,
    })} />);

    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(onNavigateTarget).toHaveBeenCalledOnce();
  });

  it("does not duplicate navigation across Pro, Normal, and Pro transitions", () => {
    const onNavigate = vi.fn();

    function ModeHarness() {
      const [mode, setMode] = useState<WorkspaceMode>("pro");
      return <CardPicker {...pickerProps({
        activeTarget: { kind: "dealer" },
        onNavigateTarget: onNavigate,
        onWorkspaceModeChange: setMode,
        table: splitTable,
        workspaceMode: mode,
      })} />;
    }

    render(<ModeHarness />);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("removes navigation behavior on unmount", () => {
    const onNavigateTarget = vi.fn();
    const { unmount } = render(<CardPicker {...pickerProps({ onNavigateTarget })} />);

    unmount();
    fireEvent.keyDown(window, { key: "ArrowUp" });

    expect(onNavigateTarget).not.toHaveBeenCalled();
  });
});
