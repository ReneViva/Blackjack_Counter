import { useCallback, useEffect, useRef, useState } from "react";

import { getHealth } from "./api/health";
import "./app.css";

type ConnectionState = "loading" | "connected" | "unavailable";

export default function App() {
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

  return (
    <main className="app-shell">
      <section className="status-card" aria-labelledby="app-title">
        <p className="eyebrow">Educational simulation</p>
        <h1 id="app-title">Blackjack Probability Lab</h1>
        <p className="summary">
          The project foundation is ready for future, Python-powered blackjack
          analysis.
        </p>

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
        </div>

        {connectionState === "unavailable" && (
          <button type="button" onClick={checkConnection}>
            Retry connection
          </button>
        )}
      </section>
    </main>
  );
}
