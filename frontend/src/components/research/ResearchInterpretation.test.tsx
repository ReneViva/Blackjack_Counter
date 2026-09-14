import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ResearchDefinition, ResearchScore } from "../../api/research";
import {
  ResearchComparisonTable,
  ResearchSystemCards,
} from "./ResearchInterpretation";

const metadata = [
  ["wong_halves", "Wong Halves", "-3/2", -1.5, .56, .99, .72],
  ["zen_count", "Zen Count", "-2", -2, .63, .96, .85],
  ["omega_ii", "Omega II", "-1", -1, .67, .92, .85],
] as const;

const scores: readonly ResearchScore[] = metadata.map((item) => ({
  definition: {
    identifier: item[0] as ResearchDefinition["identifier"],
    label: item[1],
    balanced: true,
    level: item[0] === "wong_halves" ? 3 : 2,
    ace_classification: item[0] === "omega_ii" ? "ace_neutral" : "ace_reckoned",
    source: {
      source_id: "approved-counting-systems-2026-09-12",
      title: "Approved counting systems research package",
      local_path: "research/sources/approved-counting-systems.md",
      sha256: "343d",
      locator: "comparison table",
    },
    published_metrics: {
      kind: "published_static_metadata",
      pe: item[4],
      bc: item[5],
      ic: item[6],
    },
  },
  raw_score: item[3],
  raw_score_fraction: item[2],
  observed_known_cards: 4,
  unresolved_unknown_cards: 0,
  complete: true,
  ace_information: null,
}));

describe("research-system interpretation", () => {
  it("keeps three distinct scores beside one identical exact physical reference", () => {
    render(<>
      <ResearchSystemCards
        scores={scores}
        exactOutcomes={{ win: .421, push: .072, loss: .507 }}
      />
      <ResearchComparisonTable scores={scores} />
    </>);

    for (const [index, [, label, fraction]] of metadata.entries()) {
      const heading = screen.getByRole("heading", { name: label });
      const card = heading.closest("article") as HTMLElement;
      expect(card).toHaveTextContent(fraction);
      expect(card).toHaveTextContent(`PE${metadata[index][4].toFixed(2)}`);
      expect(card).toHaveTextContent(`BC${metadata[index][5].toFixed(2)}`);
      expect(card).toHaveTextContent(`IC${metadata[index][6].toFixed(2)}`);
      expect(within(card).getByLabelText("Current exact physical-state probability reference")).toHaveTextContent("Win42.1%Push7.2%Loss50.7%");
      expect(card).toHaveTextContent(`not derived from the ${label} raw research score`);
    }
    expect(screen.getByRole("table", { name: "Research-system comparison" })).toHaveTextContent("Wong Halves");
    expect(screen.getByText(/not mathematically equivalent/)).toBeVisible();
    expect(document.body).not.toHaveTextContent(/best system|winner|recommended count|hit because|stand because/i);
  });

  it("provides keyboard-operable educational metric definitions", () => {
    render(<ResearchSystemCards scores={[scores[0]]} exactOutcomes={{ win: .4, push: .1, loss: .5 }} />);

    const summary = screen.getByText("What this means");
    expect(summary.parentElement).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(summary.parentElement).toHaveAttribute("open");
    expect(screen.getByText(/Playing Efficiency \(PE\)/)).toBeVisible();
    expect(screen.getByText(/Betting Correlation \(BC\)/)).toBeVisible();
    expect(screen.getByText(/Insurance Correlation \(IC\)/)).toBeVisible();
    expect(screen.getByText(/not probabilities for the current hand/)).toBeVisible();
  });

  it("renders compact valid-model context without duplicating deck scenarios", () => {
    render(<ResearchSystemCards
      scores={scores}
      deckSummaries={[{
        method: "uniform_valid_deck_count_mean",
        assumption: "equal_weight_valid_deck_counts",
        dealer_soft_17: "stand",
        status: "available",
        candidate_deck_counts: [1, 2, 3, 4, 5, 6, 7, 8],
        included_deck_counts: [2, 3, 4, 5, 6, 7, 8],
        excluded_deck_counts: [{ deck_count: 1, code: "exact_card_multiplicity_exceeded", message: "Observed 2 copies of AS; a 1-deck shoe contains 1." }],
        outcomes: { win: .618, push: 0, loss: .382 },
        ranges: {
          win: { minimum: .617, maximum: .62 },
          push: { minimum: 0, maximum: 0 },
          loss: { minimum: .38, maximum: .383 },
        },
        error: null,
      }]}
    />);

    expect(screen.getAllByText("S17 · Uniform deck-count summary")).toHaveLength(3);
    expect(screen.getAllByText(/Equal-weight assumption across valid deck-count models/)).toHaveLength(3);
    expect(screen.getAllByText(/1 deck excluded/)).toHaveLength(3);
    expect(screen.getAllByText(/Win model range/)).toHaveLength(3);
    expect(document.body).not.toHaveTextContent(/confidence interval|95% CI/i);
    expect(screen.queryByText(/8 decks · Exact finite-shoe/)).not.toBeInTheDocument();
  });
});
