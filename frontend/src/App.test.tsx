import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

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
});
