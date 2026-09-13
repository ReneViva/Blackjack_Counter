import { useEffect, useRef, useState } from "react";

import {
  AnalysisApiError,
  analyze,
  type AnalysisMethod,
  type AnalysisResponse,
  type CompareAnalysisResponse,
  type ConfidenceLevel,
  type MonteCarloAnalysisResponse,
  type OutcomeProbabilities,
  type ScenarioAnalysisResponse,
  type SingleAnalysisResponse,
} from "../../api/analysis";
import type { SessionState } from "../../state/gameReducer";

type AnalysisStatus = "idle" | "calculating" | "success" | "error";
type AnalysisPanelProps = Readonly<{ state: SessionState }>;
const OUTCOMES = ["win", "push", "loss"] as const;

function percentage(value: number): string { return `${(value * 100).toFixed(2)}%`; }
function title(outcome: (typeof OUTCOMES)[number]): string { return outcome[0].toUpperCase() + outcome.slice(1); }

function ExactOutcomes({ outcomes }: { outcomes: OutcomeProbabilities }) {
  return <dl className="outcome-grid">{OUTCOMES.map((outcome) => <div key={outcome}><dt>{title(outcome)}</dt><dd>{percentage(outcomes[outcome])}</dd></div>)}</dl>;
}

function MonteCarloOutcomes({ result }: { result: MonteCarloAnalysisResponse }) {
  return <dl className="outcome-grid">{OUTCOMES.map((outcome) => {
    const estimate = result.outcomes[outcome];
    return <div key={outcome}><dt>{title(outcome)} estimate</dt><dd>{percentage(estimate.estimate)}</dd><small>{Math.round(result.confidence_level * 100)}% sampling CI: {percentage(estimate.ci_low)}–{percentage(estimate.ci_high)}</small></div>;
  })}</dl>;
}

function CompareOutcomes({ result }: { result: CompareAnalysisResponse }) {
  if (result.status === "exact_unavailable" || !result.comparison) {
    return <div><p className="analysis-error">Exact comparison unavailable: {result.exact_error?.message}</p><MonteCarloOutcomes result={result.monte_carlo} /></div>;
  }
  return <div className="comparison-grid">{OUTCOMES.map((outcome) => {
    const comparison = result.comparison?.[outcome];
    if (!comparison) return null;
    return <article key={outcome}><h3>{title(outcome)}</h3><p>Exact probability: {percentage(comparison.exact_probability)}</p><p>Monte Carlo estimate: {percentage(comparison.monte_carlo_estimate)}</p><p>Sampling CI: {percentage(comparison.ci_low)}–{percentage(comparison.ci_high)}</p><p>Absolute error: {percentage(comparison.absolute_error)}</p></article>;
  })}</div>;
}

function SingleResult({ result }: { result: SingleAnalysisResponse }) {
  if (result.method === "exact") return <><ExactOutcomes outcomes={result.outcomes} /><p>Exact finite-shoe probability | No sampling confidence interval | {result.metadata.states_evaluated} states evaluated | {result.metadata.cache_hits} cache hits</p></>;
  if (result.method === "monte_carlo") return <><MonteCarloOutcomes result={result} /><p>Monte Carlo sample | {result.simulations.toLocaleString()} completed trials | raw counts {result.counts.win}/{result.counts.push}/{result.counts.loss}</p></>;
  return <CompareOutcomes result={result} />;
}

function ScenarioResults({ result }: { result: ScenarioAnalysisResponse }) {
  return <div className="scenario-list"><p>Model uncertainty is shown as separate scenarios; no averaging is applied.</p>{result.scenarios.map((scenario) => <article key={`${scenario.assumptions.decks}-${scenario.assumptions.dealer_soft_17}`}><h3>{scenario.assumptions.decks} deck{scenario.assumptions.decks === 1 ? "" : "s"} · dealer {scenario.assumptions.dealer_soft_17 === "hit" ? "hits" : "stands"} on soft 17</h3>{scenario.status === "invalid" || !scenario.result ? <p className="analysis-error">Invalid scenario: {scenario.error?.message}</p> : <SingleResult result={scenario.result} />}</article>)}</div>;
}

function isScenarioResult(result: AnalysisResponse): result is ScenarioAnalysisResponse { return "scenarios" in result; }

export default function AnalysisPanel({ state }: AnalysisPanelProps) {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<AnalysisMethod>("exact");
  const [simulations, setSimulations] = useState(10_000);
  const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel>(0.95);
  const [seed, setSeed] = useState("12345");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => { controller.current?.abort(); setStatus("idle"); setResult(null); setError(null); return () => controller.current?.abort(); }, [state]);

  const runAnalysis = async () => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setStatus("calculating"); setResult(null); setError(null);
    try {
      const options = method === "exact" ? { method } as const : { method, simulations, confidence_level: confidenceLevel, seed: seed.trim() === "" ? null : Number(seed) } as const;
      setResult(await analyze(state, options, nextController.signal));
      setStatus("success");
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof AnalysisApiError ? caught.message : "Analysis could not be completed.");
      setStatus("error");
    }
  };

  return <section className="panel analysis-panel" aria-labelledby="analysis-heading" aria-busy={status === "calculating"}>
    <div className="section-heading"><div><p className="eyebrow">Probability methods</p><h2 id="analysis-heading">Dealer-completion analysis</h2></div><span>{method === "exact" ? "Exact result · sampling CI not applicable" : "Finite-shoe Monte Carlo sampling"}</span></div>
    <p className="analysis-note">Holds the observed user hand fixed. Hidden cards are integrated exactly or sampled from finite multiplicities; model scenarios remain separate.</p>
    <div className="analysis-controls"><label>Analysis method<select aria-label="Analysis method" value={method} onChange={(event) => setMethod(event.target.value as AnalysisMethod)}><option value="exact">Exact</option><option value="monte_carlo">Monte Carlo</option><option value="compare">Compare Both</option></select></label>
      {method !== "exact" && <><label>Simulation trials<input aria-label="Simulation trials" type="number" min="1" max="1000000" value={simulations} onChange={(event) => setSimulations(Number(event.target.value))} /></label><label>Monte Carlo sampling confidence<select aria-label="Monte Carlo sampling confidence" value={confidenceLevel} onChange={(event) => setConfidenceLevel(Number(event.target.value) as ConfidenceLevel)}><option value={0.9}>90%</option><option value={0.95}>95%</option><option value={0.99}>99%</option></select></label><label>Random seed (optional)<input aria-label="Random seed (optional)" type="number" value={seed} onChange={(event) => setSeed(event.target.value)} /></label></>}
    </div>
    <button className="button-primary" type="button" disabled={status === "calculating"} aria-describedby={status === "error" ? "analysis-request-error" : undefined} onClick={() => void runAnalysis()}>{status === "calculating" ? "Running analysis..." : "Run analysis"}</button>
    {status === "calculating" && <p className="request-status" role="status">Exact finite-shoe analysis is calculating.</p>}
    {status === "error" && <p id="analysis-request-error" className="analysis-error" role="alert">{error}</p>}
    {status === "success" && result && <div className="analysis-result" aria-live="polite">{isScenarioResult(result) ? <ScenarioResults result={result} /> : <SingleResult result={result} />}</div>}
  </section>;
}
