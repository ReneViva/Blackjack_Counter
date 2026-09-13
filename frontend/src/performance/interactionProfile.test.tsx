import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "../App";
import { SESSION_STORAGE_KEY } from "../state/persistence";

function healthResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ status: "ok", service: "blackjack-analysis-api" }),
  } as Response;
}

afterEach(() => {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("direct-manipulation performance contract", () => {
  it("updates immediately, debounces requests, aborts stale work, and saves once per state change", async () => {
    const requestSignals: AbortSignal[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/health")) return Promise.resolve(healthResponse());
      const signal = init?.signal;
      if (signal) requestSignals.push(signal);
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Add player at Seat 4" }));

    expect(screen.getByRole("button", { name: /Seat 4, occupied, primary hand/ })).toBeVisible();
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/research/compare"))).toHaveLength(1);
    }, { timeout: 1_500 });
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Dealer" }));
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    expect(fetchMock.mock.calls.filter(([input]) => !String(input).endsWith("/health"))).toHaveLength(1);
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Seat 4, occupied, primary hand/ }));
    fireEvent.click(screen.getByRole("button", { name: "Eight of hearts" }));
    fireEvent.click(screen.getByRole("button", { name: "Six of spades" }));
    expect(within(screen.getByLabelText("Seat 4 observed cards")).getByLabelText("Eight of hearts")).toBeVisible();
    expect(within(screen.getByLabelText("Seat 4 observed cards")).getByLabelText("Six of spades")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Dealer" }));
    fireEvent.click(screen.getByRole("button", { name: "Ten of diamonds" }));
    expect(within(screen.getByLabelText("Dealer observed cards")).getByLabelText("Ten of diamonds")).toBeVisible();
    expect(setItemSpy).toHaveBeenCalledTimes(4);
    expect(requestSignals[0]?.aborted).toBe(true);

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/analyze"))).toHaveLength(1);
      expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/research/compare"))).toHaveLength(2);
    }, { timeout: 1_500 });
  });
});
