import type { ObservedCard } from "../domain/card";
import type { SeatNumber } from "../domain/game";
import type { SessionState } from "./gameReducer";

export type DerivedTableState = Readonly<{
  dealerCards: readonly ObservedCard[];
  playerCards: Readonly<Record<SeatNumber, readonly ObservedCard[]>>;
  discardedCards: readonly ObservedCard[];
}>;

function emptyPlayerCards(): Record<SeatNumber, ObservedCard[]> {
  return {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
    7: [],
  };
}

export function selectTableState(state: SessionState): DerivedTableState {
  let dealerCards: ObservedCard[] = [];
  let playerCards = emptyPlayerCards();
  let discardedCards: ObservedCard[] = [];

  for (const event of state.events) {
    if (event.type === "NEW_SHOE" || event.type === "SHUFFLE") {
      dealerCards = [];
      playerCards = emptyPlayerCards();
      discardedCards = [];
      continue;
    }

    if (event.type === "ROUND_COMPLETE") {
      discardedCards.push(
        ...dealerCards,
        ...state.configuration.activeSeats.flatMap(
          (seat) => playerCards[seat],
        ),
      );
      dealerCards = [];
      playerCards = emptyPlayerCards();
      continue;
    }

    if (event.type === "DEAL_KNOWN_CARD") {
      if (event.target.kind === "dealer") {
        dealerCards.push(event.card);
      } else {
        playerCards[event.target.seat].push(event.card);
      }
    }

    if (event.type === "DEAL_UNKNOWN_CARD") {
      const unknownCard = { kind: "unknown" } as const;
      if (event.target.kind === "dealer") {
        dealerCards.push(unknownCard);
      } else {
        playerCards[event.target.seat].push(unknownCard);
      }
    }
  }

  return { dealerCards, playerCards, discardedCards };
}

export function selectObservedCardCount(state: SessionState): number {
  const table = selectTableState(state);
  return (
    table.dealerCards.length +
    table.discardedCards.length +
    state.configuration.activeSeats.reduce(
      (total, seat) => total + table.playerCards[seat].length,
      0,
    )
  );
}

export function selectUnknownCardCount(state: SessionState): number {
  const table = selectTableState(state);
  const cards = [
    ...table.dealerCards,
    ...table.discardedCards,
    ...state.configuration.activeSeats.flatMap(
      (seat) => table.playerCards[seat],
    ),
  ];
  return cards.filter((card) => card.kind === "unknown").length;
}
