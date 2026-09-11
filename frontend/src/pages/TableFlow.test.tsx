import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderApp() {
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  render(<App />);
}

function configureAndStart() {
  fireEvent.change(screen.getByLabelText("Deck count"), {
    target: { value: "6" },
  });
  fireEvent.change(screen.getByLabelText("Active player seats"), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByLabelText("Your seat"), {
    target: { value: "2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Start new shoe" }));
}

describe("setup and table flow", () => {
  it("keeps unknown deck count explicit by default", () => {
    renderApp();

    expect(screen.getByLabelText("Deck count")).toHaveValue("unknown");
    expect(screen.getByLabelText("Splitting enabled")).toBeChecked();
    expect(screen.getByLabelText("Maximum split hands")).toHaveValue("4");
    expect(screen.getByLabelText("Doubling enabled")).toBeChecked();
    expect(screen.getByLabelText("Surrender")).toHaveValue("none");
    expect(screen.getByLabelText("Dealer second card")).toHaveValue(
      "hole_card",
    );
    expect(screen.getByLabelText("Dealer blackjack check")).toHaveValue(
      "no_peek",
    );
  });

  it("configures extended rules and keeps no-hole-card combinations valid", () => {
    renderApp();

    fireEvent.click(screen.getByLabelText("Resplit Aces"));
    fireEvent.click(screen.getByLabelText("Hit split Aces"));
    fireEvent.click(screen.getByLabelText("Blackjack after split"));
    fireEvent.click(screen.getByLabelText("Double after split"));
    fireEvent.change(screen.getByLabelText("Surrender"), {
      target: { value: "late" },
    });
    fireEvent.change(screen.getByLabelText("Dealer blackjack check"), {
      target: { value: "peek" },
    });
    expect(screen.getByLabelText("Dealer blackjack check")).toHaveValue("peek");

    fireEvent.change(screen.getByLabelText("Dealer second card"), {
      target: { value: "no_hole_card" },
    });
    expect(screen.getByLabelText("Dealer blackjack check")).toHaveValue(
      "no_peek",
    );
    expect(screen.getByLabelText("Dealer blackjack check")).toBeDisabled();
  });

  it("starts a configured table with active and selected seats", () => {
    renderApp();
    configureAndStart();

    expect(screen.getByRole("region", { name: "Observed blackjack table" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Dealer" })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Player seat 1/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Player seat 2/ })).toHaveTextContent("You");
    expect(screen.getByRole("heading", { name: /Player seat 3/ })).toBeVisible();
    expect(screen.getByText("6 decks")).toBeVisible();
  });

  it("records exact and unknown cards and supports undo", () => {
    renderApp();
    configureAndStart();

    fireEvent.change(screen.getByLabelText("Card target"), {
      target: { value: "player-2" },
    });
    fireEvent.change(screen.getByLabelText("Card rank"), {
      target: { value: "K" },
    });
    fireEvent.change(screen.getByLabelText("Card suit"), {
      target: { value: "hearts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add known card" }));

    const userCards = screen.getByLabelText("Player seat 2 observed cards");
    expect(within(userCards).getByLabelText("K of hearts")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Card target"), {
      target: { value: "dealer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add unknown card" }));
    expect(
      within(screen.getByLabelText("Dealer observed cards")).getByLabelText(
        "Unknown card",
      ),
    ).toBeVisible();
    expect(screen.getByText("3 events")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Undo last event" }));
    expect(
      within(screen.getByLabelText("Dealer observed cards")).queryByLabelText(
        "Unknown card",
      ),
    ).not.toBeInTheDocument();
    expect(within(userCards).getByLabelText("K of hearts")).toBeVisible();
  });

  it("resets the table back to setup", () => {
    renderApp();
    configureAndStart();

    fireEvent.click(screen.getByRole("button", { name: "Reset session" }));

    expect(
      screen.getByRole("heading", { name: "Configure the observed table" }),
    ).toBeVisible();
  });
});
