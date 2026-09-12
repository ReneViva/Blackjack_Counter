import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { serializeSessionReplay } from "./replay/sessionReplay";
import { gameReducer } from "./state/gameReducer";
import { createInitialState, DEFAULT_CONFIGURATION } from "./state/initialState";

function successfulHealthResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status: "ok",
      service: "blackjack-analysis-api",
    }),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("backend connectivity", () => {
  it("shows the loading state while the health request is pending", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking backend connection",
    );
  });

  it("shows the connected state after a successful health response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successfulHealthResponse()));

    render(<App />);

    expect(await screen.findByText("Backend connected")).toBeVisible();
  });

  it("shows the unavailable state after a failed health request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<App />);

    expect(await screen.findByText("Backend unavailable")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Retry connection" }),
    ).toBeVisible();
  });

  it("retries the health request and recovers", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(successfulHealthResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry connection" }),
    );

    expect(await screen.findByText("Backend connected")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("activates a backend-validated replay as one complete session", async () => {
    const imported = gameReducer(createInitialState({
      ...DEFAULT_CONFIGURATION,
      rules: { ...DEFAULT_CONFIGURATION.rules, decks: 2 },
      activeSeats: [1, 2],
      userSeat: 2,
    }), { type: "NEW_SHOE" });
    const serialized = serializeSessionReplay(imported);
    const file = { name: "replay.json", size: serialized.length, text: async () => serialized } as unknown as File;
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.endsWith("/health")
        ? successfulHealthResponse()
        : {
            ok: true,
            status: 200,
            json: async () => ({ valid: true, errors: [], warnings: [] }),
          } as Response,
    ));

    render(<App />);
    fireEvent.change(screen.getByLabelText("Import Replay (.json)"), {
      target: { files: [file] },
    });

    expect(await screen.findByRole("region", { name: "Observed blackjack table" })).toBeVisible();
    expect(screen.getByText("2 decks")).toBeVisible();
    expect(screen.getByRole("heading", { name: /Player seat 2/ })).toHaveTextContent("You");
  });
});
