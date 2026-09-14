import { useEffect, useRef, useState } from "react";

import {
  AnalysisApiError,
  analyzeActionForecast,
  analyzeExact,
  type AnalysisResponse,
  type ExactActionForecastResponse,
  type ExactActionForecastResult,
  type ExactAnalysisResponse,
} from "../../api/analysis";
import {
  RESEARCH_DEFINITIONS,
  ResearchApiError,
  compareResearch,
  type ResearchComparisonResponse,
} from "../../api/research";
import type { SessionState } from "../../state/gameReducer";
import type { TableTarget } from "../../domain/events";
import { selectTableState } from "../../state/selectors";
import ShoeStatus from "../table/ShoeStatus";

type RequestStatus = "idle" | "updating" | "current" | "incomplete" | "unavailable";
type AnalysisSidebarProps = Readonly<{
  activeTarget?: TableTarget | null;
  state: SessionState;
}>;

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function exactResult(result: AnalysisResponse | null): ExactAnalysisResponse | null {
  if (!result || "scenarios" in result || result.method !== "exact") return null;
  return result;
}

function ForecastOutcomes({
  forecast,
  label,
}: Readonly<{ forecast: ExactActionForecastResult; label: string }>) {
  return (
    <article className="forecast-card" aria-label={`${label} forecast`}>
      <h4>{label}</h4>
      {forecast.status === "available" && forecast.outcomes ? (
        <dl className="forecast-probabilities">
          <div><dt>Win</dt><dd>{percentage(forecast.outcomes.win)}</dd></div>
          <div><dt>Push</dt><dd>{percentage(forecast.outcomes.push)}</dd></div>
          <div><dt>Loss</dt><dd>{percentage(forecast.outcomes.loss)}</dd></div>
        </dl>
      ) : (
        <p className="calm-status">
          {forecast.error?.message ?? "This hypothetical action is unavailable."}
        </p>
      )}
    </article>
  );
}

export default function AnalysisSidebar({ activeTarget = null, state }: AnalysisSidebarProps) {
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [forecastStatus, setForecastStatus] = useState<RequestStatus>("idle");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [forecasts, setForecasts] = useState<ExactActionForecastResponse | null>(null);
  const [research, setResearch] = useState<ResearchComparisonResponse | null>(null);
  const [analysisMessage, setAnalysisMessage] = useState("Waiting for an analyzable table state.");
  const [forecastMessage, setForecastMessage] = useState("Select a primary hand to calculate hypothetical outcomes.");
  const [researchMessage, setResearchMessage] = useState("Add an observation to calculate source-backed scores.");
  const controller = useRef<AbortController | null>(null);
  const forecastController = useRef<AbortController | null>(null);
  const requestIdentity = useRef(0);
  const forecastRequestIdentity = useRef(0);
  const sessionStarted = state.events.some((event) => event.type === "NEW_SHOE");
  const table = selectTableState(state);
  const userHands = state.configuration.userSeat === null
    ? []
    : table.playerHands[state.configuration.userSeat];
  const selectedUserHand = activeTarget?.kind === "player-hand" &&
      activeTarget.seat === state.configuration.userSeat
    ? userHands.find((hand) => hand.handId === activeTarget.handId) ?? null
    : userHands.length === 1
      ? userHands[0]
      : null;
  const userCards = selectedUserHand?.cards ?? [];
  const userHandCount = userHands.length;
  const analysisHandId = userHandCount > 1 ? selectedUserHand?.handId ?? null : null;
  const canRunExact = state.configuration.rules.decks !== null &&
    userCards.length >= 2 && table.dealerCards.length >= 1;
  const forecastHand = activeTarget?.kind === "player-hand" &&
      activeTarget.seat === state.configuration.userSeat
    ? userHands.find((hand) => hand.handId === activeTarget.handId) ?? null
    : null;
  const forecastHandId = forecastHand?.handId ?? null;
  const canRunForecast = state.configuration.rules.decks !== null &&
    state.configuration.userSeat !== null && forecastHand !== null &&
    forecastHand.cards.length >= 2 && table.dealerCards.length >= 1;

  useEffect(() => {
    requestIdentity.current += 1;
    const identity = requestIdentity.current;
    controller.current?.abort();

    if (!sessionStarted) {
      setStatus("idle");
      setAnalysis(null);
      setResearch(null);
      setAnalysisMessage("Waiting for an analyzable table state.");
      setResearchMessage("Add a player or select the dealer to begin observations.");
      return;
    }

    setStatus("updating");
    const timeout = window.setTimeout(() => {
      const nextController = new AbortController();
      controller.current = nextController;
      const analysisTarget: TableTarget | null = analysisHandId !== null &&
          state.configuration.userSeat !== null
        ? {
            kind: "player-hand",
            seat: state.configuration.userSeat,
            handId: analysisHandId,
          }
        : null;
      const exactRequest: Promise<AnalysisResponse | null> = canRunExact
        ? analyzeExact(state, nextController.signal, analysisTarget)
        : Promise.resolve(null);
      void Promise.allSettled([
        exactRequest,
        compareResearch(
          state,
          RESEARCH_DEFINITIONS.map((definition) => definition.id),
          true,
          nextController.signal,
          false,
          analysisTarget,
        ),
      ]).then(([analysisResult, researchResult]) => {
        if (identity !== requestIdentity.current || nextController.signal.aborted) return;

        if (analysisResult.status === "fulfilled" && analysisResult.value !== null) {
          setAnalysis(analysisResult.value);
          setStatus("current");
          setAnalysisMessage(
            "scenarios" in analysisResult.value
              ? "Exact reference has multiple explicit rule scenarios. Open advanced analysis for the unaggregated results."
              : "Exact finite-shoe reference returned by Python.",
          );
        } else if (analysisResult.status === "rejected") {
          setAnalysis(null);
          setStatus("unavailable");
          const error = analysisResult.reason as unknown;
          setAnalysisMessage(
            error instanceof AnalysisApiError
              ? `Analysis unavailable for the current state: ${error.message}`
              : "Analysis unavailable for the current state.",
          );
        } else {
          setAnalysis(null);
          setStatus("incomplete");
          setAnalysisMessage(
            userHandCount > 1 && analysisHandId === null
              ? "Select a specific primary hand to analyze its finite-shoe outcomes."
              : "Waiting for a known deck, two primary-hand cards, and a dealer observation.",
          );
        }

        if (researchResult.status === "fulfilled") {
          setResearch(researchResult.value);
          setResearchMessage("Current-state scores returned by the Python research engine.");
        } else {
          setResearch(null);
          const error = researchResult.reason as unknown;
          setResearchMessage(
            error instanceof ResearchApiError
              ? `Research scores unavailable: ${error.message}`
              : "Research scores unavailable for the current state.",
          );
        }
      });
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.current?.abort();
    };
  }, [analysisHandId, canRunExact, sessionStarted, state, userHandCount]);

  useEffect(() => {
    forecastRequestIdentity.current += 1;
    const identity = forecastRequestIdentity.current;
    forecastController.current?.abort();

    if (!sessionStarted || !canRunForecast ||
        state.configuration.userSeat === null || forecastHandId === null) {
      setForecastStatus(sessionStarted ? "incomplete" : "idle");
      setForecasts(null);
      setForecastMessage(
        forecastHandId === null
          ? "Select a primary hand to calculate its hypothetical outcomes."
          : "Waiting for a known deck, two selected-hand cards, and a dealer observation.",
      );
      return;
    }

    setForecastStatus("updating");
    const timeout = window.setTimeout(() => {
      const nextController = new AbortController();
      forecastController.current = nextController;
      const target = {
        kind: "player-hand" as const,
        seat: state.configuration.userSeat!,
        handId: forecastHandId,
      };
      void analyzeActionForecast(state, target, nextController.signal)
        .then((result) => {
          if (identity !== forecastRequestIdentity.current || nextController.signal.aborted) return;
          setForecasts(result);
          setForecastStatus("current");
          setForecastMessage("Exact hypothetical outcomes are current for the selected hand.");
        })
        .catch((error: unknown) => {
          if (identity !== forecastRequestIdentity.current || nextController.signal.aborted) return;
          setForecasts(null);
          setForecastStatus("unavailable");
          setForecastMessage(
            error instanceof AnalysisApiError
              ? `Hypothetical action forecasts are unavailable: ${error.message}`
              : "Hypothetical action forecasts are unavailable for the current state.",
          );
        });
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      forecastController.current?.abort();
    };
  }, [canRunForecast, forecastHandId, sessionStarted, state]);

  const exact = exactResult(analysis);
  const scores = Array.isArray(research?.scores) ? research.scores : [];
  const aceInformation = scores
    .map((score) => score.ace_information)
    .find((item) => item !== null) ?? null;
  const statusText: Record<RequestStatus, string> = {
    idle: "Awaiting table state",
    updating: "Updating from Python…",
    current: "Analysis current",
    incomplete: "Analysis needs more observations",
    unavailable: "Analysis unavailable",
  };

  return (
    <aside className="workspace-panel analysis-sidebar" aria-labelledby="analysis-sidebar-title">
      <div className="workspace-panel__heading">
        <div>
          <p className="eyebrow">Automatic interpretation</p>
          <h2 id="analysis-sidebar-title">Analysis</h2>
        </div>
        <span className="panel-icon" aria-hidden="true">∑</span>
      </div>

      <div className="analysis-update-status" role="status" aria-live="polite" aria-atomic="true">
        <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
        {statusText[status]}
      </div>

      <section className="analysis-block exact-reference" aria-labelledby="exact-reference-title">
        <div className="analysis-block__title">
          <div><span className="analysis-kicker">Exact reference</span><h3 id="exact-reference-title">Finite-shoe outcomes</h3></div>
          <span className="method-badge">Exact</span>
        </div>
        {exact ? (
          <dl className="probability-list">
            <div className="probability probability--win"><dt>Win</dt><progress aria-label="Exact win probability" aria-valuetext={percentage(exact.outcomes.win)} max={1} value={exact.outcomes.win} /><dd>{percentage(exact.outcomes.win)}</dd></div>
            <div className="probability probability--push"><dt>Push</dt><progress aria-label="Exact push probability" aria-valuetext={percentage(exact.outcomes.push)} max={1} value={exact.outcomes.push} /><dd>{percentage(exact.outcomes.push)}</dd></div>
            <div className="probability probability--loss"><dt>Loss</dt><progress aria-label="Exact loss probability" aria-valuetext={percentage(exact.outcomes.loss)} max={1} value={exact.outcomes.loss} /><dd>{percentage(exact.outcomes.loss)}</dd></div>
          </dl>
        ) : <p className="calm-status">{analysisMessage}</p>}
      </section>

      <section
        className="analysis-block action-forecast"
        aria-labelledby="action-forecast-title"
        aria-busy={forecastStatus === "updating"}
      >
        <div className="analysis-block__title">
          <div>
            <span className="analysis-kicker">Hypothetical action forecast</span>
            <h3 id="action-forecast-title">Selected-hand outcomes</h3>
          </div>
          <span className="method-badge">Exact finite-shoe</span>
        </div>
        <p className="forecast-explanation">
          These are modeled outcomes for separate hypothetical actions on the selected hand.
        </p>
        {forecastStatus === "updating" ? (
          <p className="calm-status" role="status">Calculating exact hypothetical outcomes...</p>
        ) : forecasts ? (
          <div className="forecast-list">
            <ForecastOutcomes
              forecast={forecasts.action_forecasts.stand_now}
              label="Stand now"
            />
            <ForecastOutcomes
              forecast={forecasts.action_forecasts.hit_once_then_stand}
              label="Hit once, then stand"
            />
          </div>
        ) : (
          <p className="calm-status">{forecastMessage}</p>
        )}
      </section>

      <section className="analysis-block research-current" aria-labelledby="research-current-title">
        <div className="analysis-block__title">
          <div><span className="analysis-kicker">Source-backed</span><h3 id="research-current-title">Research systems</h3></div>
        </div>
        <div className="research-score-list">
          {RESEARCH_DEFINITIONS.map((summary) => {
            const score = scores.find((item) => item.definition.identifier === summary.id);
            return (
              <article className="research-score-card" key={summary.id}>
                <div><h4>{summary.label}</h4><span>{score ? (score.complete ? "Complete" : "Incomplete") : "Pending"}</span></div>
                <p className="research-score-value">{score?.raw_score_fraction ?? "—"}</p>
                <small>{score ? `Raw research score · PE ${score.definition.published_metrics.pe.toFixed(2)} · BC ${score.definition.published_metrics.bc.toFixed(2)} · IC ${score.definition.published_metrics.ic.toFixed(2)}` : "Awaiting Python research response"}</small>
              </article>
            );
          })}
        </div>
        {!research && <p className="calm-status">{researchMessage}</p>}
      </section>

      <section className="analysis-block ace-information" aria-labelledby="ace-information-title">
        <div className="analysis-block__title"><div><span className="analysis-kicker">Auxiliary feature</span><h3 id="ace-information-title">Ace Information</h3></div></div>
        {aceInformation ? (
          <dl className="ace-facts">
            <div><dt>Known aces observed</dt><dd>{aceInformation.known_aces_observed}</dd></div>
            <div><dt>Exact aces remaining</dt><dd>{aceInformation.exact_aces_remaining ?? "Unavailable"}</dd></div>
          </dl>
        ) : <p className="calm-status">Separate ace information is unavailable for the current state.</p>}
      </section>

      <section className="analysis-block table-information" aria-labelledby="table-information-title">
        <div className="analysis-block__title"><div><span className="analysis-kicker">Current session</span><h3 id="table-information-title">Table Information</h3></div></div>
        <ShoeStatus state={state} />
      </section>
    </aside>
  );
}
