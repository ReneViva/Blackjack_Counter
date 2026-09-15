import { useReducer } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { gameReducer, type SessionState } from "../state/gameReducer";
import { createInitialState } from "../state/initialState";
import TablePage from "./TablePage";


function response(payload: unknown): Response {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

function splittableState(): SessionState {
  let state = gameReducer(createInitialState(), { type: "ADD_PLAYER", seat: 4 });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "8", suit: "hearts" } });
  state = gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "player", seat: 4 }, card: { kind: "known", rank: "8", suit: "clubs" } });
  return gameReducer(state, { type: "DEAL_KNOWN_CARD", target: { kind: "dealer" }, card: { kind: "known", rank: "10", suit: "diamonds" } });
}

function Harness() {
  const [state, dispatch] = useReducer(gameReducer, splittableState());
  return <TablePage state={state} dispatch={dispatch} />;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("moves a removed split parent analysis target to the left child without coupling summary selection to assignment", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith("/player-actions")) {
      return response({ split: { allowed: true, code: null, reason: null } });
    }
    if (url.endsWith("/research/compare")) {
      return response({ method: "research_comparison", scores: [], exact_reference: null });
    }
    const body = JSON.parse(init.body as string);
    if (body.options.method === "exact_action_forecast") {
      const unavailable = (contract: string) => ({ contract, status: "unavailable", method: "exact", outcomes: null, metadata: null, error: { code: "fixture", message: "Unavailable in fixture.", field: null } });
      return response({
        method: "exact_action_forecast",
        target: body.options.target,
        action_forecasts: {
          stand_now: unavailable("stand_now"),
          hit_once_then_stand: unavailable("hit_once_then_stand"),
          double_one_card_then_stand: unavailable("double_one_card_then_stand"),
          surrender_now: { contract: "surrender_now", status: "unavailable", method: "exact", terminal: null, error: { code: "fixture", message: "Unavailable in fixture.", field: null } },
          split_one_card_each_then_stand: { contract: "split_one_card_each_then_stand", status: "unavailable", method: "exact", child_hand_1: null, child_hand_2: null, metadata: null, error: { code: "fixture", message: "Unavailable in fixture.", field: null } },
        },
      });
    }
    return response({
      method: "exact",
      state_summary: { cards_remaining: 49, known_cards: 3, hidden_cards: 0 },
      outcomes: { win: .4, push: .1, loss: .5 },
      metadata: { states_evaluated: 1, cache_hits: 0, cache_misses: 1, runtime_ms: 1, hidden_states_evaluated: 0, hidden_weight_mass: 1 },
    });
  }));
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /Seat 4, occupied, primary hand/ }));
  const split = screen.getByRole("button", { name: "Split" });
  await waitFor(() => expect(split).toBeEnabled(), { timeout: 1500 });

  fireEvent.click(split);

  const hand1Summary = screen.getByRole("button", { name: "Select Hand 1 for analysis" });
  const hand2Summary = screen.getByRole("button", { name: "Select Hand 2 for analysis" });
  expect(hand1Summary).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /Seat 4, occupied, primary hand, active target, Hand 1/ })).toBeVisible();

  fireEvent.click(hand2Summary);

  expect(hand2Summary).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /Seat 4, occupied, primary hand, active target, Hand 1/ })).toBeVisible();
});
