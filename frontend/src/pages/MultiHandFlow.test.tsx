import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { SESSION_STORAGE_KEY } from "../state/persistence";

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

function installBackendMock(): void {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/health")) {
      return Promise.resolve(jsonResponse({
        status: "ok",
        service: "blackjack-analysis-api",
      }));
    }
    if (url.endsWith("/player-actions")) {
      const body = JSON.parse(String(init?.body)) as {
        state: { players: Array<{ hand_id: string; cards: Array<{ kind: string; rank?: string }> }> };
        target: { hand_id: string };
      };
      const cards = body.state.players.find(
        (hand) => hand.hand_id === body.target.hand_id,
      )?.cards ?? [];
      const allowed = cards.length === 2 && cards.every(
        (card) => card.kind === "known" && card.rank === cards[0].rank,
      );
      return Promise.resolve(jsonResponse({
        split: {
          allowed,
          code: allowed ? null : "exact_pair_required",
          reason: allowed ? null : "Splitting requires two known cards of the same exact rank.",
        },
      }));
    }
    return new Promise<Response>(() => undefined);
  }));
}

afterEach(() => {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("multi-hand direct manipulation", () => {
  it("splits one seat, targets both hands, leaves, and rejoins without restoring cards", async () => {
    installBackendMock();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Add player at Seat 4" }));
    expect(screen.getByText("Player actions", { selector: ".eyebrow" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Split" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Eight of hearts" }));
    fireEvent.click(screen.getByRole("button", { name: "Eight of clubs" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Split" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Split" }));

    const handOne = screen.getByRole("button", { name: /Seat 4.*Hand 1/ });
    const handTwo = screen.getByRole("button", { name: /Seat 4.*Hand 2/ });
    expect(handOne).toHaveAttribute("aria-pressed", "true");
    expect(within(handOne).getByText("Active")).toBeVisible();
    expect(handTwo).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Three of diamonds" }));
    fireEvent.click(handTwo);
    expect(handTwo).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "King of hearts" }));

    expect(within(screen.getByLabelText("Seat 4, Hand 1 observed cards"))
      .getByLabelText("Three of diamonds")).toBeVisible();
    expect(within(screen.getByLabelText("Seat 4, Hand 2 observed cards"))
      .getByLabelText("King of hearts")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Leave Seat 4" }));
    expect(screen.getByRole("button", { name: "Add player at Seat 4" })).toBeVisible();
    expect(screen.queryByText("Player actions", { selector: ".eyebrow" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Session observation summary")).toHaveTextContent(
      "Known observations4",
    );

    fireEvent.click(screen.getByRole("button", { name: "Add player at Seat 4" }));
    expect(screen.getByLabelText("Seat 4 observed cards")).toHaveTextContent("No cards");
    expect(screen.getByLabelText("Session observation summary")).toHaveTextContent(
      "Known observations4",
    );
  });

  it("never exposes player-only actions for the dealer", () => {
    installBackendMock();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Dealer" }));

    expect(screen.queryByRole("button", { name: "Split" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Leave Seat/ })).not.toBeInTheDocument();
  });
});
