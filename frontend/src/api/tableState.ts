import type { ObservedCard, Suit } from "../domain/card";
import type { SeatNumber } from "../domain/game";
import type { SessionState } from "../state/gameReducer";
import { selectTableState } from "../state/selectors";

const SUIT_CODES: Record<Suit, "S" | "H" | "D" | "C"> = {
  spades: "S",
  hearts: "H",
  diamonds: "D",
  clubs: "C",
};

export type ObservedCardPayload =
  | Readonly<{
      kind: "known";
      rank:
        | "A"
        | "2"
        | "3"
        | "4"
        | "5"
        | "6"
        | "7"
        | "8"
        | "9"
        | "10"
        | "J"
        | "Q"
        | "K";
      suit: "S" | "H" | "D" | "C";
    }>
  | Readonly<{ kind: "unknown" }>;

export type TableStatePayload = Readonly<{
  rules: Readonly<{
    decks: number | null;
    dealer_soft_17: "hit" | "stand";
  }>;
  dealer: Readonly<{ cards: readonly ObservedCardPayload[] }>;
  players: readonly Readonly<{
    seat: SeatNumber;
    is_user: boolean;
    cards: readonly ObservedCardPayload[];
  }>[];
  discarded_cards: readonly ObservedCardPayload[];
}>;

function toObservedCardPayload(card: ObservedCard): ObservedCardPayload {
  return card.kind === "known"
    ? { kind: "known", rank: card.rank, suit: SUIT_CODES[card.suit] }
    : { kind: "unknown" };
}

export function toTableStatePayload(state: SessionState): TableStatePayload {
  const table = selectTableState(state);

  return {
    rules: {
      decks: state.configuration.rules.decks,
      dealer_soft_17: state.configuration.rules.dealerSoft17,
    },
    dealer: {
      cards: table.dealerCards.map(toObservedCardPayload),
    },
    players: state.configuration.activeSeats.map((seat) => ({
      seat,
      is_user: seat === state.configuration.userSeat,
      cards: table.playerCards[seat].map(toObservedCardPayload),
    })),
    discarded_cards: table.discardedCards.map(toObservedCardPayload),
  };
}
