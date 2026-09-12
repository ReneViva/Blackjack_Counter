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
    case "DEAL_KNOWN_CARD":
      return appendEvent(state, {
        type: "DEAL_KNOWN_CARD",
        target: action.target,
        card: action.card,
      });
    case "DEAL_UNKNOWN_CARD":
      return appendEvent(state, {
        type: "DEAL_UNKNOWN_CARD",
        target: action.target,
      });
    case "ROUND_COMPLETE":
      return appendEvent(state, { type: "ROUND_COMPLETE" });
    case "SHUFFLE":
      return appendEvent(state, { type: "SHUFFLE" });
    case "UNDO":
      return { ...state, events: state.events.slice(0, -1) };
    case "RESET":
      return createInitialState();
    case "IMPORT_REPLAY":
      return {
        configuration: action.configuration,
        events: [...action.events],
      };
  }
}
