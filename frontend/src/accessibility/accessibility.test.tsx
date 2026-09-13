import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { SESSION_STORAGE_KEY } from "../state/persistence";

function renderOfflineApp() {
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  return render(<App />);
}

afterEach(() => {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Phase 29 accessibility and UX contract", () => {
  it("exposes a logical landmark and heading structure", () => {
    renderOfflineApp();

    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("heading", { level: 1, name: "Blackjack Probability Lab" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Analysis" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Interactive observed blackjack table" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Interactive observed blackjack table" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Card Assignment" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Session Replay actions" })).toBeVisible();
  });

  it("moves focus to an added player and exposes one pressed target", () => {
    renderOfflineApp();
    fireEvent.click(screen.getByRole("button", { name: "Add player at Seat 4" }));

    const seat = screen.getByRole("button", {
      name: "Seat 4, occupied, primary hand, active target, Hand 1",
    });
    expect(seat).toHaveFocus();
    expect(seat).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByRole("button", { name: "Dealer" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps every seat operable when the table reaches seven players", () => {
    renderOfflineApp();

    for (let seat = 1; seat <= 7; seat += 1) {
      fireEvent.click(screen.getByRole("button", { name: `Add player at Seat ${seat}` }));
    }

    const occupiedSeats = screen.getAllByRole("button", { name: /occupied/ });
    expect(occupiedSeats).toHaveLength(7);
    expect(occupiedSeats.filter((seat) => seat.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Add player at Seat/ })).not.toBeInTheDocument();
  });

  it("explains why card controls are disabled without changing their names", () => {
    renderOfflineApp();

    const card = screen.getByRole("button", { name: "Eight of hearts" });
    expect(card).toBeDisabled();
    expect(card).toHaveAttribute("aria-describedby", "assignment-prompt");
    expect(within(screen.getByRole("region", { name: "Card Assignment" })).getByRole("status")).toHaveTextContent(
      "Select the dealer or an occupied player first",
    );
  });

  it("manages initial modal focus, traps reverse tab, closes with Escape, and returns focus", () => {
    renderOfflineApp();
    const trigger = screen.getByRole("button", { name: "Open table settings" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Table settings" });
    const close = within(dialog).getByRole("button", { name: "Close table settings" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(within(dialog).getByRole("button", { name: "Start new shoe" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Table settings" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
