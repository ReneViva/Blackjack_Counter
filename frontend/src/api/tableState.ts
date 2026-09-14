import type { ObservedCard, Suit } from "../domain/card";
import type { TableTarget } from "../domain/events";
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
    splitting_enabled: boolean;
    max_split_hands: 1 | 2 | 3 | 4;
    resplit_aces: boolean;
    hit_split_aces: boolean;
    blackjack_after_split: boolean;
    doubling_enabled: boolean;
    double_after_split: boolean;
    surrender: "none" | "late";
    dealer_second_card: "hole_card" | "no_hole_card";
    dealer_blackjack_check: "peek" | "no_peek";
  }>;
  dealer: Readonly<{ cards: readonly ObservedCardPayload[] }>;
  players: readonly Readonly<{
    seat: SeatNumber;
    is_user: boolean;
    hand_id: string;
    parent_hand_id: string | null;
    split_depth: number;
    from_split_aces: boolean;
    status: "active" | "stood" | "bust" | "blackjack" | "surrendered";
    cards: readonly ObservedCardPayload[];
  }>[];
  discarded_cards: readonly ObservedCardPayload[];
}>;

function toObservedCardPayload(card: ObservedCard): ObservedCardPayload {
  return card.kind === "known"
    ? { kind: "known", rank: card.rank, suit: SUIT_CODES[card.suit] }
    : { kind: "unknown" };
}

export function toTableStatePayload(
  state: SessionState,
  analysisTarget: TableTarget | null = null,
): TableStatePayload {
  const table = selectTableState(state);
  const userHands = state.configuration.userSeat === null
    ? []
    : table.playerHands[state.configuration.userSeat];
  const selectedUserHandId = analysisTarget?.kind === "player-hand" &&
      analysisTarget.seat === state.configuration.userSeat
    ? analysisTarget.handId
    : userHands.length === 1
      ? userHands[0].handId
      : null;

  return {
    rules: {
      decks: state.configuration.rules.decks,
      dealer_soft_17: state.configuration.rules.dealerSoft17,
      splitting_enabled: state.configuration.rules.splittingEnabled,
      max_split_hands: state.configuration.rules.maxSplitHands,
      resplit_aces: state.configuration.rules.resplitAces,
      hit_split_aces: state.configuration.rules.hitSplitAces,
      blackjack_after_split: state.configuration.rules.blackjackAfterSplit,
      doubling_enabled: state.configuration.rules.doublingEnabled,
      double_after_split: state.configuration.rules.doubleAfterSplit,
      surrender: state.configuration.rules.surrender,
      dealer_second_card: state.configuration.rules.dealerSecondCard,
      dealer_blackjack_check:
        state.configuration.rules.dealerBlackjackCheck,
    },
    dealer: {
      cards: table.dealerCards.map(toObservedCardPayload),
    },
    players: state.configuration.activeSeats.flatMap((seat) =>
      table.playerHands[seat].map((hand) => ({
        seat,
        is_user: seat === state.configuration.userSeat &&
          hand.handId === selectedUserHandId,
        hand_id: hand.handId,
        parent_hand_id: hand.parentHandId,
        split_depth: hand.splitDepth,
        from_split_aces: hand.fromSplitAces,
        status: "active",
        cards: hand.cards.map(toObservedCardPayload),
      })),
    ),
    discarded_cards: table.discardedCards.map(toObservedCardPayload),
  };
}

export function toLegacyTableStatePayload(state: SessionState) {
  const current = toTableStatePayload(state);
  return {
    ...current,
    players: current.players.map((player) => ({
      seat: player.seat,
      is_user: player.is_user,
      cards: player.cards,
    })),
  };
}
