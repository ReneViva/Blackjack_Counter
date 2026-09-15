export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;

export type Rank = (typeof RANKS)[number];

export const BLACKJACK_VALUE_CLASSES = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;

export type BlackjackValueClass = (typeof BLACKJACK_VALUE_CLASSES)[number];

export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;

export type Suit = (typeof SUITS)[number];

export type KnownCard = Readonly<{
  kind: "known";
  rank: Rank;
  suit: Suit;
}>;

export type UnknownCard = Readonly<{
  kind: "unknown";
}>;

export type ValueOnlyCard = Readonly<{
  kind: "value";
  value: BlackjackValueClass;
}>;

export type CardObservation = KnownCard | ValueOnlyCard | UnknownCard;

export type ObservedCard = CardObservation;

export function blackjackValueClassForRank(rank: Rank): BlackjackValueClass {
  return rank === "J" || rank === "Q" || rank === "K" ? "10" : rank;
}

export function knownRankForObservation(card: ObservedCard): Rank | null {
  if (card.kind === "known") return card.rank;
  if (card.kind === "value" && card.value !== "10") return card.value;
  return null;
}

export function isKnownExactPair(cards: readonly ObservedCard[]): boolean {
  if (cards.length !== 2) return false;
  const left = knownRankForObservation(cards[0]);
  const right = knownRankForObservation(cards[1]);
  return left !== null && left === right;
}
