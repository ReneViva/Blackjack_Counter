import { useEffect, useRef, useState } from "react";

import type { SessionState } from "../../state/gameReducer";
import { downloadJsonFile } from "../../replay/download";
import {
  readAndValidateReplayFile,
  ReplayImportError,
  serializeSessionReplay,
} from "../../replay/sessionReplay";

type ReplayControlsProps = Readonly<{
  state: SessionState;
  onActivate: (candidate: SessionState) => void;
}>;

type ImportStatus = "idle" | "loading" | "success" | "error";

export default function ReplayControls({ state, onActivate }: ReplayControlsProps) {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const hasSession = state.events.length > 0;

  useEffect(() => () => controller.current?.abort(), []);

  const exportReplay = () => {
    downloadJsonFile("blackjack-session-replay.json", serializeSessionReplay(state));
    setStatus("success");
    setMessage("Session replay exported.");
  };

  const importReplay = async (file: File) => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setStatus("loading");
    setMessage("Validating replay before replacing the active session…");
    try {
      const candidate = await readAndValidateReplayFile(file, request.signal);
      if (request.signal.aborted || controller.current !== request) return;
      if (hasSession && !window.confirm(
        "Importing this replay will replace the active session after validation. Continue?",
      )) {
        setStatus("idle");
        setMessage("Replay import cancelled; the active session was unchanged.");
        return;
      }
      onActivate(candidate);
      setStatus("success");
      setMessage("Replay imported and validated. The active session was replaced.");
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("error");
      setMessage(
        error instanceof ReplayImportError
          ? error.message
          : "Replay import could not be completed.",
      );
    }
  };

  return <section className="replay-controls" aria-label="Session replay controls">
    <div className="replay-actions">
      <label className="button-secondary replay-import-control">
        <span aria-hidden="true">↥</span> Import Replay
        <input
          type="file"
          aria-label="Import Replay (.json)"
          accept=".json,application/json"
          disabled={status === "loading"}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importReplay(file);
            event.currentTarget.value = "";
          }}
        />
      </label>
      <button type="button" className="button-secondary" aria-label="Export Session Replay" disabled={!hasSession} onClick={exportReplay}><span aria-hidden="true">↧</span> Export Session</button>
    </div>
    {message && <p className={`replay-message${status === "error" ? " replay-message--error" : ""}`} role={status === "error" ? "alert" : "status"}>{message}</p>}
  </section>;
}
