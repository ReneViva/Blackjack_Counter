import { useEffect, useState, type Dispatch } from "react";

import AnalysisPanel from "../components/analysis/AnalysisPanel";
import AnalysisSidebar from "../components/analysis/AnalysisSidebar";
import CardPicker from "../components/cards/CardPicker";
import ResearchPanel from "../components/research/ResearchPanel";
import BlackjackTable from "../components/table/BlackjackTable";
import EventHistory from "../components/table/EventHistory";
import type { SessionAction, TableTarget } from "../domain/events";
import type { SessionState } from "../state/gameReducer";
import { selectTableState } from "../state/selectors";

type TablePageProps = Readonly<{
  dispatch: Dispatch<SessionAction>;
  state: SessionState;
}>;

export default function TablePage({ dispatch, state }: TablePageProps) {
  const [activeTarget, setActiveTarget] = useState<TableTarget | null>(null);
  const table = selectTableState(state);
  const sessionStarted = state.events.some((event) => event.type === "NEW_SHOE");

  useEffect(() => {
    if (activeTarget?.kind === "player" &&
        !state.configuration.activeSeats.includes(activeTarget.seat)) {
      setActiveTarget(null);
    }
  }, [activeTarget, state.configuration.activeSeats]);

  return (
    <div className="table-page">
      <section className="primary-workspace" aria-label="Blackjack probability workspace">
        <AnalysisSidebar state={state} />

        <section className="table-workspace" aria-label="Blackjack table workspace">
          <BlackjackTable
            activeSeats={state.configuration.activeSeats}
            activeTarget={activeTarget}
            onAddPlayer={(seat) => {
              dispatch({ type: "ADD_PLAYER", seat });
              setActiveTarget({ kind: "player", seat });
            }}
            onSelectTarget={setActiveTarget}
            table={table}
            userSeat={state.configuration.userSeat}
          />

          <div className="table-control-strip" aria-label="Table session controls">
            <div>
              <span className="control-strip-icon" aria-hidden="true">↶</span>
              <div><strong>Session controls</strong><small>Correct observations through event chronology</small></div>
            </div>
            <div className="table-control-actions">
              <button
                type="button"
                className="button-secondary"
                disabled={state.events.length === 0}
                onClick={() => dispatch({ type: "UNDO" })}
              >
                Undo
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={!sessionStarted}
                onClick={() => dispatch({ type: "ROUND_COMPLETE" })}
              >
                Complete round
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={!sessionStarted}
                onClick={() => dispatch({ type: "SHUFFLE" })}
              >
                Record shuffle
              </button>
              <button
                type="button"
                className="button-danger"
                disabled={!sessionStarted}
                onClick={() => {
                  if (window.confirm("Clear this session and return to an empty table?")) {
                    dispatch({ type: "RESET" });
                    setActiveTarget(null);
                  }
                }}
              >
                Clear table
              </button>
            </div>
          </div>
        </section>

        <CardPicker
          activeTarget={activeTarget}
          decks={state.configuration.rules.decks}
          onKnownCard={(target, card) =>
            dispatch({ type: "DEAL_KNOWN_CARD", target, card })
          }
          onUnknownCard={(target) =>
            dispatch({ type: "DEAL_UNKNOWN_CARD", target })
          }
          table={table}
        />
      </section>

      <details className="advanced-workspace">
        <summary>Advanced analysis, Monte Carlo, research experiments, and history</summary>
        <div className="advanced-workspace__content">
          <AnalysisPanel state={state} />
          <ResearchPanel state={state} />
          <EventHistory events={state.events} />
        </div>
      </details>
    </div>
  );
}
