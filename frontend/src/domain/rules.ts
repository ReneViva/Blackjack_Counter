export const DECK_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type DeckCount = (typeof DECK_COUNTS)[number];
export type DealerSoft17 = "hit" | "stand";

export type SessionRules = Readonly<{
  decks: DeckCount | null;
  dealerSoft17: DealerSoft17;
}>;
