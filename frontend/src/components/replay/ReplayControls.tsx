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

  return <section className="replay-controls" aria-labelledby="replay-controls-heading">
    <div>
      <h2 id="replay-controls-heading">Session replay</h2>
      <p>Export deterministic event chronology or import a validated replay. Import replaces the active session only after all checks pass.</p>
    </div>
    <div className="replay-actions">
      <button type="button" className="button-secondary" disabled={!hasSession} onClick={exportReplay}>Export Session Replay</button>
      <label className="file-control">
        Import Replay (.json)
        <input
          type="file"
          accept=".json,application/json"
          disabled={status === "loading"}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importReplay(file);
            event.currentTarget.value = "";
          }}
        />
      </label>
    </div>
    {message && <p className={status === "error" ? "analysis-error" : "analysis-note"} role={status === "error" ? "alert" : "status"}>{message}</p>}
  </section>;
}
