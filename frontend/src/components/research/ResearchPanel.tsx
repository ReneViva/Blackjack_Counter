import { useEffect, useMemo, useRef, useState } from "react";

import {
  RESEARCH_DEFINITIONS,
  ResearchApiError,
  compareResearch,
  runResearchBatch,
  type ResearchBatchResponse,
  type ResearchComparisonResponse,
  type ResearchDefinition,
  type ResearchDefinitionId,
} from "../../api/research";
import { toTableStatePayload } from "../../api/tableState";
import { downloadJsonFile } from "../../replay/download";
import {
  serializeResearchBatchExport,
  type ResearchBatchExportRequest,
} from "../../replay/researchExport";
import type { SessionState } from "../../state/gameReducer";
import {
  ResearchComparisonTable,
  ResearchSystemCards,
} from "./ResearchInterpretation";

type RequestStatus = "idle" | "loading" | "success" | "error";
type ResearchPanelProps = Readonly<{ state: SessionState }>;

function probability(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function correlation(value: number | null): string {
  return value === null ? "Not available" : value.toFixed(4);
}

function DefinitionCards({ definitions }: { definitions: readonly ResearchDefinition[] }) {
  return <div className="research-definition-grid">{definitions.map((definition) => (
    <article key={definition.identifier}>
      <h3>{definition.label}</h3>
      <p>Level {definition.level} · {definition.balanced ? "balanced" : "unbalanced"} · {definition.ace_classification === "ace_neutral" ? "ace-neutral" : "ace-reckoned"}</p>
      <p><strong>Approved source:</strong> {definition.source.source_id}</p>
      <p className="research-source-title">{definition.source.title}</p>
      <div className="metadata-box"><strong>Published source metadata</strong><span>PE {definition.published_metrics.pe.toFixed(2)} · BC {definition.published_metrics.bc.toFixed(2)} · IC {definition.published_metrics.ic.toFixed(2)}</span></div>
    </article>
  ))}</div>;
}

export default function ResearchPanel({ state }: ResearchPanelProps) {
  const [selected, setSelected] = useState<ReadonlySet<ResearchDefinitionId>>(
    () => new Set(RESEARCH_DEFINITIONS.map((definition) => definition.id)),
  );
  const [includeAce, setIncludeAce] = useState(false);
  const [caseCount, setCaseCount] = useState(25);
  const [removedCards, setRemovedCards] = useState(6);
  const [seed, setSeed] = useState("12345");
  const [currentStatus, setCurrentStatus] = useState<RequestStatus>("idle");
  const [batchStatus, setBatchStatus] = useState<RequestStatus>("idle");
  const [current, setCurrent] = useState<ResearchComparisonResponse | null>(null);
  const [batch, setBatch] = useState<ResearchBatchResponse | null>(null);
  const [batchSeed, setBatchSeed] = useState<string | null>(null);
  const [batchRequest, setBatchRequest] = useState<ResearchBatchExportRequest | null>(null);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const currentController = useRef<AbortController | null>(null);
  const batchController = useRef<AbortController | null>(null);
  const definitionIds = useMemo(
    () => RESEARCH_DEFINITIONS.map((item) => item.id).filter((id) => selected.has(id)),
    [selected],
  );

  useEffect(() => () => {
    currentController.current?.abort();
    batchController.current?.abort();
  }, []);

  const toggleDefinition = (id: ResearchDefinitionId) => {
    setSelected((currentSelection) => {
      const next = new Set(currentSelection);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const validateControls = (): string | null => {
    if (definitionIds.length === 0) return "Select at least one primary research system.";
    if (!Number.isInteger(caseCount) || caseCount < 2 || caseCount > 50) return "Case count must be an integer from 2 to 50.";
    if (!Number.isInteger(removedCards) || removedCards < 0 || removedCards > 20) return "Removed cards per case must be an integer from 0 to 20.";
    if (!/^\d+$/.test(seed)) return "Seed is required and must be a non-negative integer.";
    if (BigInt(seed) > 9_223_372_036_854_775_807n) return "Seed exceeds 9223372036854775807.";
    return null;
  };

  const runCurrent = async () => {
    if (definitionIds.length === 0) {
      setCurrentStatus("error");
      setCurrentError("Select at least one primary research system.");
      return;
    }
    currentController.current?.abort();
    const controller = new AbortController();
    currentController.current = controller;
    setCurrentStatus("loading"); setCurrentError(null); setCurrent(null);
    try {
      setCurrent(await compareResearch(state, definitionIds, includeAce, controller.signal));
      setCurrentStatus("success");
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCurrentError(error instanceof ResearchApiError ? error.message : "Research comparison could not be completed.");
      setCurrentStatus("error");
    }
  };

  const runBatch = async () => {
    const validation = validateControls();
    if (validation) {
      setBatchStatus("error"); setBatchError(validation); return;
    }
    batchController.current?.abort();
    const controller = new AbortController();
    batchController.current = controller;
    setBatchStatus("loading"); setBatchError(null); setBatch(null); setBatchSeed(null); setBatchRequest(null);
    try {
      const submittedSeed = seed;
      const request: ResearchBatchExportRequest = {
        state: toTableStatePayload(state),
        definition_ids: definitionIds,
        case_count: caseCount,
        removed_cards_per_case: removedCards,
        seed: submittedSeed,
        include_ace_information: includeAce,
      };
      const result = await runResearchBatch(state, {
        definitionIds,
        caseCount,
        removedCardsPerCase: removedCards,
        seed: submittedSeed,
        includeAceInformation: includeAce,
      }, controller.signal);
      setBatch(result);
      setBatchSeed(submittedSeed);
      setBatchRequest(request);
      setBatchStatus("success");
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setBatchError(error instanceof ResearchApiError ? error.message : "Offline experiment could not be completed.");
      setBatchStatus("error");
    }
  };

  const currentExact = current?.exact_reference && "status" in current.exact_reference
    ? current.exact_reference
    : null;
  const currentScenarios = current?.exact_reference && "scenarios" in current.exact_reference
    ? current.exact_reference
    : null;
  const currentAceInformation = current?.scores
    .map((score) => score.ace_information)
    .find((item) => item !== null) ?? null;
  const currentSelectionInvalid = currentStatus === "error" && currentError?.startsWith("Select at least") === true;
  const batchSelectionInvalid = batchStatus === "error" && batchError?.startsWith("Select at least") === true;
  const caseCountInvalid = batchStatus === "error" && batchError?.startsWith("Case count") === true;
  const removedCardsInvalid = batchStatus === "error" && batchError?.startsWith("Removed cards") === true;
  const seedInvalid = batchStatus === "error" && batchError?.startsWith("Seed") === true;
  const selectionErrorId = currentSelectionInvalid
    ? "research-current-error"
    : batchSelectionInvalid
      ? "research-batch-error"
      : undefined;

  return <section className="panel research-panel" aria-labelledby="research-heading">
    <div className="section-heading"><div><p className="eyebrow">Research / Academic Comparison</p><h2 id="research-heading">Count compression laboratory</h2></div><span>Offline educational analysis</span></div>
    <p className="analysis-note">Compare source-backed raw research scores with the exact finite-shoe reference. Correlation describes association; it does not imply causality or prescribe decisions.</p>

    <fieldset className="research-system-picker" aria-invalid={currentSelectionInvalid || batchSelectionInvalid} aria-describedby={selectionErrorId}><legend>Primary research systems</legend>{RESEARCH_DEFINITIONS.map((definition) => <label key={definition.id} className="checkbox-control"><input type="checkbox" checked={selected.has(definition.id)} onChange={() => toggleDefinition(definition.id)} />{definition.label}</label>)}</fieldset>
    <label className="checkbox-control research-ace"><input type="checkbox" checked={includeAce} onChange={(event) => setIncludeAce(event.target.checked)} />Include Ace Information as a separate auxiliary feature</label>

    <section className="research-section" aria-busy={currentStatus === "loading"}>
      <h3>Current-state research comparison</h3>
      <p>Raw research scores and exact probability remain separate outputs.</p>
      <button type="button" onClick={() => void runCurrent()} disabled={currentStatus === "loading"} aria-describedby={currentStatus === "error" ? "research-current-error" : undefined}>{currentStatus === "loading" ? "Comparing current state..." : "Compare current state"}</button>
      {currentStatus === "loading" && <p className="request-status" role="status">Comparing current-state research scores.</p>}
      {currentStatus === "error" && <p id="research-current-error" className="analysis-error" role="alert">{currentError}</p>}
      {current && <div className="research-results" aria-live="polite">
        <p className="research-interpretation-note">The research score is the sum of each system&apos;s source-backed card weights over the simulated observed-card state. It is not a win probability or action recommendation.</p>
        <ResearchSystemCards
          scores={current.scores}
          exactOutcomes={currentExact?.status === "complete" ? currentExact.outcomes : null}
          deckSummaries={currentScenarios?.deck_count_summaries ?? []}
          unavailableMessage={currentExact?.error?.message ?? null}
        />
        <ResearchComparisonTable scores={current.scores} />
        {currentAceInformation && <section className="research-ace-auxiliary" aria-labelledby="research-ace-auxiliary-title">
          <p className="eyebrow">Auxiliary research information</p>
          <h3 id="research-ace-auxiliary-title">Ace Information</h3>
          <p>Ace Information remains separate from Hi-Lo, Wong Halves, Zen Count, and Omega II; it is an auxiliary feature, not a primary system.</p>
          <dl className="compact-outcomes"><div><dt>Known aces observed</dt><dd>{currentAceInformation.known_aces_observed}</dd></div><div><dt>Exact aces remaining</dt><dd>{currentAceInformation.exact_aces_remaining ?? "Unknown"}</dd></div></dl>
        </section>}
      </div>}
    </section>

    <section className="research-section" aria-busy={batchStatus === "loading"}>
      <h3>Offline research experiment</h3>
      <div className="research-controls"><label>Case count (2–50)<input aria-label="Research case count" aria-invalid={caseCountInvalid} aria-describedby={caseCountInvalid ? "research-batch-error" : undefined} type="number" min="2" max="50" step="1" value={caseCount} onChange={(event) => setCaseCount(Number(event.target.value))} /></label><label>Known cards removed per case (0–20)<input aria-label="Removed cards per research case" aria-invalid={removedCardsInvalid} aria-describedby={removedCardsInvalid ? "research-batch-error" : undefined} type="number" min="0" max="20" step="1" value={removedCards} onChange={(event) => setRemovedCards(Number(event.target.value))} /></label><label>Required reproducibility seed<input aria-label="Research seed" aria-invalid={seedInvalid} aria-describedby={seedInvalid ? "research-batch-error" : undefined} type="text" inputMode="numeric" pattern="[0-9]+" required value={seed} onChange={(event) => setSeed(event.target.value.trim())} /></label></div>
      <button type="button" onClick={() => void runBatch()} disabled={batchStatus === "loading"} aria-describedby={batchStatus === "error" ? "research-batch-error" : undefined}>{batchStatus === "loading" ? "Running bounded experiment..." : "Run offline experiment"}</button>
      {batchStatus === "loading" && <p className="request-status" role="status">Running the bounded offline research experiment.</p>}
      {batch && batchRequest && <button type="button" className="button-secondary" onClick={() => downloadJsonFile("blackjack-research-batch.json", serializeResearchBatchExport(batchRequest, batch))}>Export Research JSON</button>}
      {batchStatus === "error" && <p id="research-batch-error" className="analysis-error" role="alert">{batchError}</p>}
      {batch && <div className="research-results" aria-live="polite"><p><strong>Experiment summary:</strong> seed {batchSeed ?? String(batch.seed)} · {batch.completed_case_count}/{batch.requested_case_count} cases · {batch.removed_cards_per_case} known removals per independent case · exact references {batch.exact_available_count} available/{batch.exact_unavailable_count} unavailable.</p><DefinitionCards definitions={batch.definitions} /><div className="table-scroll"><table><caption>Computed experiment metrics</caption><thead><tr><th>System</th><th>Association target</th><th>Correlation</th><th>Status</th><th>Eligible n</th><th>Exclusions</th></tr></thead><tbody>{batch.metrics.map((metric) => <tr key={`${metric.definition_id}-${metric.metric_id}`}><th scope="row">{batch.definitions.find((definition) => definition.identifier === metric.definition_id)?.label ?? metric.definition_id}</th><td>{metric.target === "exact_win_probability" ? "Raw score vs exact win probability" : "Raw score vs exact outcome balance"}</td><td>{correlation(metric.value)}</td><td>{metric.status.replaceAll("_", " ")}</td><td>{metric.eligible_cases}/{metric.total_cases}</td><td>Incomplete {metric.excluded_incomplete_score}; exact unavailable {metric.excluded_exact_unavailable}; nonfinite {metric.excluded_nonfinite}</td></tr>)}</tbody></table></div><p className="metric-note">Pearson correlation: +1 perfect positive linear association, 0 no linear association, −1 perfect negative linear association. No causal interpretation is implied.</p><div className="table-scroll"><table><caption>Bounded experiment cases</caption><thead><tr><th>Case</th><th>Sampled known removals</th><th>Exact probability reference</th><th>Exact outcome balance</th><th>Raw research scores</th></tr></thead><tbody>{batch.cases.map((experimentCase) => <tr key={experimentCase.case_id}><th scope="row">{experimentCase.case_id}</th><td>{experimentCase.sampled_removed_ranks.join(", ") || "None"}</td><td>{experimentCase.exact_reference_status === "available" && experimentCase.exact_reference.outcomes ? `W ${probability(experimentCase.exact_reference.outcomes.win)} · P ${probability(experimentCase.exact_reference.outcomes.push)} · L ${probability(experimentCase.exact_reference.outcomes.loss)}` : `Unavailable: ${experimentCase.exact_reference.error?.message ?? "No exact result"}`}</td><td>{experimentCase.exact_outcome_balance === null ? "Unavailable" : experimentCase.exact_outcome_balance.toFixed(4)}</td><td>{experimentCase.research_results.map((score) => `${score.definition.label}: ${score.raw_score_fraction}${score.complete ? "" : " (incomplete)"}`).join(" · ")}</td></tr>)}</tbody></table></div></div>}
    </section>
  </section>;
}
