import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { gameReducer, type SessionState } from "../../state/gameReducer";
import { createInitialState, DEFAULT_CONFIGURATION } from "../../state/initialState";
import { serializeSessionReplay } from "../../replay/sessionReplay";
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ReplayControls", () => {
  it("has labeled keyboard-operable export and JSON import controls", () => {
    render(<ReplayControls state={createInitialState()} onActivate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Export Session Replay" })).toBeDisabled();
    expect(screen.getByLabelText("Import Replay (.json)")).toHaveAttribute("accept", ".json,application/json");
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
    expect(onActivate).not.toHaveBeenCalled();
  });
});
