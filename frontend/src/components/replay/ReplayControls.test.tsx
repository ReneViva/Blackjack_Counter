import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { gameReducer, type SessionState } from "../../state/gameReducer";
import { createInitialState, DEFAULT_CONFIGURATION } from "../../state/initialState";
import { serializeSessionReplay } from "../../replay/sessionReplay";
import { SESSION_STORAGE_KEY } from "../../state/persistence";
import {
  DEVICE_PREFERENCES_KEY,
  loadDevicePreferences,
  saveDevicePreferences,
} from "../../state/preferences";
import ReplayControls from "./ReplayControls";

function startedSession(): SessionState {
  return gameReducer(createInitialState({
    ...DEFAULT_CONFIGURATION,
    rules: { ...DEFAULT_CONFIGURATION.rules, decks: 1 },
  }), { type: "NEW_SHOE" });
}

function validationResponse(valid = true): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      valid,
      errors: valid ? [] : [{ code: "invalid_state", message: "Duplicate physical card.", field: "cards" }],
      warnings: [],
    }),
  } as Response;
}

function replayFile(state = startedSession()): File {
  const text = serializeSessionReplay(state);
  return { name: "replay.json", size: text.length, text: async () => text } as unknown as File;
}

afterEach(() => {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(DEVICE_PREFERENCES_KEY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ReplayControls", () => {
  it("has labeled keyboard-operable export and JSON import controls", () => {
    render(<ReplayControls state={createInitialState()} onActivate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Export Session Replay" })).toBeDisabled();
    const input = screen.getByLabelText("Import Replay (.json)");
    expect(input).toHaveAttribute("accept", ".json,application/json");
    expect(input).toHaveAccessibleDescription("Accepted file type: JSON.");
    expect(screen.queryByLabelText(/autosave|persistent|wager|bankroll|player action/i)).not.toBeInTheDocument();
  });

  it("downloads a deterministic replay with the suggested filename", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => "blob:replay");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    render(<ReplayControls state={startedSession()} onActivate={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Export Session Replay" }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:replay");
    expect(screen.getByRole("status")).toHaveTextContent("Session replay exported");
  });

  it("backend-validates before atomically activating an imported replay", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls.push("validate");
      return validationResponse();
    }));
    const onActivate = vi.fn(() => calls.push("activate"));
    render(<ReplayControls state={createInitialState()} onActivate={onActivate} />);

    fireEvent.change(screen.getByLabelText("Import Replay (.json)"), {
      target: { files: [replayFile()] },
    });

    await waitFor(() => expect(onActivate).toHaveBeenCalledOnce());
    expect(calls).toEqual(["validate", "activate"]);
    expect(onActivate).toHaveBeenCalledWith(startedSession());
  });

  it("activates imported deck configuration without changing the preferred default", async () => {
    saveDevicePreferences({ workspaceMode: "pro", preferredDeckCount: 8 });
    const fourDeck = gameReducer(createInitialState({
      ...DEFAULT_CONFIGURATION,
      rules: { ...DEFAULT_CONFIGURATION.rules, decks: 4 },
    }), { type: "NEW_SHOE" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(validationResponse()));
    const onActivate = vi.fn();
    render(<ReplayControls state={createInitialState()} onActivate={onActivate} />);

    fireEvent.change(screen.getByLabelText("Import Replay (.json)"), {
      target: { files: [replayFile(fourDeck)] },
    });

    await waitFor(() => expect(onActivate).toHaveBeenCalledWith(fourDeck));
    expect(loadDevicePreferences()).toEqual({
      workspaceMode: "pro",
      preferredDeckCount: 8,
    });
  });

  it("leaves the active session unchanged when backend validation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(validationResponse(false)));
    const onActivate = vi.fn();
    render(<ReplayControls state={startedSession()} onActivate={onActivate} />);

    fireEvent.change(screen.getByLabelText("Import Replay (.json)"), {
      target: { files: [replayFile()] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Duplicate physical card");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("requires confirmation before replacing an active session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(validationResponse()));
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onActivate = vi.fn();
    render(<ReplayControls state={startedSession()} onActivate={onActivate} />);

    fireEvent.change(screen.getByLabelText("Import Replay (.json)"), {
      target: { files: [replayFile()] },
    });

    expect(await screen.findByRole("status")).toHaveTextContent("active session was unchanged");
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("renders malformed-import errors as text without activating", async () => {
    const onActivate = vi.fn();
    const file = { name: "bad.json", size: 4, text: async () => "nope" } as unknown as File;
    render(<ReplayControls state={createInitialState()} onActivate={onActivate} />);

    fireEvent.change(screen.getByLabelText("Import Replay (.json)"), {
      target: { files: [file] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("not valid JSON");
    expect(screen.getByLabelText("Import Replay (.json)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Import Replay (.json)")).toHaveAccessibleDescription(/not valid JSON/);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("does not activate or overwrite storage for a malformed value-only v3 import", async () => {
    const current = startedSession();
    const withValue = gameReducer(current, {
      type: "DEAL_VALUE_CARD",
      target: { kind: "dealer" },
      card: { kind: "value", value: "10" },
    });
    const replay = JSON.parse(serializeSessionReplay(withValue)) as {
      session: { events: Array<Record<string, unknown>> };
    };
    replay.session.events.at(-1)!.card = { kind: "value", value: "K" };
    const text = JSON.stringify(replay);
    const file = { name: "bad-value.json", size: text.length, text: async () => text } as unknown as File;
    const onActivate = vi.fn();
    window.localStorage.setItem(SESSION_STORAGE_KEY, "unchanged");
    render(<ReplayControls state={current} onActivate={onActivate} />);

    fireEvent.change(screen.getByLabelText("Import Replay (.json)"), {
      target: { files: [file] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Value-only card value is unsupported");
    expect(onActivate).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBe("unchanged");
  });
});
