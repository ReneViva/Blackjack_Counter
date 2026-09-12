import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { getHealth } from "./api/health";
import ReplayControls from "./components/replay/ReplayControls";
import SetupPage from "./pages/SetupPage";
import TablePage from "./pages/TablePage";
import { gameReducer } from "./state/gameReducer";
import { createInitialState } from "./state/initialState";
import "./app.css";

type ConnectionState = "loading" | "connected" | "unavailable";

export default function App() {
  const [session, dispatch] = useReducer(gameReducer, undefined, createInitialState);
  const [connectionState, setConnectionState] = useState<ConnectionState>("loading");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const requestController = useRef<AbortController | null>(null);

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
