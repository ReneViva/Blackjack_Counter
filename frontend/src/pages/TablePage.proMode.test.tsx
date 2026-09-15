import { useReducer } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toTableStatePayload } from "../api/tableState";
import { splitChildHandIds } from "../domain/hands";
import { gameReducer, type SessionState } from "../state/gameReducer";
import { createInitialState } from "../state/initialState";
import { DEVICE_PREFERENCES_KEY, loadDevicePreferences } from "../state/preferences";
import TablePage from "./TablePage";

function splitSession(): SessionState {
  let state = gameReducer(createInitialState(), { type: "ADD_PLAYER", seat: 4 });
  for (const suit of ["hearts", "clubs"] as const) {
    state = gameReducer(state, {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "player", seat: 4 },
      card: { kind: "known", rank: "8", suit },
    });
  }
  const [leftHandId, rightHandId] = splitChildHandIds("seat-4-hand-1");
  state = gameReducer(state, {
    type: "SPLIT_PLAYER_HAND",
    seat: 4,
    handId: "seat-4-hand-1",
    leftHandId,
    rightHandId,
    splitDepth: 1,
    fromSplitAces: false,
  });
  return gameReducer(state, {
    type: "DEAL_VALUE_CARD",
    target: { kind: "player-hand", seat: 4, handId: rightHandId },
    card: { kind: "value", value: "10" },
  });
}

function dealerSession(): SessionState {
  let state = gameReducer(createInitialState(), { type: "NEW_SHOE" });
  state = gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "dealer" },
    card: { kind: "known", rank: "Q", suit: "hearts" },
  });
  return gameReducer(state, {
    type: "DEAL_VALUE_CARD",
    target: { kind: "dealer" },
    card: { kind: "value", value: "10" },
  });
}

function Harness({ initial }: Readonly<{ initial: SessionState }>) {
  const [state, dispatch] = useReducer(gameReducer, initial);
  return <>
    <TablePage state={state} dispatch={dispatch} />
    <output data-testid="session-snapshot">
      {JSON.stringify({
        configuration: state.configuration,
        events: state.events,
        payload: toTableStatePayload(state),
      })}
    </output>
  </>;
}

function snapshot(): {
  configuration: SessionState["configuration"];
  events: SessionState["events"];
  payload: ReturnType<typeof toTableStatePayload>;
} {
  return JSON.parse(screen.getByTestId("session-snapshot").textContent!) as ReturnType<typeof snapshot>;
}

beforeEach(() => {
  window.localStorage.removeItem(DEVICE_PREFERENCES_KEY);
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
});

afterEach(() => {
  window.localStorage.removeItem(DEVICE_PREFERENCES_KEY);
  vi.unstubAllGlobals();
});

describe("Pro Mode workspace integration", () => {
  it("scopes the professional three-column presentation to Pro Mode", () => {
    render(<Harness initial={createInitialState()} />);
    const page = document.querySelector<HTMLElement>(".table-page");
    const analysis = screen.getByLabelText("Blackjack probability workspace")
      .querySelector(".analysis-sidebar");

    expect(page).toHaveAttribute("data-workspace-mode", "normal");
    expect(analysis).not.toHaveClass("analysis-sidebar--pro");
    expect(screen.getByLabelText("Blackjack table workspace")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Card Assignment" })).toBeVisible();

    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));

    expect(page).toHaveAttribute("data-workspace-mode", "pro");
    expect(analysis).toHaveClass("analysis-sidebar--pro");
    expect(screen.getByLabelText("Blackjack table workspace")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Card Assignment" })).toBeVisible();

    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    expect(page).toHaveAttribute("data-workspace-mode", "normal");
    expect(analysis).not.toHaveClass("analysis-sidebar--pro");
  });

  it("toggles presentation without changing configuration or chronology", () => {
    const initial = dealerSession();
    render(<Harness initial={initial} />);
    const before = snapshot();

    expect(screen.getByRole("img", { name: "Queen of hearts" })).toBeVisible();
    expect(screen.getByRole("img", { name: "10 value card" })).toBeVisible();
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));

    expect(screen.getByRole("img", {
      name: "10 value card (exact Queen of hearts)",
    })).toBeVisible();
    expect(screen.getByRole("img", { name: "10 value card" })).toBeVisible();
    expect(snapshot().configuration).toEqual(before.configuration);
    expect(snapshot().events).toEqual(before.events);

    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    expect(screen.getByRole("img", { name: "Queen of hearts" })).toBeVisible();
    expect(screen.getByRole("img", { name: "10 value card" })).toBeVisible();
    expect(snapshot()).toEqual(before);
  });

  it("restores Pro ON and Normal OFF without adding chronology events", () => {
    const initial = dealerSession();
    const first = render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    expect(loadDevicePreferences().workspaceMode).toBe("pro");
    expect(snapshot().events).toEqual(initial.events);
    first.unmount();

    const second = render(<Harness initial={initial} />);
    expect(document.querySelector(".table-page")).toHaveAttribute(
      "data-workspace-mode", "pro",
    );
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    expect(loadDevicePreferences().workspaceMode).toBe("normal");
    expect(snapshot().events).toEqual(initial.events);
    second.unmount();

    render(<Harness initial={initial} />);
    expect(document.querySelector(".table-page")).toHaveAttribute(
      "data-workspace-mode", "normal",
    );
  });

  it("preserves split IDs and active target while assigning through DEAL_VALUE_CARD", () => {
    const initial = splitSession();
    render(<Harness initial={initial} />);
    const before = snapshot();

    fireEvent.click(screen.getByRole("button", {
      name: /Seat 4, occupied, primary hand, Hand 2/,
    }));
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));

    expect(screen.getByRole("button", {
      name: /Seat 4, occupied, primary hand, active target, Hand 2/,
    })).toBeVisible();
    expect(screen.getAllByRole("img", { name: /8 value card \(exact Eight of/ }))
      .toHaveLength(2);
    expect(screen.getByRole("img", { name: "10 value card" })).toBeVisible();
    expect(snapshot().events).toEqual(before.events);

    fireEvent.click(screen.getByRole("button", { name: "Seven, 4 remaining" }));
    const afterAssignment = snapshot();
    expect(afterAssignment.events).toHaveLength(before.events.length + 1);
    expect(afterAssignment.events.at(-1)).toMatchObject({
      type: "DEAL_VALUE_CARD",
      target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" },
      card: { kind: "value", value: "7" },
    });
    expect(afterAssignment.payload.players.find(
      (hand) => hand.hand_id === "seat-4-hand-1-2",
    )?.cards.at(-1)).toEqual({ kind: "value", value: "7" });
    expect(within(screen.getByLabelText("Seat 4, Hand 2 observed cards"))
      .getByRole("img", { name: "7 value card" })).toBeVisible();

    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    expect(screen.getByRole("img", { name: "Eight of hearts" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Eight of clubs" })).toBeVisible();
    expect(screen.getByRole("img", { name: "10 value card" })).toBeVisible();
    expect(screen.getByRole("img", { name: "7 value card" })).toBeVisible();
    expect(snapshot().payload.players.map((hand) => ({
      handId: hand.hand_id,
      parent: hand.parent_hand_id,
    }))).toEqual([
      { handId: "seat-4-hand-1-1", parent: "seat-4-hand-1" },
      { handId: "seat-4-hand-1-2", parent: "seat-4-hand-1" },
    ]);
  });

  it("assigns a Pro value to Dealer through the same reducer path", () => {
    const initial = gameReducer(createInitialState(), { type: "NEW_SHOE" });
    render(<Harness initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Dealer" }));
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Ace, 4 remaining" }));

    expect(snapshot().events.at(-1)).toMatchObject({
      type: "DEAL_VALUE_CARD",
      target: { kind: "dealer" },
      card: { kind: "value", value: "A" },
    });
    expect(snapshot().payload.dealer.cards).toEqual([{ kind: "value", value: "A" }]);
    expect(screen.getByRole("img", { name: "A value card" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ace, 3 remaining" })).toBeEnabled();
  });

  it("uses the latest selected split child for keyboard assignment", () => {
    const initial = splitSession();
    render(<Harness initial={initial} />);

    fireEvent.click(screen.getByRole("button", {
      name: /Seat 4, occupied, primary hand, Hand 1/,
    }));
    fireEvent.click(screen.getByRole("button", {
      name: /Seat 4, occupied, primary hand, Hand 2/,
    }));
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    const before = snapshot();

    fireEvent.keyDown(window, { key: "0" });

    const after = snapshot();
    expect(after.events).toHaveLength(before.events.length + 1);
    expect(after.events.at(-1)).toMatchObject({
      type: "DEAL_VALUE_CARD",
      target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" },
      card: { kind: "value", value: "10" },
    });
    expect(after.payload.players.find(
      (hand) => hand.hand_id === "seat-4-hand-1-2",
    )?.cards.at(-1)).toEqual({ kind: "value", value: "10" });
  });

  it("produces equivalent chronology and payload for click 10 and keyboard 0", () => {
    const initial = gameReducer(createInitialState(), { type: "NEW_SHOE" });
    const clickRender = render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Dealer" }));
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    fireEvent.click(screen.getByRole("button", { name: /Ten-valued card, 16 remaining/ }));
    const clicked = snapshot();
    clickRender.unmount();
    window.localStorage.removeItem(DEVICE_PREFERENCES_KEY);

    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Dealer" }));
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    fireEvent.keyDown(window, { key: "0" });
    const keyed = snapshot();

    expect(keyed).toEqual(clicked);
    expect(keyed.events.at(-1)).toMatchObject({
      type: "DEAL_VALUE_CARD",
      target: { kind: "dealer" },
      card: { kind: "value", value: "10" },
    });
  });

  it("navigates to the next split hand before assigning 0", () => {
    render(<Harness initial={splitSession()} />);
    fireEvent.click(screen.getByRole("button", {
      name: /Seat 4, occupied, primary hand, Hand 1/,
    }));
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    const before = snapshot();

    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(snapshot().events).toEqual(before.events);
    const activeHand = screen.getByRole("button", {
      name: /Seat 4, occupied, primary hand, active target, Hand 2/,
    });
    expect(activeHand).toHaveAttribute("aria-pressed", "true");
    expect(within(activeHand).getByText("Active")).toBeVisible();
    expect(screen.getByText("Active target: Seat 4, Hand 2."))
      .toHaveAttribute("aria-live", "polite");

    fireEvent.keyDown(window, { key: "0" });

    expect(snapshot().events).toHaveLength(before.events.length + 1);
    expect(snapshot().events.at(-1)).toMatchObject({
      type: "DEAL_VALUE_CARD",
      target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" },
      card: { kind: "value", value: "10" },
    });
  });

  it("navigates Up to Dealer before assigning 1 without recording the arrow", () => {
    render(<Harness initial={splitSession()} />);
    fireEvent.click(screen.getByRole("button", {
      name: /Seat 4, occupied, primary hand, Hand 2/,
    }));
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    const before = snapshot();

    fireEvent.keyDown(window, { key: "ArrowUp" });

    expect(snapshot().events).toEqual(before.events);
    expect(screen.getByRole("button", { name: "Dealer, active target" }))
      .toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "1" });

    expect(snapshot().events.at(-1)).toMatchObject({
      type: "DEAL_VALUE_CARD",
      target: { kind: "dealer" },
      card: { kind: "value", value: "A" },
    });
  });

  it("keeps rapid arrow and value commands in deterministic target order", () => {
    let initial = createInitialState();
    for (const seat of [1, 2, 3] as const) {
      initial = gameReducer(initial, { type: "ADD_PLAYER", seat });
    }
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: /Seat 1, occupied.*Hand 1/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    const before = snapshot();

    for (const key of ["ArrowRight", "5", "ArrowRight", "7"] as const) {
      fireEvent.keyDown(window, { key });
    }

    const appended = snapshot().events.slice(before.events.length);
    expect(appended).toHaveLength(2);
    expect(appended).toEqual([
      expect.objectContaining({
        type: "DEAL_VALUE_CARD",
        target: { kind: "player-hand", seat: 2, handId: "seat-2-hand-1" },
        card: { kind: "value", value: "5" },
      }),
      expect.objectContaining({
        type: "DEAL_VALUE_CARD",
        target: { kind: "player-hand", seat: 3, handId: "seat-3-hand-1" },
        card: { kind: "value", value: "7" },
      }),
    ]);
  });

  it("renders rapid 2-5-0-7 input synchronously while coalescing analysis to the final state", async () => {
    let initial = gameReducer(createInitialState(), { type: "NEW_SHOE" });
    initial = gameReducer(initial, { type: "ADD_PLAYER", seat: 4 });
    initial = gameReducer(initial, {
      type: "DEAL_VALUE_CARD",
      target: { kind: "dealer" },
      card: { kind: "value", value: "A" },
    });
    initial = gameReducer(initial, {
      type: "DEAL_VALUE_CARD",
      target: { kind: "player", seat: 4 },
      card: { kind: "value", value: "3" },
    });
    const pending = new Promise<Response>(() => undefined);
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => pending);
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", {
      name: /Seat 4, occupied, primary hand, Hand 1/,
    }));
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));
    const before = snapshot();

    for (const key of ["2", "5", "0", "7"]) {
      fireEvent.keyDown(window, { key });
    }

    const appended = snapshot().events.slice(before.events.length);
    expect(appended).toHaveLength(4);
    expect(appended.map((event) => event.type === "DEAL_VALUE_CARD" && event.card.value))
      .toEqual(["2", "5", "10", "7"]);
    const hand = screen.getByLabelText("Seat 4 observed cards");
    for (const value of ["2", "5", "10", "7"]) {
      expect(within(hand).getByRole("img", { name: `${value} value card` })).toBeVisible();
    }

    await waitFor(() => {
      const analysisBodies = fetchMock.mock.calls.flatMap(([url, init]) => {
        if (!(typeof url === "string") || !url.endsWith("/analyze") || !init) return [];
        return [JSON.parse((init as RequestInit).body as string) as {
          options: { method: string };
          state: { players: Array<{ hand_id: string; cards: Array<{ value?: string }> }> };
        }];
      });
      const methods = analysisBodies.map((body) => body.options.method);
      expect(methods.filter((method) => method === "exact")).toHaveLength(1);
      expect(methods.filter((method) => method === "exact_action_forecast")).toHaveLength(1);
      const exactBody = analysisBodies.find((body) => body.options.method === "exact");
      expect(exactBody?.state.players.find((hand) => hand.hand_id === "seat-4-hand-1")
        ?.cards.map((card) => card.value)).toEqual(["3", "2", "5", "10", "7"]);
      expect(fetchMock.mock.calls.filter(([url]) =>
        typeof url === "string" && url.endsWith("/player-actions")
      )).toHaveLength(1);
    }, { timeout: 1500 });
  });

  it("re-derives navigation after add and leave while skipping empty seats", () => {
    let initial = createInitialState();
    initial = gameReducer(initial, { type: "ADD_PLAYER", seat: 1 });
    initial = gameReducer(initial, { type: "ADD_PLAYER", seat: 3 });
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));

    fireEvent.click(screen.getByRole("button", { name: /Seat 1, occupied.*Hand 1/ }));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: /Seat 3, occupied.*active target.*Hand 1/ }))
      .toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Add player at Seat 5" }));
    fireEvent.click(screen.getByRole("button", { name: /Seat 3, occupied.*Hand 1/ }));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: /Seat 5, occupied.*active target.*Hand 1/ }))
      .toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Leave Seat 5" }));
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: /Seat 1, occupied.*active target.*Hand 1/ }))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "Add player at Seat 5" })).toBeVisible();
  });

  it("drops obsolete split targets after round completion and navigates the replacement hand", async () => {
    render(<Harness initial={splitSession()} />);
    fireEvent.click(screen.getByRole("button", {
      name: /Seat 4, occupied, primary hand, Hand 2/,
    }));
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));

    fireEvent.click(screen.getByRole("button", { name: "Complete round" }));
    await waitFor(() => expect(screen.getByText(
      "Select the dealer or an occupied player first, then choose a hand.",
    )).toBeVisible());
    expect(screen.getAllByRole("button", { name: /Seat 4, occupied.*Hand 1/ }))
      .toHaveLength(1);

    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(screen.getByRole("button", {
      name: /Seat 4, occupied, primary hand, active target, Hand 1/,
    })).toBeVisible();
  });

  it.each([
    [[1], 1],
    [[1, 3], 1],
    [[1, 3, 5], 3],
    [[1, 3, 5, 7], 3],
  ] as const)("Down selects the required lower middle for %s occupied seats", (seats, expectedSeat) => {
    let initial = createInitialState();
    for (const seat of seats) initial = gameReducer(initial, { type: "ADD_PLAYER", seat });
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("switch", { name: "Pro Mode" }));

    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(screen.getByRole("button", {
      name: new RegExp(`Seat ${expectedSeat}, occupied.*active target.*Hand 1`),
    })).toBeVisible();
  });
});
