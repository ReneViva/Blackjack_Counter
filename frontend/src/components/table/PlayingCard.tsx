import type { ObservedCard, Rank, Suit } from "../../domain/card";

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
}>;

export function cardAccessibleName(rank: Rank, suit: Suit): string {
  return `${RANK_NAMES[rank]} of ${suit}`;
}

export default function PlayingCard({ card, compact = false }: PlayingCardProps) {
  if (card.kind === "unknown") {
    return (
      <span
        className={`playing-card playing-card--unknown${compact ? " playing-card--compact" : ""}`}
        aria-label="Unknown card"
      >
        <span aria-hidden="true">?</span>
      </span>
    );
  }

  return (
    <span
      className={`playing-card playing-card--${card.suit}${compact ? " playing-card--compact" : ""}`}
      aria-label={cardAccessibleName(card.rank, card.suit)}
    >
      <span>{card.rank}</span>
      <span aria-hidden="true">{SUIT_SYMBOLS[card.suit]}</span>
    </span>
  );
}
