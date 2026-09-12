import type { GameEvent, SessionAction } from "../domain/events";
import type { SessionConfiguration } from "../domain/game";
import { createInitialState } from "./initialState";

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

  return {
    ...state,
    events: [...state.events, recordedEvent],
  };
}

function ensureSessionStarted(state: SessionState): SessionState {
  return state.events.some((event) => event.type === "NEW_SHOE")
    ? state
    : appendEvent(state, {
        type: "NEW_SHOE",
        configuration: state.configuration,
      });
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
          userSeat: started.configuration.userSeat ?? action.seat,
        },
      }, { type: "PLAYER_ADDED", seat: action.seat });
    }
    case "DEAL_KNOWN_CARD": {
      if (action.target.kind === "player" &&
          !state.configuration.activeSeats.includes(action.target.seat)) return state;
      return appendEvent(ensureSessionStarted(state), {
        type: "DEAL_KNOWN_CARD",
        target: action.target,
        card: action.card,
      });
    }
    case "DEAL_UNKNOWN_CARD": {
      if (action.target.kind === "player" &&
          !state.configuration.activeSeats.includes(action.target.seat)) return state;
      return appendEvent(ensureSessionStarted(state), {
        type: "DEAL_UNKNOWN_CARD",
        target: action.target,
      });
    }
    case "ROUND_COMPLETE":
      return appendEvent(state, { type: "ROUND_COMPLETE" });
    case "SHUFFLE":
      return appendEvent(state, { type: "SHUFFLE" });
    case "UNDO": {
      const undone = state.events.at(-1);
      if (!undone) return state;
      if (undone.type !== "PLAYER_ADDED") {
        return { ...state, events: state.events.slice(0, -1) };
      }
      const activeSeats = state.configuration.activeSeats.filter(
        (seat) => seat !== undone.seat,
      );
      return {
        configuration: {
          ...state.configuration,
          activeSeats,
          userSeat: state.configuration.userSeat === undone.seat
            ? null
            : state.configuration.userSeat,
        },
        events: state.events.slice(0, -1),
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
