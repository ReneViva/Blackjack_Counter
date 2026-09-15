import { useEffect, useRef, useState } from "react";

import {
  AnalysisApiError,
  analyzeActionForecast,
  analyzeExact,
  analyzeHandSummaries,
  type ActionForecastResponse,
  type AnalysisResponse,
  type ExactActionForecastScenarioAnalysisResponse,
  type ExactActionForecastResult,
  type ExactAnalysisResponse,
  type HandSummariesResponse,
  type ExactSplitActionForecastResult,
  type ExactTerminalActionForecastResult,
  type OutcomeProbabilities,
  type OutcomeRanges,
  type ScenarioAnalysisResponse,
  type UniformActionDeckCountSummary,
  type UniformActionSummary,
  type UniformDeckCountSummary,
} from "../../api/analysis";
import {
  RESEARCH_DEFINITIONS,
  ResearchApiError,
  compareResearch,
  type ResearchComparisonResponse,
} from "../../api/research";
import type { SessionState } from "../../state/gameReducer";
import type { TableTarget } from "../../domain/events";
import type { SeatNumber } from "../../domain/game";
import type { WorkspaceMode } from "../../domain/workspace";
import { selectTableState } from "../../state/selectors";
import {
  ResearchComparisonTable,
  ResearchSystemCards,
  ResearchSystemSummaryRows,
} from "../research/ResearchInterpretation";
import ShoeStatus from "../table/ShoeStatus";

type RequestStatus = "idle" | "updating" | "current" | "incomplete" | "unavailable";
export const ANALYSIS_DEBOUNCE_MS = 220;
type AnalysisSidebarProps = Readonly<{
  activeTarget?: TableTarget | null;
  onSelectAnalysisTarget?: (
    target: Extract<TableTarget, { kind: "player-hand" }>,
  ) => void;
  state: SessionState;
  workspaceMode?: WorkspaceMode;
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
        <ForecastProbabilityList outcomes={forecast.outcomes} />
      ) : (
        <p className="calm-status">
          <strong>Unavailable.</strong>{" "}
          {forecast.error?.message ?? "This hypothetical action is unavailable."}
        </p>
      )}
    </article>
  );
}

function ForecastProbabilityList({ outcomes }: Readonly<{
  outcomes: OutcomeProbabilities;
}>) {
  return (
    <dl className="forecast-probabilities">
      <div><dt>Win</dt><dd>{percentage(outcomes.win)}</dd></div>
      <div><dt>Push</dt><dd>{percentage(outcomes.push)}</dd></div>
      <div><dt>Loss</dt><dd>{percentage(outcomes.loss)}</dd></div>
    </dl>
  );
}

function TerminalForecast({ forecast }: Readonly<{
  forecast: ExactTerminalActionForecastResult;
}>) {
  return (
    <article className="forecast-card" aria-label="Surrender now forecast">
      <h4>Surrender now</h4>
      {forecast.status === "available" && forecast.terminal === "surrendered" ? (
        <>
          <dl className="forecast-terminal">
            <div><dt>Terminal outcome</dt><dd>Surrendered</dd></div>
          </dl>
          <p className="forecast-note">No further cards are drawn.</p>
        </>
      ) : (
        <p className="calm-status">
          <strong>Unavailable.</strong>{" "}
          {forecast.error?.message ?? "Surrender is unavailable."}
        </p>
      )}
    </article>
  );
}

function SplitForecast({ forecast }: Readonly<{
  forecast: ExactSplitActionForecastResult;
}>) {
  return (
    <article className="forecast-card forecast-card--split" aria-label="Split one card to each hand, then stand forecast">
      <h4>Split — one card to each hand, then stand</h4>
      {forecast.status === "available" && forecast.child_hand_1 && forecast.child_hand_2 ? (
        <div className="forecast-split-children">
          <section aria-label="Split child hand 1">
            <h5>Hand 1</h5>
            <ForecastProbabilityList outcomes={forecast.child_hand_1} />
          </section>
          <section aria-label="Split child hand 2">
            <h5>Hand 2</h5>
            <ForecastProbabilityList outcomes={forecast.child_hand_2} />
          </section>
        </div>
      ) : (
        <p className="calm-status">
          <strong>Unavailable.</strong>{" "}
          {forecast.error?.message ?? "Split is unavailable."}
        </p>
      )}
    </article>
  );
}

function ModelProbabilityList({ outcomes, ranges }: Readonly<{
  outcomes: OutcomeProbabilities;
  ranges: OutcomeRanges;
}>) {
  const items = ["win", "push", "loss"] as const;
  return <dl className="forecast-probabilities model-probabilities">{items.map((outcome) => <div key={outcome}><dt>{outcome[0].toUpperCase() + outcome.slice(1)}</dt><dd>{percentage(outcomes[outcome])}<small>Model range {percentage(ranges[outcome].minimum)}–{percentage(ranges[outcome].maximum)}</small></dd></div>)}</dl>;
}

function DeckSummaryMetadata({ summary }: Readonly<{
  summary: UniformDeckCountSummary | UniformActionDeckCountSummary;
}>) {
  return <>
    <p className="forecast-note">Equal-weight assumption across valid deck counts.</p>
    <p className="forecast-note">Valid deck scenarios: {summary.included_deck_counts.length} / {summary.candidate_deck_counts.length} · Included: {summary.included_deck_counts.join(", ") || "none"}</p>
    {summary.excluded_deck_counts.length > 0 && <ul className="model-exclusions">{summary.excluded_deck_counts.map((item) => <li key={item.deck_count}>{item.deck_count} deck{item.deck_count === 1 ? "" : "s"} excluded — {item.message}</li>)}</ul>}
  </>;
}

function ExactDeckSummary({ analysis }: Readonly<{ analysis: ScenarioAnalysisResponse }>) {
  const summaries = analysis.deck_count_summaries ?? [];
  return <div className="deck-summary-list">{summaries.map((summary) => <section className="deck-model-summary" key={summary.dealer_soft_17} aria-label={`${summary.dealer_soft_17.toUpperCase()} uniform deck-count summary`}>
    <h4>{summary.dealer_soft_17.toUpperCase()} · Uniform deck-count summary</h4>
    <DeckSummaryMetadata summary={summary} />
    {summary.status === "available" && summary.outcomes && summary.ranges ? <><ModelProbabilityList outcomes={summary.outcomes} ranges={summary.ranges} /><p className="forecast-note">Range across valid deck-count models.</p></> : <p className="calm-status"><strong>Unavailable.</strong> {summary.error?.message}</p>}
    <details><summary>Show deck scenarios</summary><div className="scenario-rows">{analysis.scenarios.filter((scenario) => scenario.assumptions.dealer_soft_17 === summary.dealer_soft_17).map((scenario) => <article key={scenario.assumptions.decks}><h5>{scenario.assumptions.decks} deck{scenario.assumptions.decks === 1 ? "" : "s"} · Exact finite-shoe</h5>{scenario.status === "complete" && scenario.result?.method === "exact" ? <ForecastProbabilityList outcomes={scenario.result.outcomes} /> : <p className="calm-status">{scenario.status === "invalid" ? "Excluded" : "Unavailable"}: {scenario.error?.message}</p>}</article>)}</div></details>
  </section>)}</div>;
}

function UniformOutcomeForecast({ forecast, label }: Readonly<{
  forecast: UniformActionSummary;
  label: string;
}>) {
  return <article className="forecast-card" aria-label={`${label} uniform deck-count summary`}><h5>{label}</h5>{forecast.status === "available" && forecast.outcomes && forecast.ranges ? <ModelProbabilityList outcomes={forecast.outcomes} ranges={forecast.ranges} /> : <p className="calm-status"><strong>Unavailable.</strong> {forecast.error?.message}</p>}</article>;
}

function UniformSplitForecast({ forecast }: Readonly<{ forecast: UniformActionSummary }>) {
  return <article className="forecast-card forecast-card--split" aria-label="Split uniform deck-count summary"><h5>Split — one card to each hand, then stand</h5>{forecast.status === "available" && forecast.child_hand_1 && forecast.child_hand_2 ? <div className="forecast-split-children"><section aria-label="Split child hand 1 summary"><h6>Child Hand 1</h6><ModelProbabilityList outcomes={forecast.child_hand_1.outcomes} ranges={forecast.child_hand_1.ranges} /></section><section aria-label="Split child hand 2 summary"><h6>Child Hand 2</h6><ModelProbabilityList outcomes={forecast.child_hand_2.outcomes} ranges={forecast.child_hand_2.ranges} /></section></div> : <p className="calm-status"><strong>Unavailable.</strong> {forecast.error?.message}</p>}</article>;
}

function ActionScenarioDetails({ forecasts, rule }: Readonly<{
  forecasts: ExactActionForecastScenarioAnalysisResponse;
  rule: "hit" | "stand";
}>) {
  return <details><summary>Show deck scenarios</summary><div className="scenario-rows">{forecasts.scenarios.filter((scenario) => scenario.assumptions.dealer_soft_17 === rule).map((scenario) => <article key={scenario.assumptions.decks}><h5>{scenario.assumptions.decks} deck{scenario.assumptions.decks === 1 ? "" : "s"} · Exact finite-shoe</h5>{scenario.status === "complete" && scenario.result ? <div className="forecast-list"><ForecastOutcomes forecast={scenario.result.action_forecasts.stand_now} label="Stand now" /><ForecastOutcomes forecast={scenario.result.action_forecasts.hit_once_then_stand} label="Hit once, then stand" /><ForecastOutcomes forecast={scenario.result.action_forecasts.double_one_card_then_stand} label="Double — one card, then stand" /><TerminalForecast forecast={scenario.result.action_forecasts.surrender_now} /><SplitForecast forecast={scenario.result.action_forecasts.split_one_card_each_then_stand} /></div> : <p className="calm-status">{scenario.status === "invalid" ? "Excluded" : "Unavailable"}: {scenario.error?.message}</p>}</article>)}</div></details>;
}

function ActionDeckSummaries({ forecasts }: Readonly<{
  forecasts: ExactActionForecastScenarioAnalysisResponse;
}>) {
  return <div className="deck-summary-list">{forecasts.deck_count_summaries.map((summary) => <section className="deck-model-summary" key={summary.dealer_soft_17} aria-label={`${summary.dealer_soft_17.toUpperCase()} action forecast deck-count summary`}><h4>{summary.dealer_soft_17.toUpperCase()} · Uniform deck-count summary</h4><DeckSummaryMetadata summary={summary} />{summary.status === "available" && summary.action_forecasts ? <div className="forecast-list"><UniformOutcomeForecast forecast={summary.action_forecasts.stand_now} label="Stand now" /><UniformOutcomeForecast forecast={summary.action_forecasts.hit_once_then_stand} label="Hit once, then stand" /><UniformOutcomeForecast forecast={summary.action_forecasts.double_one_card_then_stand} label="Double — one card, then stand" /><article className="forecast-card" aria-label="Surrender uniform deck-count summary"><h5>Surrender now</h5>{summary.action_forecasts.surrender_now.status === "available" && summary.action_forecasts.surrender_now.terminal === "surrendered" ? <><dl className="forecast-terminal"><div><dt>Terminal outcome</dt><dd>Surrendered</dd></div></dl><p className="forecast-note">No probability mean is assigned to this terminal action.</p></> : <p className="calm-status"><strong>Unavailable.</strong> {summary.action_forecasts.surrender_now.error?.message}</p>}</article><UniformSplitForecast forecast={summary.action_forecasts.split_one_card_each_then_stand} /></div> : <p className="calm-status"><strong>Unavailable.</strong> {summary.error?.message}</p>}<ActionScenarioDetails forecasts={forecasts} rule={summary.dealer_soft_17} /></section>)}</div>;
}

function SplitHandAnalysis({
  analysis,
  hands,
  message,
  onSelect,
  seat,
  selectedHandId,
  status,
}: Readonly<{
  analysis: HandSummariesResponse | null;
  hands: readonly Readonly<{ handId: string }>[];
  message: string;
  onSelect?: AnalysisSidebarProps["onSelectAnalysisTarget"];
  seat: SeatNumber;
  selectedHandId: string | null;
  status: RequestStatus;
}>) {
  const concreteHands = analysis && "hands" in analysis ? analysis.hands : [];
  const modelSummaries = analysis && "scenarios" in analysis
    ? analysis.deck_count_summaries
    : [];
  return (
    <section className="analysis-block split-hand-analysis" aria-labelledby="split-hand-analysis-title" aria-busy={status === "updating"}>
      <div className="analysis-block__title">
        <div><span className="analysis-kicker">Current split state</span><h3 id="split-hand-analysis-title">Split Hand Analysis — Seat {seat}</h3></div>
        <span className="method-badge">Exact</span>
      </div>
      <div className="split-summary-list">
        {hands.map((hand, index) => {
          const selected = hand.handId === selectedHandId;
          const concrete = concreteHands.find((item) => item.target.hand_id === hand.handId);
          const models = modelSummaries.filter((item) => item.target.hand_id === hand.handId);
          return (
            <article className={`split-summary${selected ? " split-summary--selected" : ""}`} key={hand.handId}>
              <button
                aria-label={`Select Hand ${index + 1} for analysis`}
                aria-pressed={selected}
                className="split-summary__select"
                onClick={() => onSelect?.({ kind: "player-hand", seat, handId: hand.handId })}
                type="button"
              >
                <span className="split-summary__heading"><strong>Hand {index + 1}</strong>{selected && <span>Selected</span>}</span>
              </button>
              {concrete?.status === "complete" && concrete.outcomes ? (
                <div className={status === "updating" ? "analysis-results--updating" : undefined}>
                  <ForecastProbabilityList outcomes={concrete.outcomes} />
                  {status === "updating" && (
                    <span className="split-summary__status">Updating exact outcomes…</span>
                  )}
                </div>
              ) : models.length > 0 ? (
                <span className={`split-summary__models${status === "updating" ? " analysis-results--updating" : ""}`}>
                  {models.map((model) => <span key={model.dealer_soft_17}>
                    {models.length > 1 && <strong>{model.dealer_soft_17.toUpperCase()}</strong>}
                    {model.status === "available" && model.outcomes && model.ranges ? <>
                      <ModelProbabilityList outcomes={model.outcomes} ranges={model.ranges} />
                      <small>Uniform summary across {model.included_deck_counts.length} valid deck-count models.</small>
                    </> : <span className="split-summary__status">{model.error?.message ?? "Model summary unavailable."}</span>}
                  </span>)}
                  {status === "updating" && (
                    <span className="split-summary__status">Updating exact outcomes…</span>
                  )}
                </span>
              ) : <span className="split-summary__status">{status === "updating" ? "Updating exact outcomes…" : concrete?.error?.message ?? message}</span>}
            </article>
          );
        })}
      </div>
      {selectedHandId && (
        <p className="forecast-note">
          Selected Hand {hands.findIndex((hand) => hand.handId === selectedHandId) + 1} feeds the hypothetical action forecast below.
        </p>
      )}
    </section>
  );
}

export default function AnalysisSidebar({
  activeTarget = null,
  onSelectAnalysisTarget,
  state,
  workspaceMode = "normal",
}: AnalysisSidebarProps) {
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [forecastStatus, setForecastStatus] = useState<RequestStatus>("idle");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [handSummaries, setHandSummaries] = useState<HandSummariesResponse | null>(null);
  const [forecasts, setForecasts] = useState<ActionForecastResponse | null>(null);
  const [forecastResultHandId, setForecastResultHandId] = useState<string | null>(null);
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
  const hasSplitHands = userHandCount > 1;
  const analysisHandId = selectedUserHand?.handId ?? null;
  const canRunExact = userCards.length >= 2 && table.dealerCards.length >= 1;
  const canRunHandSummaries = hasSplitHands && selectedUserHand !== null &&
    table.dealerCards.length >= 1 && userHands.some((hand) => hand.cards.length >= 2);
  const forecastHand = activeTarget?.kind === "player-hand" &&
      activeTarget.seat === state.configuration.userSeat
    ? userHands.find((hand) => hand.handId === activeTarget.handId) ?? null
    : null;
  const forecastHandId = forecastHand?.handId ?? null;
  const canRunForecast = state.configuration.userSeat !== null && forecastHand !== null &&
    forecastHand.cards.length >= 2 && table.dealerCards.length >= 1;

  useEffect(() => {
    requestIdentity.current += 1;
    const identity = requestIdentity.current;
    controller.current?.abort();

    if (!sessionStarted) {
      setStatus("idle");
      setAnalysis(null);
      setHandSummaries(null);
      setResearch(null);
      setAnalysisMessage("Waiting for an analyzable table state.");
      setResearchMessage("Add a player or select the dealer to begin observations.");
      return;
    }

    setStatus("updating");
    setAnalysisMessage(
      hasSplitHands ? "Updating all split-hand summaries." : "Updating exact outcomes.",
    );
    if (hasSplitHands) {
      setAnalysis(null);
    } else {
      setHandSummaries(null);
    }
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
      const exactRequest: Promise<AnalysisResponse | HandSummariesResponse | null> =
        hasSplitHands
          ? canRunHandSummaries && analysisTarget?.kind === "player-hand"
            ? analyzeHandSummaries(state, analysisTarget, nextController.signal)
            : Promise.resolve(null)
          : canRunExact
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
          if (analysisResult.value.method === "exact_hand_summaries") {
            setHandSummaries(analysisResult.value);
            setAnalysis(null);
            const available = "hands" in analysisResult.value
              ? analysisResult.value.hands.some((hand) => hand.status === "complete")
              : analysisResult.value.deck_count_summaries.some(
                  (summary) => summary.status === "available",
                );
            setStatus(available ? "current" : "unavailable");
            const firstError = "hands" in analysisResult.value
              ? analysisResult.value.hands.find((hand) => hand.error)?.error
              : analysisResult.value.deck_count_summaries.find(
                  (summary) => summary.error,
                )?.error;
            setAnalysisMessage(
              available
                ? "All split-hand exact summaries returned by Python."
                : firstError?.message ?? "Split-hand analysis is unavailable for the current state.",
            );
          } else {
            setAnalysis(analysisResult.value);
            setHandSummaries(null);
            setStatus("current");
            setAnalysisMessage(
              "scenarios" in analysisResult.value
                ? "Exact reference includes explicit model scenarios and a separate assumption-based deck-count summary."
                : "Exact finite-shoe reference returned by Python.",
            );
          }
        } else if (analysisResult.status === "rejected") {
          setAnalysis(null);
          setHandSummaries(null);
          setStatus("unavailable");
          const error = analysisResult.reason as unknown;
          setAnalysisMessage(
            error instanceof AnalysisApiError
              ? `Analysis unavailable for the current state: ${error.message}`
              : "Analysis unavailable for the current state.",
          );
        } else {
          setAnalysis(null);
          setHandSummaries(null);
          setStatus("incomplete");
          setAnalysisMessage(
            hasSplitHands && analysisHandId === null
              ? "The previous analysis target is no longer available. Select a split hand."
              : hasSplitHands
                ? "Waiting for a dealer observation and two cards on at least one split hand."
                : "Waiting for two primary-hand cards and a dealer observation.",
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
    }, ANALYSIS_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.current?.abort();
    };
  }, [analysisHandId, canRunExact, canRunHandSummaries, hasSplitHands, sessionStarted, state]);

  useEffect(() => {
    forecastRequestIdentity.current += 1;
    const identity = forecastRequestIdentity.current;
    forecastController.current?.abort();

    if (!sessionStarted || !canRunForecast ||
        state.configuration.userSeat === null || forecastHandId === null) {
      setForecastStatus(sessionStarted ? "incomplete" : "idle");
      setForecasts(null);
      setForecastResultHandId(null);
      setForecastMessage(
        forecastHandId === null
          ? "Select a primary hand to calculate its hypothetical outcomes."
          : "Waiting for two selected-hand cards and a dealer observation.",
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
          setForecastResultHandId(forecastHandId);
          setForecastStatus("current");
          setForecastMessage("Exact hypothetical outcomes are current for the selected hand.");
        })
        .catch((error: unknown) => {
          if (identity !== forecastRequestIdentity.current || nextController.signal.aborted) return;
          setForecasts(null);
          setForecastResultHandId(null);
          setForecastStatus("unavailable");
          setForecastMessage(
            error instanceof AnalysisApiError
              ? `Hypothetical action forecasts are unavailable: ${error.message}`
              : "Hypothetical action forecasts are unavailable for the current state.",
          );
        });
    }, ANALYSIS_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      forecastController.current?.abort();
    };
  }, [canRunForecast, forecastHandId, sessionStarted, state]);

  const exact = exactResult(analysis);
  const exactScenarios = analysis && "scenarios" in analysis && analysis.method === "exact"
    ? analysis
    : null;
  const scores = Array.isArray(research?.scores) ? research.scores : [];
  const aceInformation = scores
    .map((score) => score.ace_information)
    .find((item) => item !== null) ?? null;
  const displayedForecasts = forecastResultHandId === forecastHandId
    ? forecasts
    : null;
  const statusText: Record<RequestStatus, string> = {
    idle: "No analysis target",
    updating: "Updating from Python…",
    current: "Analysis current",
    incomplete: "Awaiting required observations",
    unavailable: "Analysis unavailable",
  };
  const proMode = workspaceMode === "pro";

  return (
    <aside
      className={`workspace-panel analysis-sidebar${proMode ? " analysis-sidebar--pro" : ""}`}
      aria-labelledby="analysis-sidebar-title"
      data-analysis-status={status}
    >
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

      {hasSplitHands && state.configuration.userSeat !== null ? (
        <SplitHandAnalysis
          analysis={handSummaries}
          hands={userHands}
          message={analysisMessage}
          onSelect={onSelectAnalysisTarget}
          seat={state.configuration.userSeat}
          selectedHandId={analysisHandId}
          status={status}
        />
      ) : <section
        className="analysis-block exact-reference"
        aria-labelledby="exact-reference-title"
        aria-busy={status === "updating"}
      >
        <div className="analysis-block__title">
          <div><span className="analysis-kicker">Exact reference</span><h3 id="exact-reference-title">Finite-shoe outcomes</h3></div>
          <span className="method-badge">Exact</span>
        </div>
        {exact ? (
          <dl className={`probability-list${status === "updating" ? " analysis-results--updating" : ""}`}>
            <div className="probability probability--win"><dt>Win</dt><progress aria-label="Exact win probability" aria-valuetext={percentage(exact.outcomes.win)} max={1} value={exact.outcomes.win} /><dd>{percentage(exact.outcomes.win)}</dd></div>
            <div className="probability probability--push"><dt>Push</dt><progress aria-label="Exact push probability" aria-valuetext={percentage(exact.outcomes.push)} max={1} value={exact.outcomes.push} /><dd>{percentage(exact.outcomes.push)}</dd></div>
            <div className="probability probability--loss"><dt>Loss</dt><progress aria-label="Exact loss probability" aria-valuetext={percentage(exact.outcomes.loss)} max={1} value={exact.outcomes.loss} /><dd>{percentage(exact.outcomes.loss)}</dd></div>
          </dl>
        ) : exactScenarios && (exactScenarios.deck_count_summaries?.length ?? 0) > 0 ? (
          <ExactDeckSummary analysis={exactScenarios} />
        ) : <p className="calm-status">{analysisMessage}</p>}
      </section>}

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
        {displayedForecasts && "action_forecasts" in displayedForecasts ? (
          <div className={`action-forecast__results${forecastStatus === "updating" ? " analysis-results--updating" : ""}`}>
            <div className="forecast-list">
              <ForecastOutcomes
                forecast={displayedForecasts.action_forecasts.stand_now}
                label="Stand now"
              />
              <ForecastOutcomes
                forecast={displayedForecasts.action_forecasts.hit_once_then_stand}
                label="Hit once, then stand"
              />
              <ForecastOutcomes
                forecast={displayedForecasts.action_forecasts.double_one_card_then_stand}
                label="Double — one card, then stand"
              />
              <TerminalForecast
                forecast={displayedForecasts.action_forecasts.surrender_now}
              />
              <SplitForecast
                forecast={displayedForecasts.action_forecasts.split_one_card_each_then_stand}
              />
            </div>
            {forecastStatus === "updating" && (
              <p className="calm-status" role="status">Updating exact hypothetical outcomes; previous values remain visible.</p>
            )}
          </div>
        ) : displayedForecasts ? (
          <div className={forecastStatus === "updating" ? "analysis-results--updating" : undefined}>
            <ActionDeckSummaries forecasts={displayedForecasts} />
            {forecastStatus === "updating" && (
              <p className="calm-status" role="status">Updating exact hypothetical outcomes; previous values remain visible.</p>
            )}
          </div>
        ) : forecastStatus === "updating" ? (
          <p className="calm-status" role="status">Calculating exact hypothetical outcomes...</p>
        ) : (
          <p className="calm-status">{forecastMessage}</p>
        )}
      </section>

      <section
        className={`analysis-block research-current${status === "updating" && research ? " analysis-results--updating" : ""}`}
        aria-labelledby="research-current-title"
        aria-busy={status === "updating"}
      >
        <div className="analysis-block__title">
          <div><span className="analysis-kicker">Source-backed</span><h3 id="research-current-title">Research systems</h3></div>
        </div>
        {!proMode && <p className="research-interpretation-note">Raw research scores summarize source-backed observed-card weights. They are not probabilities or action instructions.</p>}
        {scores.length > 0 && (proMode ? <>
          <ResearchSystemSummaryRows scores={scores} />
          <details className="research-details-disclosure">
            <summary>Research details</summary>
            <p className="research-interpretation-note">Raw research scores summarize source-backed observed-card weights. They are not probabilities or action instructions.</p>
            <p className="forecast-note">Ace Information is a separate auxiliary research feature, not a fourth primary counting system.</p>
            <ResearchSystemCards
              scores={scores}
              exactOutcomes={exact?.outcomes ?? null}
              deckSummaries={exactScenarios?.deck_count_summaries ?? []}
              unavailableMessage={analysisMessage}
            />
          </details>
          <details className="research-comparison-disclosure">
            <summary>Compare systems</summary>
            <ResearchComparisonTable scores={scores} />
          </details>
        </> : <>
          <ResearchSystemCards
            scores={scores}
            exactOutcomes={exact?.outcomes ?? null}
            deckSummaries={exactScenarios?.deck_count_summaries ?? []}
            unavailableMessage={analysisMessage}
          />
          <ResearchComparisonTable scores={scores} />
        </>)}
        {!research && <p className="calm-status">{researchMessage}</p>}
      </section>

      <section className="analysis-block ace-information" aria-labelledby="ace-information-title">
        <div className="analysis-block__title"><div><span className="analysis-kicker">Auxiliary feature</span><h3 id="ace-information-title">Ace Information</h3></div></div>
        {!proMode && <p className="forecast-note">Separate auxiliary research information, not a fourth primary counting system.</p>}
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
