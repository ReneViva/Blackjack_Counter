import type { ObservedCard } from "../domain/card";
import type { RecordedTableTarget } from "../domain/events";
import type { SeatNumber } from "../domain/game";
import { initialHandId } from "../domain/hands";
import type { SessionState } from "./gameReducer";

export type DerivedPlayerHand = Readonly<{
  handId: string;
  parentHandId: string | null;
  splitDepth: number;
  fromSplitAces: boolean;
  cards: readonly ObservedCard[];
}>;

export type DerivedTableState = Readonly<{
  dealerCards: readonly ObservedCard[];
  playerHands: Readonly<Record<SeatNumber, readonly DerivedPlayerHand[]>>;
  discardedCards: readonly ObservedCard[];
}>;

function emptyPlayerHands(): Record<SeatNumber, DerivedPlayerHand[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
}

function initialHand(seat: SeatNumber): DerivedPlayerHand {
  return {
    handId: initialHandId(seat),
    parentHandId: null,
    splitDepth: 0,
    fromSplitAces: false,
    cards: [],
  };
}

function resetOccupiedHands(
  playerHands: Record<SeatNumber, DerivedPlayerHand[]>,
  occupied: ReadonlySet<SeatNumber>,
): void {
  for (const seat of Object.keys(playerHands).map(Number) as SeatNumber[]) {
    playerHands[seat] = occupied.has(seat) ? [initialHand(seat)] : [];
  }
}

function handForTarget(
  playerHands: Record<SeatNumber, DerivedPlayerHand[]>,
  target: Exclude<RecordedTableTarget, { kind: "dealer" }>,
): DerivedPlayerHand | undefined {
  const handId = target.kind === "player"
    ? initialHandId(target.seat)
    : target.handId;
  return playerHands[target.seat].find((hand) => hand.handId === handId);
}

export function selectTableState(state: SessionState): DerivedTableState {
  let dealerCards: ObservedCard[] = [];
  const playerHands = emptyPlayerHands();
  let discardedCards: ObservedCard[] = [];
  const firstShoe = state.events.find((event) => event.type === "NEW_SHOE");
  const occupied = new Set<SeatNumber>(
    firstShoe?.type === "NEW_SHOE"
      ? firstShoe.configuration.activeSeats
      : state.configuration.activeSeats,
  );
  resetOccupiedHands(playerHands, occupied);

  for (const event of state.events) {
    if (event.type === "NEW_SHOE") {
      dealerCards = [];
      discardedCards = [];
      occupied.clear();
      event.configuration.activeSeats.forEach((seat) => occupied.add(seat));
      resetOccupiedHands(playerHands, occupied);
      continue;
    }

    if (event.type === "PLAYER_ADDED") {
      occupied.add(event.seat);
      playerHands[event.seat] = [initialHand(event.seat)];
      continue;
    }

    if (event.type === "PLAYER_LEFT") {
      discardedCards.push(
        ...playerHands[event.seat].flatMap((hand) => hand.cards),
      );
      playerHands[event.seat] = [];
      occupied.delete(event.seat);
      continue;
    }

    if (event.type === "SHUFFLE") {
      dealerCards = [];
      discardedCards = [];
      resetOccupiedHands(playerHands, occupied);
      continue;
    }

    if (event.type === "ROUND_COMPLETE") {
      discardedCards.push(
        ...dealerCards,
        ...([...occupied].sort((a, b) => a - b).flatMap(
          (seat) => playerHands[seat].flatMap((hand) => hand.cards),
        )),
      );
      dealerCards = [];
      resetOccupiedHands(playerHands, occupied);
      continue;
    }

    if (event.type === "PLAYER_HAND_SPLIT") {
      const hands = playerHands[event.seat];
      const sourceIndex = hands.findIndex(
        (hand) => hand.handId === event.sourceHandId,
      );
      const source = hands[sourceIndex];
      if (!source || source.cards.length !== 2) continue;
      playerHands[event.seat] = [
        ...hands.slice(0, sourceIndex),
        {
          handId: event.leftHandId,
          parentHandId: source.handId,
          splitDepth: event.splitDepth,
          fromSplitAces: event.fromSplitAces,
          cards: [source.cards[0]],
        },
        {
          handId: event.rightHandId,
          parentHandId: source.handId,
          splitDepth: event.splitDepth,
          fromSplitAces: event.fromSplitAces,
          cards: [source.cards[1]],
        },
        ...hands.slice(sourceIndex + 1),
      ];
      continue;
    }

    if (event.type === "DEAL_KNOWN_CARD") {
      if (event.target.kind === "dealer") {
        dealerCards.push(event.card);
      } else {
        const hand = handForTarget(playerHands, event.target);
        if (hand) (hand.cards as ObservedCard[]).push(event.card);
      }
      continue;
    }

    if (event.type === "DEAL_VALUE_CARD") {
      if (event.target.kind === "dealer") {
        dealerCards.push(event.card);
      } else {
        const hand = handForTarget(playerHands, event.target);
        if (hand) (hand.cards as ObservedCard[]).push(event.card);
      }
      continue;
    }

    if (event.type === "DEAL_UNKNOWN_CARD") {
      const unknownCard = { kind: "unknown" } as const;
      if (event.target.kind === "dealer") {
        dealerCards.push(unknownCard);
      } else {
        const hand = handForTarget(playerHands, event.target);
        if (hand) (hand.cards as ObservedCard[]).push(unknownCard);
      }
    }
  }

  return { dealerCards, playerHands, discardedCards };
}

export function selectPlayerHand(
  state: SessionState,
  seat: SeatNumber,
  handId: string,
): DerivedPlayerHand | null {
  return selectTableState(state).playerHands[seat].find(
    (hand) => hand.handId === handId,
  ) ?? null;
}

export function selectObservedCardCount(state: SessionState): number {
  const table = selectTableState(state);
  return table.dealerCards.length + table.discardedCards.length +
    Object.values(table.playerHands).flatMap((hands) =>
      hands.flatMap((hand) => hand.cards)
    ).length;
}

export function selectUnknownCardCount(state: SessionState): number {
  const table = selectTableState(state);
  return [
    ...table.dealerCards,
    ...table.discardedCards,
    ...Object.values(table.playerHands).flatMap((hands) =>
      hands.flatMap((hand) => hand.cards)
    ),
  ].filter((card) => card.kind === "unknown").length;
}
