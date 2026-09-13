import type { GameEvent, SessionAction } from "../domain/events";
import type { SessionConfiguration } from "../domain/game";
import { initialHandId, splitChildHandIds } from "../domain/hands";
import { createInitialState } from "./initialState";
import { selectTableState } from "./selectors";

export type SessionState = Readonly<{
  configuration: SessionConfiguration;
  events: readonly GameEvent[];
}>;

type PendingGameEvent = {
  [Type in GameEvent["type"]]: Omit<
    Extract<GameEvent, { type: Type }>,
    "id" | "sequence"
  >;
}[GameEvent["type"]];

function appendEvent(
  state: SessionState,
  event: PendingGameEvent,
): SessionState {
  const sequence = state.events.length + 1;
  const recordedEvent = {
    ...event,
    id: `evt_${sequence.toString().padStart(4, "0")}`,
    sequence,
  } as GameEvent;
  return { ...state, events: [...state.events, recordedEvent] };
}

function ensureSessionStarted(state: SessionState): SessionState {
  return state.events.some((event) => event.type === "NEW_SHOE")
    ? state
    : appendEvent(state, {
        type: "NEW_SHOE",
        configuration: state.configuration,
      });
}

function configurationFromChronology(
  fallback: SessionConfiguration,
  events: readonly GameEvent[],
): SessionConfiguration {
  const shoe = events.find((event) => event.type === "NEW_SHOE");
  let configuration = shoe?.type === "NEW_SHOE" ? shoe.configuration : fallback;
  let departureSeen = false;
  for (const event of events) {
    if (event.type === "PLAYER_ADDED") {
      configuration = {
        ...configuration,
        activeSeats: [...configuration.activeSeats, event.seat]
          .filter((seat, index, seats) => seats.indexOf(seat) === index)
          .sort((left, right) => left - right),
        userSeat: configuration.userSeat ?? (
          configuration.activeSeats.length === 0 && !departureSeen
            ? event.seat
            : null
        ),
      };
    } else if (event.type === "PLAYER_LEFT") {
      departureSeen = true;
      configuration = {
        ...configuration,
        activeSeats: configuration.activeSeats.filter(
          (seat) => seat !== event.seat,
        ),
        userSeat: configuration.userSeat === event.seat
          ? null
          : configuration.userSeat,
      };
    }
  }
  return configuration;
}

function targetExists(
  state: SessionState,
  target: Extract<SessionAction, { type: "DEAL_KNOWN_CARD" }>["target"],
): boolean {
  if (target.kind === "dealer") return true;
  const handId = target.kind === "player"
    ? initialHandId(target.seat)
    : target.handId;
  return selectTableState(state).playerHands[target.seat]
    .some((hand) => hand.handId === handId);
}

export function gameReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "CONFIGURE_SESSION":
      return state.events.length === 0
        ? { ...state, configuration: action.configuration }
        : state;
    case "NEW_SHOE":
      return appendEvent(state, {
        type: "NEW_SHOE",
        configuration: state.configuration,
      });
    case "ADD_PLAYER": {
      if (state.configuration.activeSeats.includes(action.seat)) return state;
      const started = ensureSessionStarted(state);
      const activeSeats = [...started.configuration.activeSeats, action.seat]
        .sort((left, right) => left - right);
      return appendEvent({
        ...started,
        configuration: {
          ...started.configuration,
          activeSeats,
          userSeat: started.configuration.userSeat ?? (
            started.configuration.activeSeats.length === 0 &&
            !started.events.some((event) => event.type === "PLAYER_LEFT")
              ? action.seat
              : null
          ),
        },
      }, { type: "PLAYER_ADDED", seat: action.seat });
    }
    case "SPLIT_PLAYER_HAND": {
      if (!state.configuration.activeSeats.includes(action.seat)) return state;
      const source = selectTableState(state).playerHands[action.seat].find(
        (hand) => hand.handId === action.handId,
      );
      if (!source || source.cards.length !== 2) return state;
      const [expectedLeft, expectedRight] = splitChildHandIds(source.handId);
      const exactPair = source.cards[0].kind === "known" &&
        source.cards[1].kind === "known" &&
        source.cards[0].rank === source.cards[1].rank;
      const fromSplitAces = source.fromSplitAces || (
        source.cards[0].kind === "known" && source.cards[0].rank === "A"
      );
      if (!exactPair ||
          action.leftHandId !== expectedLeft ||
          action.rightHandId !== expectedRight ||
          action.splitDepth !== source.splitDepth + 1 ||
          action.fromSplitAces !== fromSplitAces) return state;
      return appendEvent(state, {
        type: "PLAYER_HAND_SPLIT",
        seat: action.seat,
        sourceHandId: action.handId,
        leftHandId: action.leftHandId,
        rightHandId: action.rightHandId,
        splitDepth: action.splitDepth,
        fromSplitAces: action.fromSplitAces,
      });
    }
    case "LEAVE_PLAYER": {
      if (!state.configuration.activeSeats.includes(action.seat)) return state;
      return appendEvent({
        ...state,
        configuration: {
          ...state.configuration,
          activeSeats: state.configuration.activeSeats.filter(
            (seat) => seat !== action.seat,
          ),
          userSeat: state.configuration.userSeat === action.seat
            ? null
            : state.configuration.userSeat,
        },
      }, { type: "PLAYER_LEFT", seat: action.seat });
    }
    case "DEAL_KNOWN_CARD":
      if (!targetExists(state, action.target)) return state;
      return appendEvent(ensureSessionStarted(state), {
        type: "DEAL_KNOWN_CARD",
        target: action.target,
        card: action.card,
      });
    case "DEAL_UNKNOWN_CARD":
      if (!targetExists(state, action.target)) return state;
      return appendEvent(ensureSessionStarted(state), {
        type: "DEAL_UNKNOWN_CARD",
        target: action.target,
      });
    case "ROUND_COMPLETE":
      return appendEvent(state, { type: "ROUND_COMPLETE" });
    case "SHUFFLE":
      return appendEvent(state, { type: "SHUFFLE" });
    case "UNDO": {
      const undone = state.events.at(-1);
      if (!undone) return state;
      const events = state.events.slice(0, -1);
      const fallback = undone.type === "NEW_SHOE"
        ? undone.configuration
        : state.configuration;
      return {
        configuration: configurationFromChronology(fallback, events),
        events,
      };
    }
    case "RESET":
      return createInitialState();
    case "IMPORT_REPLAY":
      return {
        configuration: action.configuration,
        events: [...action.events],
      };
  }
}
