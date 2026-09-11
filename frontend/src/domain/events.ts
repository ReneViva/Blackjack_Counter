import type { KnownCard } from "./card";
import type { SeatNumber, SessionConfiguration } from "./game";

export type TableTarget =
  | Readonly<{ kind: "dealer" }>
  | Readonly<{ kind: "player"; seat: SeatNumber }>;

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
    target: TableTarget;
    card: KnownCard;
  }>;

export type DealUnknownCardEvent = EventIdentity &
  Readonly<{
    type: "DEAL_UNKNOWN_CARD";
    target: TableTarget;
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
  | Readonly<{
      type: "DEAL_KNOWN_CARD";
      target: TableTarget;
      card: KnownCard;
    }>
  | Readonly<{
      type: "DEAL_UNKNOWN_CARD";
      target: TableTarget;
    }>
  | Readonly<{ type: "UNDO" }>
  | Readonly<{ type: "RESET" }>
  | Readonly<{ type: "ROUND_COMPLETE" }>
  | Readonly<{ type: "SHUFFLE" }>;
