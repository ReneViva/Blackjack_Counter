import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { getHealth } from "./api/health";
import { validateSessionState } from "./api/validation";
import ReplayControls from "./components/replay/ReplayControls";
import SetupPage from "./pages/SetupPage";
import TablePage from "./pages/TablePage";
import { gameReducer, type SessionState } from "./state/gameReducer";
import { createInitialState } from "./state/initialState";
import {
  browserSessionPersistence,
  SessionPersistenceError,
} from "./state/persistence";
import "./app.css";

type ConnectionState = "loading" | "connected" | "unavailable";
type PersistenceNotice = Readonly<{
  code: string;
  message: string;
  tone: "success" | "warning";
}>;

type InitialSession = Readonly<{
  session: SessionState;
  restored: boolean;
  removeCorruptStorage: boolean;
  notice: PersistenceNotice | null;
}>;

function initializeSession(): InitialSession {
  try {
    const restored = browserSessionPersistence.load();
    return restored === null
      ? {
          session: createInitialState(),
          restored: false,
          removeCorruptStorage: false,
          notice: null,
        }
      : {
          session: restored,
          restored: true,
          removeCorruptStorage: false,
          notice: {
            code: "session_restored",
            message: "Restored locally",
            tone: "success",
          },
        };
  } catch (error: unknown) {
    const persistenceError = error instanceof SessionPersistenceError ? error : null;
    return {
      session: createInitialState(),
      restored: false,
      removeCorruptStorage: persistenceError?.definitiveCorruption ?? false,
      notice: {
        code: persistenceError?.code ?? "storage_load_failed",
        message: persistenceError?.definitiveCorruption
          ? "Saved session could not be restored"
          : "Saved session could not be read locally",
        tone: "warning",
      },
    };
  }
}

export default function App() {
  const [initialSession] = useState(initializeSession);
  const [session, dispatch] = useReducer(gameReducer, initialSession.session);
  const [connectionState, setConnectionState] = useState<ConnectionState>("loading");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [persistenceNotice, setPersistenceNotice] = useState<PersistenceNotice | null>(
    initialSession.notice,
  );
  const requestController = useRef<AbortController | null>(null);
  const corruptStorageHandled = useRef(false);
  const lastPersistenceCandidate = useRef(session);
  const sessionRef = useRef(session);
  const suppressNextSave = useRef(false);
  sessionRef.current = session;

  const checkConnection = useCallback(() => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setConnectionState("loading");

    void getHealth(controller.signal)
      .then(() => setConnectionState("connected"))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setConnectionState("unavailable");
      });
  }, []);

  useEffect(() => {
    checkConnection();
    return () => requestController.current?.abort();
  }, [checkConnection]);

  useEffect(() => {
    if (!initialSession.removeCorruptStorage || corruptStorageHandled.current) return;
    corruptStorageHandled.current = true;
    try {
      browserSessionPersistence.clear();
    } catch (error: unknown) {
      const code = error instanceof SessionPersistenceError
        ? error.code
        : "storage_remove_failed";
      setPersistenceNotice({
        code,
        message: "Saved session could not be restored or removed",
        tone: "warning",
      });
    }
  }, [initialSession.removeCorruptStorage]);

  useEffect(() => {
    if (lastPersistenceCandidate.current === session) return;
    lastPersistenceCandidate.current = session;
    if (suppressNextSave.current) {
      suppressNextSave.current = false;
      return;
    }
    try {
      browserSessionPersistence.save(session);
      setPersistenceNotice({
        code: "session_saved",
        message: "Saved locally",
        tone: "success",
      });
    } catch (error: unknown) {
      setPersistenceNotice({
        code: error instanceof SessionPersistenceError
          ? error.code
          : "storage_write_failed",
        message: "Session could not be saved locally",
        tone: "warning",
      });
    }
  }, [session]);

  useEffect(() => {
    if (!initialSession.restored) return;
    const restoredSession = initialSession.session;
    const controller = new AbortController();
    void validateSessionState(restoredSession, controller.signal)
      .then((validation) => {
        if (validation.valid || sessionRef.current !== restoredSession) return;
        suppressNextSave.current = true;
        try {
          browserSessionPersistence.clear();
        } catch {
          // The in-memory fallback must remain usable even when storage removal fails.
        }
        dispatch({ type: "RESET" });
        setPersistenceNotice({
          code: validation.errors[0]?.code ?? "backend_invalid_persistence",
          message: "Saved session could not be restored",
          tone: "warning",
        });
      })
      .catch(() => {
        // A backend outage never invalidates locally reconstructed chronology.
      });
    return () => controller.abort();
  }, [initialSession]);

  const sessionStarted = session.events.some((event) => event.type === "NEW_SHOE");

  const newSession = () => {
    if (sessionStarted && !window.confirm("Start a new empty session? The current event chronology will be cleared.")) return;
    dispatch({ type: "RESET" });
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <p className="eyebrow">Educational simulation</p>
          <h1 id="app-title">Blackjack Probability Lab</h1>
          <p className="brand-subtitle">Learn <span>◆</span> Analyze <span>◆</span> Explore</p>
        </div>

        <div className="header-command-bar">
          <div className={`connection connection--${connectionState}`} role="status">
            <span className="connection__indicator" aria-hidden="true" />
            <div>
              <strong>{connectionState === "connected" ? "Ready" : connectionState === "loading" ? "Connecting" : "Offline"}</strong>
              <p>
                {connectionState === "loading" && "Checking backend connection…"}
                {connectionState === "connected" && (sessionStarted ? "Backend connected · Analysis current" : "Backend connected · Create a hand or import a session")}
                {connectionState === "unavailable" && "Backend unavailable"}
              </p>
              {persistenceNotice && (
                <small
                  aria-live="polite"
                  className={`persistence-status persistence-status--${persistenceNotice.tone}`}
                  data-persistence-code={persistenceNotice.code}
                >
                  {persistenceNotice.message}
                </small>
              )}
            </div>
            {connectionState === "unavailable" && <button type="button" className="button-secondary" aria-label="Retry connection" onClick={checkConnection}>Retry</button>}
          </div>

          <ReplayControls
            state={session}
            onActivate={(candidate) => dispatch({
              type: "IMPORT_REPLAY",
              configuration: candidate.configuration,
              events: candidate.events,
            })}
          />
          <button type="button" className="header-action" onClick={newSession}><span aria-hidden="true">□</span> New Session</button>
          <button type="button" className="settings-button" aria-label="Open table settings" onClick={() => setSettingsOpen(true)}><span aria-hidden="true">⚙</span></button>
        </div>
      </header>

      <TablePage state={session} dispatch={dispatch} />

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="settings-dialog__header">
              <div><p className="eyebrow">Session configuration</p><h2 id="settings-title">Table settings</h2></div>
              <button type="button" className="close-button" aria-label="Close table settings" onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <SetupPage
              configuration={session.configuration}
              disabled={sessionStarted}
              onChange={(configuration) => dispatch({ type: "CONFIGURE_SESSION", configuration })}
              onStart={() => {
                dispatch({ type: "NEW_SHOE" });
                setSettingsOpen(false);
              }}
            />
          </section>
        </div>
      )}
    </main>
  );
}
