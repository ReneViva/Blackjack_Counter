import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { SESSION_STORAGE_KEY } from "../state/persistence";

afterEach(() => {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderApp() {
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  render(<App />);
}

describe("direct-manipulation table flow", () => {
  it("renders the three major regions, dealer, and all seven empty seats", () => {
    renderApp();

    expect(screen.getByRole("complementary", { name: "Analysis" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Blackjack table workspace" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Card Assignment" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Dealer" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /Add player at Seat/ })).toHaveLength(7);
    expect(within(screen.getByLabelText("All 52 cards")).getAllByRole("button")).toHaveLength(52);
    expect(screen.getByRole("button", { name: "Assign unknown card" })).toBeDisabled();
  });

  it("adds Seat 4 through the reducer and assigns player and dealer cards directly", () => {
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Add player at Seat 4" }));
    const seat = screen.getByRole("button", { name: /Seat 4, occupied, primary hand, active target/ });
    expect(seat).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Assigning to:/)).toHaveTextContent("Seat 4");

    fireEvent.click(screen.getByRole("button", { name: "Eight of hearts" }));
    fireEvent.click(screen.getByRole("button", { name: "Six of spades" }));
    const seatCards = screen.getByLabelText("Seat 4 observed cards");
    expect(within(seatCards).getByLabelText("Eight of hearts")).toBeVisible();
    expect(within(seatCards).getByLabelText("Six of spades")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Dealer" }));
    expect(screen.getByRole("button", { name: "Dealer, active target" })).toHaveAttribute("aria-pressed", "true");
    expect(seat).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Ten of diamonds" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign unknown card" }));

    const dealerCards = screen.getByLabelText("Dealer observed cards");
    expect(within(dealerCards).getByLabelText("Ten of diamonds")).toBeVisible();
    expect(within(dealerCards).getByLabelText("Unknown card")).toBeVisible();
    const information = screen.getByRole("region", { name: "Table Information" });
    expect(information).toHaveTextContent("Known observations3");
    expect(information).toHaveTextContent("Unknown observations1");
  });

  it("does not assign a card without a target and supports event-sourced undo", () => {
    renderApp();

    expect(screen.getByRole("button", { name: "Eight of hearts" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add player at Seat 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Eight of hearts" }));
    expect(screen.getByLabelText("Seat 4 observed cards")).toHaveTextContent("8");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByLabelText("Seat 4 observed cards")).toHaveTextContent("No cards");
  });

  it("keeps rules in compact settings and preserves advanced analysis access", () => {
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: "Open table settings" }));
    expect(screen.getByRole("dialog", { name: "Table settings" })).toBeVisible();
    expect(screen.getByLabelText("Deck count")).toHaveValue("1");
    fireEvent.change(screen.getByLabelText("Deck count"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Close table settings" }));

    fireEvent.click(screen.getByText("Advanced analysis, Monte Carlo, research experiments, and history"));
    expect(screen.getByLabelText("Analysis method")).toBeVisible();
    expect(screen.getByRole("button", { name: "Run offline experiment" })).toBeVisible();
  });

  it("exposes replay controls without unsafe strategy or wagering controls", () => {
    renderApp();

    expect(screen.getByLabelText("Import Replay (.json)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Export Session Replay" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add player at Seat 4" }));
    expect(screen.getByRole("button", { name: "Export Session Replay" })).toBeEnabled();
    expect(screen.queryByText(/Suggested:\s*(Hit|Stand|Double|Split)/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/wager|bankroll|bet size|true count/i)).not.toBeInTheDocument();
  });
});
