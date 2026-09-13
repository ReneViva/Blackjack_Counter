import type { KnownCard } from "./card";
import type { SeatNumber, SessionConfiguration } from "./game";

export type TableTarget =
  | Readonly<{ kind: "dealer" }>
  | Readonly<{ kind: "player-hand"; seat: SeatNumber; handId: string }>;

export type LegacyTableTarget = Readonly<{
  kind: "player";
  seat: SeatNumber;
}>;

export type RecordedTableTarget = TableTarget | LegacyTableTarget;

type EventIdentity = Readonly<{
  id: string;
  sequence: number;
}>;

export type NewShoeEvent = EventIdentity &
  Readonly<{
    type: "NEW_SHOE";
    configuration: SessionConfiguration;
  }>;

export type DealKnownCardEvent = EventIdentity &
  Readonly<{
    type: "DEAL_KNOWN_CARD";
    target: RecordedTableTarget;
    card: KnownCard;
  }>;

export type DealUnknownCardEvent = EventIdentity &
  Readonly<{
    type: "DEAL_UNKNOWN_CARD";
    target: RecordedTableTarget;
  }>;

export type PlayerAddedEvent = EventIdentity &
  Readonly<{
    type: "PLAYER_ADDED";
    seat: SeatNumber;
  }>;

export type PlayerHandSplitEvent = EventIdentity &
  Readonly<{
    type: "PLAYER_HAND_SPLIT";
    seat: SeatNumber;
    sourceHandId: string;
    leftHandId: string;
    rightHandId: string;
    splitDepth: number;
    fromSplitAces: boolean;
  }>;

export type PlayerLeftEvent = EventIdentity &
  Readonly<{
    type: "PLAYER_LEFT";
    seat: SeatNumber;
  }>;

export type RoundCompleteEvent = EventIdentity &
  Readonly<{
    type: "ROUND_COMPLETE";
  }>;

export type ShuffleEvent = EventIdentity &
  Readonly<{
    type: "SHUFFLE";
  }>;

export type GameEvent =
  | NewShoeEvent
  | PlayerAddedEvent
  | PlayerHandSplitEvent
  | PlayerLeftEvent
  | DealKnownCardEvent
  | DealUnknownCardEvent
  | RoundCompleteEvent
  | ShuffleEvent;

export type SessionAction =
  | Readonly<{
      type: "CONFIGURE_SESSION";
      configuration: SessionConfiguration;
    }>
  | Readonly<{ type: "NEW_SHOE" }>
  | Readonly<{ type: "ADD_PLAYER"; seat: SeatNumber }>
  | Readonly<{
      type: "SPLIT_PLAYER_HAND";
      seat: SeatNumber;
      handId: string;
      leftHandId: string;
      rightHandId: string;
      splitDepth: number;
      fromSplitAces: boolean;
    }>
  | Readonly<{ type: "LEAVE_PLAYER"; seat: SeatNumber }>
  | Readonly<{
      type: "DEAL_KNOWN_CARD";
      target: RecordedTableTarget;
      card: KnownCard;
    }>
  | Readonly<{
      type: "DEAL_UNKNOWN_CARD";
      target: RecordedTableTarget;
    }>
  | Readonly<{ type: "UNDO" }>
  | Readonly<{ type: "RESET" }>
  | Readonly<{ type: "ROUND_COMPLETE" }>
  | Readonly<{ type: "SHUFFLE" }>
  | Readonly<{
      type: "IMPORT_REPLAY";
      configuration: SessionConfiguration;
      events: readonly GameEvent[];
    }>;
