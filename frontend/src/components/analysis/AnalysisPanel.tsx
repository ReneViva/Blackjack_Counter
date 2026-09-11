import { useEffect, useRef, useState } from "react";

import {
  AnalysisApiError,
  analyzeExact,
  type ExactAnalysisResponse,
} from "../../api/analysis";
import type { SessionState } from "../../state/gameReducer";

type AnalysisStatus = "idle" | "calculating" | "success" | "error";

type AnalysisPanelProps = Readonly<{
  state: SessionState;
}>;

function percentage(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export default function AnalysisPanel({ state }: AnalysisPanelProps) {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [result, setResult] = useState<ExactAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    controller.current?.abort();
    setStatus("idle");
    setResult(null);
    setError(null);
    return () => controller.current?.abort();
  }, [state]);

  const runAnalysis = async () => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setStatus("calculating");
    setResult(null);
    setError(null);
    try {
      const response = await analyzeExact(state, nextController.signal);
      setResult(response);
      setStatus("success");
    } catch (caught: unknown) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }
      setError(
        caught instanceof AnalysisApiError
          ? caught.message
          : "Exact analysis could not be completed.",
      );
      setStatus("error");
    }
  };

  return (
    <section className="panel analysis-panel" aria-labelledby="analysis-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Exact finite shoe</p>
          <h2 id="analysis-heading">Dealer-completion analysis</h2>
        </div>
        <span>No sampling or confidence interval</span>
      </div>
      <p className="analysis-note">
        Holds the observed user hand fixed and follows the configured dealer rules
        through every possible known-card draw.
      </p>
      <button
        className="button-primary"
        type="button"
        disabled={status === "calculating"}
        onClick={() => void runAnalysis()}
      >
        {status === "calculating"
          ? "Calculating exact result..."
          : "Analyze exact result"}
      </button>

      {status === "error" && (
        <p className="analysis-error" role="alert">
          {error}
        </p>
      )}
      {status === "success" && result && (
        <div className="analysis-result" aria-live="polite">
          <dl className="outcome-grid">
            <div>
              <dt>Win</dt>
              <dd>{percentage(result.outcomes.win)}</dd>
            </div>
            <div>
              <dt>Push</dt>
              <dd>{percentage(result.outcomes.push)}</dd>
            </div>
            <div>
              <dt>Loss</dt>
              <dd>{percentage(result.outcomes.loss)}</dd>
            </div>
          </dl>
          <p>
            Exact method | {result.state_summary.cards_remaining} cards remaining |{" "}
            {result.metadata.states_evaluated} states evaluated |{" "}
            {result.metadata.cache_hits} cache hits
          </p>
        </div>
      )}
    </section>
  );
}
