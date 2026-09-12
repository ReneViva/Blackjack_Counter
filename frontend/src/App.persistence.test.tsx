import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import type { ResearchDefinition } from "./api/research";
import { gameReducer, type SessionState } from "./state/gameReducer";
import { createInitialState } from "./state/initialState";
import {
  parsePersistedSession,
  serializePersistedSession,
  SESSION_STORAGE_KEY,
} from "./state/persistence";

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

const definitions: readonly ResearchDefinition[] = [
  ["wong_halves", "Wong Halves"],
  ["zen_count", "Zen Count"],
  ["omega_ii", "Omega II"],
].map(([identifier, label]) => ({
  identifier: identifier as ResearchDefinition["identifier"],
  label,
  balanced: true,
  level: 2,
  ace_classification: "ace_neutral",
  source: {
    source_id: "approved-source",
    title: "Approved Counting Systems",
    local_path: "research/sources/approved-counting-systems.md",
    sha256: "343d",
    locator: "fixture",
  },
  published_metrics: { kind: "published_static_metadata", pe: .55, bc: .92, ic: .78 },
}));

function successfulApi(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  if (url.endsWith("/health")) {
    return Promise.resolve(jsonResponse({ status: "ok", service: "blackjack-analysis-api" }));
  }
  if (url.endsWith("/validate")) {
    return Promise.resolve(jsonResponse({ valid: true, errors: [], warnings: [] }));
  }
  if (url.endsWith("/analyze")) {
    return Promise.resolve(jsonResponse({
      method: "exact",
      state_summary: { cards_remaining: 48, known_cards: 4, hidden_cards: 1 },
      outcomes: { win: .4, push: .1, loss: .5 },
      metadata: {
        states_evaluated: 10,
        cache_hits: 2,
        cache_misses: 8,
        runtime_ms: 1,
        hidden_states_evaluated: 1,
        hidden_weight_mass: 1,
      },
    }));
  }
  if (url.endsWith("/research/compare")) {
    return Promise.resolve(jsonResponse({
      method: "research_comparison",
      scores: definitions.map((definition) => ({
        definition,
        raw_score: 2,
        raw_score_fraction: "2/1",
        observed_known_cards: 3,
        unresolved_unknown_cards: 1,
        complete: false,
        ace_information: {
          feature_id: "ace_information",
          label: "Ace Information",
          known_aces_observed: 0,
          exact_aces_remaining: null,
          complete: false,
        },
      })),
      exact_reference: null,
    }));
  }
  return Promise.reject(new Error(`Unexpected URL: ${url}`));
}

function persistedSession(): SessionState {
  let state = gameReducer(createInitialState(), { type: "ADD_PLAYER", seat: 4 });
  state = gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "player", seat: 4 },
    card: { kind: "known", rank: "8", suit: "hearts" },
  });
  state = gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "player", seat: 4 },
    card: { kind: "known", rank: "6", suit: "spades" },
  });
  state = gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "dealer" },
    card: { kind: "known", rank: "10", suit: "diamonds" },
  });
  return gameReducer(state, {
    type: "DEAL_UNKNOWN_CARD",
    target: { kind: "dealer" },
  });
}

afterEach(() => {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem("unrelated-key");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("application session persistence", () => {
  it("restores a complete session atomically and refreshes analysis from the backend", async () => {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializePersistedSession(persistedSession()),
    );
    const fetchMock = vi.fn(successfulApi);
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(screen.getByText("Restored locally")).toBeVisible();
    expect(screen.getByRole("button", { name: /Seat 4, occupied, primary hand/ })).toBeVisible();
    expect(within(screen.getByLabelText("Seat 4 observed cards")).getByLabelText("Eight of hearts")).toBeVisible();
    expect(within(screen.getByLabelText("Seat 4 observed cards")).getByLabelText("Six of spades")).toBeVisible();
    expect(within(screen.getByLabelText("Dealer observed cards")).getByLabelText("Ten of diamonds")).toBeVisible();
    expect(within(screen.getByLabelText("Dealer observed cards")).getByLabelText("Unknown card")).toBeVisible();
    expect(screen.getByRole("button", { name: "Export Session Replay" })).toBeEnabled();

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(urls).toEqual(expect.arrayContaining([
        "http://127.0.0.1:8000/api/validate",
        "http://127.0.0.1:8000/api/analyze",
        "http://127.0.0.1:8000/api/research/compare",
      ]));
    }, { timeout: 1500 });
    expect(await screen.findByText("40.0%", {}, { timeout: 1500 })).toBeVisible();
  });

  it("restores locally valid state while the backend is offline without deleting it", async () => {
    const serialized = serializePersistedSession(persistedSession());
    window.localStorage.setItem(SESSION_STORAGE_KEY, serialized);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<App />);

    expect(screen.getByRole("button", { name: /Seat 4, occupied, primary hand/ })).toBeVisible();
    expect(await screen.findByText("Backend unavailable")).toBeVisible();
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBe(serialized);
  });

  it("falls back safely, warns, and removes only a definitively corrupt app key", async () => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, "{");
    window.localStorage.setItem("unrelated-key", "keep");
    vi.stubGlobal("fetch", vi.fn(successfulApi));

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    expect(screen.getByText("Saved session could not be restored")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add player at Seat 4" })).toBeVisible();
    await waitFor(() => expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull());
    expect(window.localStorage.getItem("unrelated-key")).toBe("keep");
  });

  it("keeps the clean workspace usable when browser storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.stubGlobal("fetch", vi.fn(successfulApi));

    render(<App />);

    expect(screen.getByText("Saved session could not be read locally")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add player at Seat 4" })).toBeVisible();
  });

  it("discards a restored session only when an available backend definitively rejects it", async () => {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializePersistedSession(persistedSession()),
    );
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) =>
      String(input).endsWith("/validate")
        ? Promise.resolve(jsonResponse({
            valid: false,
            errors: [{ code: "invalid_table", message: "Invalid table", field: null }],
            warnings: [],
          }))
        : successfulApi(input),
    ));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Add player at Seat 4" })).toBeVisible();
      expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });
    expect(screen.getByText("Saved session could not be restored")).toBeVisible();
  });

  it("persists direct changes and undo exactly once under Strict Mode", async () => {
    vi.stubGlobal("fetch", vi.fn(successfulApi));
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add player at Seat 4" }));
    await waitFor(() => expect(setItemSpy).toHaveBeenCalledTimes(1));
    expect(parsePersistedSession(window.localStorage.getItem(SESSION_STORAGE_KEY)!))
      .toMatchObject({ configuration: { activeSeats: [4], userSeat: 4 } });

    fireEvent.click(screen.getByRole("button", { name: "Eight of hearts" }));
    await waitFor(() => expect(setItemSpy).toHaveBeenCalledTimes(2));
    expect(parsePersistedSession(window.localStorage.getItem(SESSION_STORAGE_KEY)!).events)
      .toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(setItemSpy).toHaveBeenCalledTimes(3));
    expect(parsePersistedSession(window.localStorage.getItem(SESSION_STORAGE_KEY)!).events)
      .toHaveLength(2);
    expect(screen.getByText("Saved locally")).toBeVisible();
  });

  it("replaces old durable state when New Session is confirmed", async () => {
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      serializePersistedSession(persistedSession()),
    );
    vi.stubGlobal("fetch", vi.fn(successfulApi));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /New Session/ }));

    await waitFor(() => {
      expect(parsePersistedSession(window.localStorage.getItem(SESSION_STORAGE_KEY)!))
        .toEqual(createInitialState());
    });
    expect(screen.getByRole("button", { name: "Add player at Seat 4" })).toBeVisible();
  });

  it("keeps the in-memory workspace usable when localStorage writes fail", async () => {
    vi.stubGlobal("fetch", vi.fn(successfulApi));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Add player at Seat 4" }));

    expect(screen.getByRole("button", { name: /Seat 4, occupied, primary hand/ })).toBeVisible();
    expect(await screen.findByText("Session could not be saved locally")).toBeVisible();
  });
});
