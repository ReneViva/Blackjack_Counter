import { useEffect, useRef, useState } from "react";

import {
  AnalysisApiError,
  analyzeActionForecast,
  analyzeExact,
  type ActionForecastResponse,
  type AnalysisResponse,
  type ExactActionForecastScenarioAnalysisResponse,
  type ExactActionForecastResult,
  type ExactAnalysisResponse,
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

export default function AnalysisSidebar({ activeTarget = null, state }: AnalysisSidebarProps) {
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [forecastStatus, setForecastStatus] = useState<RequestStatus>("idle");
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [forecasts, setForecasts] = useState<ActionForecastResponse | null>(null);
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
  const canRunExact = userCards.length >= 2 && table.dealerCards.length >= 1;
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
              ? "Exact reference includes explicit model scenarios and a separate assumption-based deck-count summary."
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
  const exactScenarios = analysis && "scenarios" in analysis && analysis.method === "exact"
    ? analysis
    : null;
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
        ) : exactScenarios && (exactScenarios.deck_count_summaries?.length ?? 0) > 0 ? (
          <ExactDeckSummary analysis={exactScenarios} />
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
        ) : forecasts && "action_forecasts" in forecasts ? (
          <div className="forecast-list">
            <ForecastOutcomes
              forecast={forecasts.action_forecasts.stand_now}
              label="Stand now"
            />
            <ForecastOutcomes
              forecast={forecasts.action_forecasts.hit_once_then_stand}
              label="Hit once, then stand"
            />
            <ForecastOutcomes
              forecast={forecasts.action_forecasts.double_one_card_then_stand}
              label="Double — one card, then stand"
            />
            <TerminalForecast
              forecast={forecasts.action_forecasts.surrender_now}
            />
            <SplitForecast
              forecast={forecasts.action_forecasts.split_one_card_each_then_stand}
            />
          </div>
        ) : forecasts ? (
          <ActionDeckSummaries forecasts={forecasts} />
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
