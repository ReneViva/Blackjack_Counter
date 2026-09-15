import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { getHealth } from "./api/health";
import { validateSessionState } from "./api/validation";
import ReplayControls from "./components/replay/ReplayControls";
import SetupPage from "./pages/SetupPage";
import TablePage from "./pages/TablePage";
import { gameReducer, type SessionState } from "./state/gameReducer";
import { createInitialState } from "./state/initialState";
import { DEFAULT_CONFIGURATION } from "./state/initialState";
import {
  loadDevicePreferences,
  saveDevicePreferences,
} from "./state/preferences";
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

function freshSession() {
  const preferredDeckCount = loadDevicePreferences().preferredDeckCount;
  return createInitialState({
    ...DEFAULT_CONFIGURATION,
    rules: {
      ...DEFAULT_CONFIGURATION.rules,
      decks: preferredDeckCount ?? DEFAULT_CONFIGURATION.rules.decks,
    },
  });
}

function initializeSession(): InitialSession {
  try {
    const restored = browserSessionPersistence.load();
    return restored === null
      ? {
          session: freshSession(),
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
      session: freshSession(),
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
  const settingsTrigger = useRef<HTMLButtonElement | null>(null);
  const settingsDialog = useRef<HTMLElement | null>(null);
  const settingsClose = useRef<HTMLButtonElement | null>(null);
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

  useEffect(() => {
    if (!settingsOpen) return;
    settingsClose.current?.focus();
    return () => settingsTrigger.current?.focus();
  }, [settingsOpen]);

  const sessionStarted = session.events.some((event) => event.type === "NEW_SHOE");

  const newSession = () => {
    if (sessionStarted && !window.confirm("Start a new empty session? The current event chronology will be cleared.")) return;
    dispatch({ type: "RESET", configuration: freshSession().configuration });
  };

  const closeSettings = () => setSettingsOpen(false);

  const handleSettingsKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSettings();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [...(settingsDialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? [])].filter((element) => !element.hidden);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to blackjack workspace</a>
      <header className="app-header">
        <div className="brand-block">
          <p className="eyebrow">Educational simulation</p>
          <h1 id="app-title">Blackjack Probability Lab</h1>
          <p className="brand-subtitle">Learn <span>◆</span> Analyze <span>◆</span> Explore</p>
        </div>

        <div className="header-command-bar">
          <div className={`connection connection--${connectionState}`}>
            <span className="connection__indicator" aria-hidden="true" />
            <div>
              <div className="connection__state" role="status" aria-live="polite" aria-atomic="true">
                <strong>{connectionState === "connected" ? "Ready" : connectionState === "loading" ? "Connecting" : "Offline"}</strong>
                <p>
                  {connectionState === "loading" && "Checking backend connection…"}
                  {connectionState === "connected" && (sessionStarted ? "Backend connected · Table editing available" : "Backend connected · Create a hand or import a session")}
                  {connectionState === "unavailable" && <><span>Backend unavailable</span><span> · Local table editing remains available</span></>}
                </p>
              </div>
              {persistenceNotice && (
                <small
                  role={persistenceNotice.tone === "warning" ? "alert" : "status"}
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
          <button ref={settingsTrigger} type="button" className="settings-button" aria-label="Open table settings" aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}><span aria-hidden="true">⚙</span></button>
        </div>
      </header>

      <main id="main-content" className="app-main" tabIndex={-1}>
        <TablePage state={session} dispatch={dispatch} />
      </main>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeSettings();
        }}>
          <section ref={settingsDialog} className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" aria-describedby="settings-description" onKeyDown={handleSettingsKeyDown}>
            <div className="settings-dialog__header">
              <div><p className="eyebrow">Session configuration</p><h2 id="settings-title">Table settings</h2></div>
              <button ref={settingsClose} type="button" className="close-button" aria-label="Close table settings" onClick={closeSettings}>×</button>
            </div>
            <p id="settings-description" className="visually-hidden">Configure session rules and seats. Press Escape to close this dialog.</p>
            <SetupPage
              configuration={session.configuration}
              disabled={sessionStarted}
              onChange={(configuration) => {
                if (configuration.rules.decks !== null &&
                    configuration.rules.decks !== session.configuration.rules.decks) {
                  saveDevicePreferences({
                    ...loadDevicePreferences(),
                    preferredDeckCount: configuration.rules.decks,
                  });
                }
                dispatch({ type: "CONFIGURE_SESSION", configuration });
              }}
              onStart={() => {
                dispatch({ type: "NEW_SHOE" });
                closeSettings();
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
