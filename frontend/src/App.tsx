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
  const [session, dispatch] = useReducer(
    gameReducer,
    undefined,
    createInitialState,
  );
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("loading");
  const requestController = useRef<AbortController | null>(null);

  const checkConnection = useCallback(() => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setConnectionState("loading");

    void getHealth(controller.signal)
      .then(() => setConnectionState("connected"))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setConnectionState("unavailable");
      });
  }, []);

  useEffect(() => {
    checkConnection();
    return () => requestController.current?.abort();
  }, [checkConnection]);

  const sessionStarted = session.events.some(
    (event) => event.type === "NEW_SHOE",
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Educational simulation</p>
          <h1 id="app-title">Blackjack Probability Lab</h1>
        </div>
        <div className={`connection connection--${connectionState}`} role="status">
          <span className="connection__indicator" aria-hidden="true" />
          <div>
            <strong>Analysis service</strong>
            <p>
              {connectionState === "loading" && "Checking backend connection…"}
              {connectionState === "connected" && "Backend connected"}
              {connectionState === "unavailable" && "Backend unavailable"}
            </p>
          </div>
          {connectionState === "unavailable" && (
            <button type="button" onClick={checkConnection}>
              Retry connection
            </button>
          )}
        </div>
      </header>

      <ReplayControls
        state={session}
        onActivate={(candidate) => dispatch({
          type: "IMPORT_REPLAY",
          configuration: candidate.configuration,
          events: candidate.events,
        })}
      />

      {sessionStarted ? (
        <TablePage state={session} dispatch={dispatch} />
      ) : (
        <SetupPage
          configuration={session.configuration}
          onChange={(configuration) =>
            dispatch({ type: "CONFIGURE_SESSION", configuration })
          }
          onStart={() => dispatch({ type: "NEW_SHOE" })}
        />
      )}
    </main>
  );
}
