import type { SessionConfiguration } from "../domain/game";
import type { SessionState } from "./gameReducer";

export const DEFAULT_CONFIGURATION: SessionConfiguration = {
  rules: {
    decks: null,
    dealerSoft17: "stand",
  },
  activeSeats: [1],
  userSeat: 1,
};

export function createInitialState(
  configuration: SessionConfiguration = DEFAULT_CONFIGURATION,
): SessionState {
  return {
    configuration,
    events: [],
  };
}
