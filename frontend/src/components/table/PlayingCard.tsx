import {
  blackjackValueClassForRank,
  type ObservedCard,
  type Rank,
  type Suit,
} from "../../domain/card";
import type { WorkspaceMode } from "../../domain/workspace";

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export const RANK_NAMES: Record<Rank, string> = {
  A: "Ace",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  "10": "Ten",
  J: "Jack",
  Q: "Queen",
  K: "King",
};

type PlayingCardProps = Readonly<{
  card: ObservedCard;
  compact?: boolean;
  stackIndex?: number;
  workspaceMode?: WorkspaceMode;
}>;

export function cardAccessibleName(rank: Rank, suit: Suit): string {
  return `${RANK_NAMES[rank]} of ${suit}`;
}

export default function PlayingCard({
  card,
  compact = false,
  stackIndex,
  workspaceMode = "normal",
}: PlayingCardProps) {
  const stackProps = stackIndex === undefined ? {} : {
    "data-stack-index": stackIndex,
    style: { position: "relative", zIndex: stackIndex + 1 } as const,
  };
  if (card.kind === "unknown") {
    return (
      <span
        className={`playing-card playing-card--unknown${compact ? " playing-card--compact" : ""}`}
        role="img"
        aria-label="Unknown card"
        {...stackProps}
      >
        <span aria-hidden="true">?</span>
      </span>
    );
  }

  if (card.kind === "value") {
    return (
      <span
        className={`playing-card${compact ? " playing-card--compact" : ""}`}
        role="img"
        aria-label={`${card.value} value card`}
        {...stackProps}
      >
        <span className="playing-card__marker">{card.value}</span>
      </span>
    );
  }

  if (workspaceMode === "pro") {
    const value = blackjackValueClassForRank(card.rank);
    return (
      <span
        className={`playing-card playing-card--value-projection${compact ? " playing-card--compact" : ""}`}
        role="img"
        aria-label={`${value} value card (exact ${cardAccessibleName(card.rank, card.suit)})`}
        {...stackProps}
      >
        <span className="playing-card__marker">{value}</span>
      </span>
    );
  }

  return (
    <span
      className={`playing-card playing-card--${card.suit}${compact ? " playing-card--compact" : ""}`}
      role="img"
      aria-label={cardAccessibleName(card.rank, card.suit)}
      {...stackProps}
    >
      <span className="playing-card__marker">{card.rank}</span>
      <span className="playing-card__suit" aria-hidden="true">{SUIT_SYMBOLS[card.suit]}</span>
    </span>
  );
}
