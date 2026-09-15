import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ResearchDefinition, ResearchScore } from "../../api/research";
import {
  ResearchComparisonTable,
  ResearchSystemCards,
} from "./ResearchInterpretation";

const metadata = [
  ["hi_lo", "Hi-Lo", "0", 0, .51, .97, .76],
  ["wong_halves", "Wong Halves", "-3/2", -1.5, .56, .99, .72],
  ["zen_count", "Zen Count", "-2", -2, .63, .96, .85],
  ["omega_ii", "Omega II", "-1", -1, .67, .92, .85],
] as const;

const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
const hiLoValues = [-1, 1, 1, 1, 1, 1, 0, 0, 0, -1, -1, -1, -1] as const;

const scores: readonly ResearchScore[] = metadata.map((item) => ({
  definition: {
    identifier: item[0] as ResearchDefinition["identifier"],
    label: item[1],
    balanced: true,
    level: item[0] === "hi_lo" ? 1 : item[0] === "wong_halves" ? 3 : 2,
    ace_classification: item[0] === "omega_ii" ? "ace_neutral" : "ace_reckoned",
    canonical_tags: ranks.map((rank, index) => ({
      card_value: rank,
      tag_fraction: String(item[0] === "hi_lo" ? hiLoValues[index] : 0),
      tag_decimal: item[0] === "hi_lo" ? hiLoValues[index] : 0,
    })),
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
  it("keeps four distinct scores beside one identical exact physical reference", () => {
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
    const comparison = screen.getByRole("table", { name: "Research-system comparison" });
    expect(comparison).toHaveTextContent("Hi-Lo");
    expect(comparison).toHaveTextContent("Wong Halves");
    const hiLoCard = screen.getByRole("heading", { name: "Hi-Lo" }).closest("article") as HTMLElement;
    expect(hiLoCard).toHaveTextContent("Canonical tags: A -1,2 +1,3 +1,4 +1,5 +1,6 +1,7 0,8 0,9 0,10 -1,J -1,Q -1,K -1");
    expect(hiLoCard).toHaveTextContent("Balanced Level 1: a complete deck's card weights sum to zero.");
    expect(hiLoCard).toHaveTextContent("not Win probability, Push probability, or Loss probability");
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

    expect(screen.getAllByText("S17 · Uniform deck-count summary")).toHaveLength(4);
    expect(screen.getAllByText(/Equal-weight assumption across valid deck-count models/)).toHaveLength(4);
    expect(screen.getAllByText(/1 deck excluded/)).toHaveLength(4);
    expect(screen.getAllByText(/Win model range/)).toHaveLength(4);
    expect(document.body).not.toHaveTextContent(/confidence interval|95% CI/i);
    expect(screen.queryByText(/8 decks · Exact finite-shoe/)).not.toBeInTheDocument();
  });
});
