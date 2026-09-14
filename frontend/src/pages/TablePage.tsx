import { useEffect, useState, type Dispatch } from "react";

import AnalysisPanel from "../components/analysis/AnalysisPanel";
import AnalysisSidebar from "../components/analysis/AnalysisSidebar";
import CardPicker from "../components/cards/CardPicker";
import ResearchPanel from "../components/research/ResearchPanel";
import BlackjackTable from "../components/table/BlackjackTable";
import EventHistory from "../components/table/EventHistory";
import PlayerActions from "../components/table/PlayerActions";
import {
  getPlayerActions,
  type LegalAction,
} from "../api/playerActions";
import type { SessionAction, TableTarget } from "../domain/events";
import type { SessionState } from "../state/gameReducer";
import { splitChildHandIds } from "../domain/hands";
import { selectTableState } from "../state/selectors";

type TablePageProps = Readonly<{
  dispatch: Dispatch<SessionAction>;
  state: SessionState;
}>;

export default function TablePage({ dispatch, state }: TablePageProps) {
  const [activeTarget, setActiveTarget] = useState<TableTarget | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<Extract<
    TableTarget,
    { kind: "player-hand" }
  > | null>(null);
  const [legalityResult, setLegalityResult] = useState<Readonly<{
    action: LegalAction;
    handId: string;
    seat: number;
    state: SessionState;
  }> | null>(null);
  const table = selectTableState(state);
  const sessionStarted = state.events.some((event) => event.type === "NEW_SHOE");
  const splitLegality = activeTarget?.kind === "player-hand" &&
      legalityResult?.state === state &&
      legalityResult.seat === activeTarget.seat &&
      legalityResult.handId === activeTarget.handId
    ? legalityResult.action
    : null;
  const legalityLoading = activeTarget?.kind === "player-hand" &&
    splitLegality === null;

  useEffect(() => {
    if (activeTarget?.kind === "player-hand" &&
        !table.playerHands[activeTarget.seat].some(
          (hand) => hand.handId === activeTarget.handId,
        )) {
      setActiveTarget(null);
    }
  }, [activeTarget, table.playerHands]);

  useEffect(() => {
    if (analysisTarget && (
      analysisTarget.seat !== state.configuration.userSeat ||
      !table.playerHands[analysisTarget.seat].some(
        (hand) => hand.handId === analysisTarget.handId,
      )
    )) {
      setAnalysisTarget(null);
    }
  }, [analysisTarget, state.configuration.userSeat, table.playerHands]);

  useEffect(() => {
    if (activeTarget?.kind !== "player-hand") {
      setLegalityResult(null);
      return;
    }
    const controller = new AbortController();
    const target = activeTarget;
    void getPlayerActions(state, activeTarget, controller.signal)
      .then((actions) => setLegalityResult({
        action: actions.split,
        handId: target.handId,
        seat: target.seat,
        state,
      }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLegalityResult({
          action: {
            allowed: false,
            code: "backend_unavailable",
            reason: "Python split eligibility is unavailable.",
          },
          handId: target.handId,
          seat: target.seat,
          state,
        });
      });
    return () => controller.abort();
  }, [activeTarget, state]);

  return (
    <div className="table-page">
      <section className="primary-workspace" aria-label="Blackjack probability workspace">
        <AnalysisSidebar activeTarget={analysisTarget} state={state} />

        <section className="table-workspace" aria-label="Blackjack table workspace">
          <BlackjackTable
            activeSeats={state.configuration.activeSeats}
            activeTarget={activeTarget}
            onAddPlayer={(seat) => {
              dispatch({ type: "ADD_PLAYER", seat });
              const target = {
                kind: "player-hand",
                seat,
                handId: `seat-${seat}-hand-1`,
              } as const;
              setActiveTarget(target);
              if (state.configuration.userSeat === null &&
                  state.configuration.activeSeats.length === 0) {
                setAnalysisTarget(target);
              }
            }}
            onSelectTarget={(target) => {
              setActiveTarget(target);
              if (target.kind === "player-hand" &&
                  target.seat === state.configuration.userSeat) {
                setAnalysisTarget(target);
              }
            }}
            table={table}
            userSeat={state.configuration.userSeat}
          />

          {activeTarget?.kind === "player-hand" && (
            <PlayerActions
              target={activeTarget}
              split={splitLegality}
              loading={legalityLoading}
              onSplit={() => {
                if (!splitLegality?.allowed) return;
                const source = table.playerHands[activeTarget.seat].find(
                  (hand) => hand.handId === activeTarget.handId,
                );
                if (!source) return;
                const [leftHandId, rightHandId] = splitChildHandIds(source.handId);
                const fromSplitAces = source.fromSplitAces || (
                  source.cards[0]?.kind === "known" &&
                  source.cards[0].rank === "A"
                );
                dispatch({
                  type: "SPLIT_PLAYER_HAND",
                  seat: activeTarget.seat,
                  handId: source.handId,
                  leftHandId,
                  rightHandId,
                  splitDepth: source.splitDepth + 1,
                  fromSplitAces,
                });
                setActiveTarget({
                  kind: "player-hand",
                  seat: activeTarget.seat,
                  handId: leftHandId,
                });
                if (activeTarget.seat === state.configuration.userSeat) {
                  setAnalysisTarget({
                    kind: "player-hand",
                    seat: activeTarget.seat,
                    handId: leftHandId,
                  });
                }
              }}
              onLeave={() => {
                dispatch({ type: "LEAVE_PLAYER", seat: activeTarget.seat });
                setActiveTarget(null);
                if (analysisTarget?.seat === activeTarget.seat) {
                  setAnalysisTarget(null);
                }
              }}
            />
          )}

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
                  setAnalysisTarget(null);
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
