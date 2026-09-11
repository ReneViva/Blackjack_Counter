import type { SessionConfiguration } from "../domain/game";
import type { SessionRules } from "../domain/rules";
import type { SessionState } from "./gameReducer";

export const DEFAULT_RULES: SessionRules = {
  decks: null,
  dealerSoft17: "stand",
  splittingEnabled: true,
  maxSplitHands: 4,
  resplitAces: false,
  hitSplitAces: false,
  blackjackAfterSplit: false,
  doublingEnabled: true,
  doubleAfterSplit: true,
  surrender: "none",
  dealerSecondCard: "hole_card",
  dealerBlackjackCheck: "no_peek",
};

export const DEFAULT_CONFIGURATION: SessionConfiguration = {
  rules: DEFAULT_RULES,
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
