import type {
  OutcomeProbabilities,
  UniformDeckCountSummary,
} from "../../api/analysis";
import type { ResearchScore } from "../../api/research";

type PhysicalReference = Readonly<{
  exactOutcomes?: OutcomeProbabilities | null;
  deckSummaries?: readonly UniformDeckCountSummary[];
  unavailableMessage?: string | null;
}>;

type ResearchInterpretationProps = PhysicalReference & Readonly<{
  scores: readonly ResearchScore[];
}>;

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function decimal(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function OutcomeReference({ outcomes }: Readonly<{
  outcomes: OutcomeProbabilities;
}>) {
  return (
    <dl className="research-physical-outcomes">
      <div><dt>Win</dt><dd>{percentage(outcomes.win)}</dd></div>
      <div><dt>Push</dt><dd>{percentage(outcomes.push)}</dd></div>
      <div><dt>Loss</dt><dd>{percentage(outcomes.loss)}</dd></div>
    </dl>
  );
}

function PhysicalStateReference({
  deckSummaries = [],
  exactOutcomes = null,
  unavailableMessage = null,
}: PhysicalReference) {
  if (exactOutcomes) {
    return (
      <section className="research-physical-reference" aria-label="Current exact physical-state probability reference">
        <h5>Current exact physical-state reference</h5>
        <OutcomeReference outcomes={exactOutcomes} />
      </section>
    );
  }
  if (deckSummaries.length > 0) {
    return (
      <section className="research-physical-reference" aria-label="Current physical-state model reference">
        <h5>Current physical-state model reference</h5>
        {deckSummaries.map((summary) => (
          <div className="research-model-reference" key={summary.dealer_soft_17}>
            <strong>{summary.dealer_soft_17 === "stand" ? "S17" : "H17"} · Uniform deck-count summary</strong>
            <p>Equal-weight assumption across valid deck-count models.</p>
            <p>{summary.included_deck_counts.length}/{summary.candidate_deck_counts.length} valid models · Included decks: {summary.included_deck_counts.join(", ") || "none"}</p>
            {summary.excluded_deck_counts.length > 0 && (
              <ul>
                {summary.excluded_deck_counts.map((item) => (
                  <li key={item.deck_count}>{item.deck_count} deck{item.deck_count === 1 ? "" : "s"} excluded — {item.message}</li>
                ))}
              </ul>
            )}
            {summary.status === "available" && summary.outcomes && summary.ranges ? (
              <>
                <OutcomeReference outcomes={summary.outcomes} />
                <dl className="research-model-ranges">
                  <div><dt>Win model range</dt><dd>{percentage(summary.ranges.win.minimum)}–{percentage(summary.ranges.win.maximum)}</dd></div>
                  <div><dt>Push model range</dt><dd>{percentage(summary.ranges.push.minimum)}–{percentage(summary.ranges.push.maximum)}</dd></div>
                  <div><dt>Loss model range</dt><dd>{percentage(summary.ranges.loss.minimum)}–{percentage(summary.ranges.loss.maximum)}</dd></div>
                </dl>
                <p>Range across valid deck-count models.</p>
              </>
            ) : (
              <p className="status-unavailable">Model reference unavailable: {summary.error?.message ?? "No result returned."}</p>
            )}
          </div>
        ))}
      </section>
    );
  }
  return (
    <section className="research-physical-reference" aria-label="Current physical-state probability reference">
      <h5>Current physical-state reference</h5>
      <p className="status-unavailable">{unavailableMessage ?? "Physical-state probability reference is not available yet."}</p>
    </section>
  );
}

function PublishedMetrics({ score }: Readonly<{ score: ResearchScore }>) {
  const metrics = score.definition.published_metrics;
  return (
    <dl className="research-published-metrics" aria-label={`${score.definition.label} published static metrics`}>
      <div><dt><abbr title="Playing Efficiency">PE</abbr></dt><dd>{metrics.pe.toFixed(2)}</dd></div>
      <div><dt><abbr title="Betting Correlation">BC</abbr></dt><dd>{metrics.bc.toFixed(2)}</dd></div>
      <div><dt><abbr title="Insurance Correlation">IC</abbr></dt><dd>{metrics.ic.toFixed(2)}</dd></div>
    </dl>
  );
}

export function ResearchSystemCards({
  scores,
  deckSummaries,
  exactOutcomes,
  unavailableMessage,
}: ResearchInterpretationProps) {
  return (
    <div className="research-interpretation-grid">
      {scores.map((score) => (
        <article className="research-interpretation-card" key={score.definition.identifier}>
          <div className="research-system-heading">
            <h4>{score.definition.label}</h4>
            <span>{score.complete ? "Complete" : "Incomplete"}</span>
          </div>
          <dl className="research-score-facts">
            <div><dt>Raw research score · canonical fraction</dt><dd>{score.raw_score_fraction}</dd></div>
            <div><dt>Decimal</dt><dd>{decimal(score.raw_score)}</dd></div>
          </dl>
          <p className="research-source-title">Source-backed definition: {score.definition.source.title}</p>
          <p className="research-metric-label">Published static metrics</p>
          <PublishedMetrics score={score} />
          <PhysicalStateReference
            exactOutcomes={exactOutcomes}
            deckSummaries={deckSummaries}
            unavailableMessage={unavailableMessage}
          />
          <p className="research-separation-note">This physical-state reference comes from the exact finite-shoe engine. It is not derived from the {score.definition.label} raw research score.</p>
          <details className="research-meaning">
            <summary>What this means</summary>
            <p>The research score is the sum of the system&apos;s source-backed card weights over the simulated observed-card state.</p>
            <p>It is not a win probability or action recommendation.</p>
            <p><strong>Playing Efficiency (PE)</strong> describes how strongly a system tracks composition-sensitive playing information.</p>
            <p><strong>Betting Correlation (BC)</strong> is the published correlation between count weights and card-removal effects associated with overall player advantage.</p>
            <p><strong>Insurance Correlation (IC)</strong> describes how strongly the system tracks insurance-relevant composition information.</p>
            <p>PE, BC, and IC are published static comparison metrics, not probabilities for the current hand.</p>
          </details>
        </article>
      ))}
    </div>
  );
}

export function ResearchComparisonTable({ scores }: Readonly<{
  scores: readonly ResearchScore[];
}>) {
  return (
    <div className="table-scroll">
      <table className="research-comparison-table">
        <caption>Research-system comparison</caption>
        <thead><tr><th>System</th><th>Canonical raw score</th><th>Decimal</th><th>PE</th><th>BC</th><th>IC</th></tr></thead>
        <tbody>
          {scores.map((score) => (
            <tr key={score.definition.identifier}>
              <th scope="row">{score.definition.label}</th>
              <td>{score.raw_score_fraction}</td>
              <td>{decimal(score.raw_score)}</td>
              <td>{score.definition.published_metrics.pe.toFixed(2)}</td>
              <td>{score.definition.published_metrics.bc.toFixed(2)}</td>
              <td>{score.definition.published_metrics.ic.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="research-scale-note">Numerical scores are not directly interchangeable because the source-backed tag scales differ. A score of +2 in Zen Count is not mathematically equivalent to +2 in Wong Halves.</p>
    </div>
  );
}
