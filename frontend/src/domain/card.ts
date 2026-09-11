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

export type ObservedCard = KnownCard | UnknownCard;
