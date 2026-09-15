import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionConfiguration } from "../domain/game";
import { splitChildHandIds } from "../domain/hands";
import { toLegacyTableStatePayload, toTableStatePayload } from "../api/tableState";
import { gameReducer, type SessionState } from "../state/gameReducer";
import { createInitialState, DEFAULT_RULES } from "../state/initialState";
import { selectTableState } from "../state/selectors";
import {
  createSessionReplay,
  MAX_REPLAY_BYTES,
  parseSessionReplay,
  readAndValidateReplayFile,
  REPLAY_FORMAT,
  ReplayImportError,
  REPLAY_VERSION,
  serializeSessionReplay,
} from "./sessionReplay";

const configuration: SessionConfiguration = {
  rules: { ...DEFAULT_RULES, decks: 2, dealerSoft17: "hit" },
  activeSeats: [1, 3],
  userSeat: 3,
};

function nontrivialSession(): SessionState {
  let state = gameReducer(createInitialState(configuration), { type: "NEW_SHOE" });
  state = gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "player", seat: 3 },
    card: { kind: "known", rank: "A", suit: "spades" },
  });
  state = gameReducer(state, {
    type: "DEAL_UNKNOWN_CARD",
    target: { kind: "dealer" },
  });
  state = gameReducer(state, { type: "ROUND_COMPLETE" });
  state = gameReducer(state, { type: "SHUFFLE" });
  return state;
}

function mixedValueSession(): SessionState {
  let state = gameReducer(createInitialState(configuration), { type: "NEW_SHOE" });
  state = gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "dealer" },
    card: { kind: "known", rank: "A", suit: "spades" },
  });
  state = gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "player", seat: 3 },
    card: { kind: "known", rank: "Q", suit: "hearts" },
  });
  for (const value of ["7", "10"] as const) {
    state = gameReducer(state, {
      type: "DEAL_VALUE_CARD",
      target: { kind: "player", seat: 3 },
      card: { kind: "value", value },
    });
  }
  return gameReducer(state, {
    type: "DEAL_UNKNOWN_CARD",
    target: { kind: "dealer" },
  });
}

function splitValueSession(): SessionState {
  let state = gameReducer(createInitialState(configuration), { type: "NEW_SHOE" });
  for (const suit of ["hearts", "clubs"] as const) {
    state = gameReducer(state, {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "player", seat: 3 },
      card: { kind: "known", rank: "8", suit },
    });
  }
  const [leftHandId, rightHandId] = splitChildHandIds("seat-3-hand-1");
  state = gameReducer(state, {
    type: "SPLIT_PLAYER_HAND",
    seat: 3,
    handId: "seat-3-hand-1",
    leftHandId,
    rightHandId,
    splitDepth: 1,
    fromSplitAces: false,
  });
  return gameReducer(state, {
    type: "DEAL_VALUE_CARD",
    target: { kind: "player-hand", seat: 3, handId: rightHandId },
    card: { kind: "value", value: "10" },
  });
}

function replayObject(): Record<string, unknown> {
  return JSON.parse(serializeSessionReplay(nontrivialSession())) as Record<string, unknown>;
}

function replaceEvent(changes: Record<string, unknown>, index = 1): Record<string, unknown> {
  const replay = replayObject();
  const session = replay.session as { events: Record<string, unknown>[] };
  session.events[index] = { ...session.events[index], ...changes };
  return replay;
}

function expectReplayError(payload: unknown, code: string): void {
  try {
    parseSessionReplay(typeof payload === "string" ? payload : JSON.stringify(payload));
    throw new Error("expected replay to fail");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ReplayImportError);
    expect((error as ReplayImportError).code).toBe(code);
  }
}

function validationResponse(valid = true): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      valid,
      errors: valid ? [] : [{ code: "invalid_state", message: "Backend rejected state.", field: "cards" }],
      warnings: [],
    }),
  } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("versioned session replay", () => {
  it("exports the fixed format, version, configuration, chronology, and final state", () => {
    const state = nontrivialSession();
    const replay = createSessionReplay(state);

    expect(replay.format).toBe(REPLAY_FORMAT);
    expect(replay.version).toBe(REPLAY_VERSION);
    expect(replay.session.configuration).toEqual(configuration);
    expect(replay.session.events).toEqual(state.events);
    expect(replay.session.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(replay.final_state.discarded_cards).toEqual([]);
  });

  it("serializes an unchanged session deterministically without volatile or derived results", () => {
    const state = nontrivialSession();
    const first = serializeSessionReplay(state);

    expect(serializeSessionReplay(state)).toBe(first);
    expect(first).not.toMatch(/timestamp|uuid|username|probability|research_results|pearson/i);
  });

  it("replays a valid export to the equivalent session and preserves unknown cards", () => {
    const original = nontrivialSession();
    const replayed = parseSessionReplay(serializeSessionReplay(original));

    expect(replayed).toEqual(original);
    expect(replayed.events[2]).toEqual({
      id: "evt_0003",
      sequence: 3,
      type: "DEAL_UNKNOWN_CARD",
      target: { kind: "dealer" },
    });
  });

  it("reads historical replay versions 1 and 2 without changing exact-card semantics", () => {
    const original = nontrivialSession();
    const v1 = replayObject();
    v1.version = 1;
    v1.final_state = toLegacyTableStatePayload(original);
    const v2 = replayObject();
    v2.version = 2;

    for (const replay of [v1, v2]) {
      const restored = parseSessionReplay(JSON.stringify(replay));
      expect(restored).toEqual(original);
      expect(restored.events[1]).toMatchObject({
        type: "DEAL_KNOWN_CARD",
        card: { kind: "known", rank: "A", suit: "spades" },
      });
    }
  });

  it("round-trips mixed exact, value-only, and unknown precision in replay v3", () => {
    const original = mixedValueSession();
    const restored = parseSessionReplay(serializeSessionReplay(original));

    expect(restored).toEqual(original);
    expect(createSessionReplay(original).version).toBe(3);
    expect(selectTableState(restored).dealerCards).toEqual([
      { kind: "known", rank: "A", suit: "spades" },
      { kind: "unknown" },
    ]);
    expect(selectTableState(restored).playerHands[3][0].cards).toEqual([
      { kind: "known", rank: "Q", suit: "hearts" },
      { kind: "value", value: "7" },
      { kind: "value", value: "10" },
    ]);
    expect(toTableStatePayload(restored)).toEqual(toTableStatePayload(original));
  });

  it.each(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const)(
    "round-trips generic value %s without fabricating rank, suit, or Unknown",
    (value) => {
      const original = gameReducer(
        gameReducer(createInitialState(configuration), { type: "NEW_SHOE" }),
        {
          type: "DEAL_VALUE_CARD",
          target: { kind: "dealer" },
          card: { kind: "value", value },
        },
      );
      const restored = parseSessionReplay(serializeSessionReplay(original));
      expect(selectTableState(restored).dealerCards).toEqual([
        { kind: "value", value },
      ]);
    },
  );

  it("preserves split IDs, lineage, target hand, and value precision", () => {
    const original = splitValueSession();
    const restored = parseSessionReplay(serializeSessionReplay(original));

    expect(restored).toEqual(original);
    expect(selectTableState(restored).playerHands[3]).toEqual(
      selectTableState(original).playerHands[3],
    );
    expect(selectTableState(restored).playerHands[3][1]).toMatchObject({
      handId: "seat-3-hand-1-2",
      parentHandId: "seat-3-hand-1",
      cards: [
        { kind: "known", rank: "8", suit: "clubs" },
        { kind: "value", value: "10" },
      ],
    });
  });

  it("preserves value-only observations in completed and departed discard history", () => {
    let completed = gameReducer(mixedValueSession(), { type: "ROUND_COMPLETE" });
    completed = parseSessionReplay(serializeSessionReplay(completed));
    expect(selectTableState(completed).discardedCards).toContainEqual({
      kind: "value",
      value: "10",
    });

    let departed = gameReducer(splitValueSession(), { type: "LEAVE_PLAYER", seat: 3 });
    departed = parseSessionReplay(serializeSessionReplay(departed));
    expect(selectTableState(departed).discardedCards).toContainEqual({
      kind: "value",
      value: "10",
    });
  });

  it("preserves event chronology for subsequent undo", () => {
    const replayed = parseSessionReplay(serializeSessionReplay(nontrivialSession()));
    const undone = gameReducer(replayed, { type: "UNDO" });

    expect(undone.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(undone.events.at(-1)?.type).toBe("ROUND_COMPLETE");
  });

  it("preserves supported unknown model information", () => {
    const unknownModel = gameReducer(createInitialState({
      ...configuration,
      rules: { ...configuration.rules, decks: null },
    }), { type: "NEW_SHOE" });

    expect(parseSessionReplay(serializeSessionReplay(unknownModel))).toEqual(unknownModel);
  });

  it("round-trips direct player additions through event chronology", () => {
    let direct = gameReducer(createInitialState({
      ...configuration,
      activeSeats: [],
      userSeat: null,
    }), { type: "ADD_PLAYER", seat: 4 });
    direct = gameReducer(direct, {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "player", seat: 4 },
      card: { kind: "known", rank: "8", suit: "hearts" },
    });

    expect(parseSessionReplay(serializeSessionReplay(direct))).toEqual(direct);
  });

  it("compares final-state objects semantically rather than by key order", () => {
    const replay = replayObject();
    const finalState = replay.final_state as Record<string, unknown>;
    replay.final_state = Object.fromEntries(Object.entries(finalState).reverse());

    expect(parseSessionReplay(JSON.stringify(replay))).toEqual(nontrivialSession());
  });

  it("rejects malformed JSON and executable JavaScript text", () => {
    expectReplayError("{broken", "malformed_replay_json");
    expectReplayError("(()=>globalThis.compromised=true)()", "malformed_replay_json");
    expect((globalThis as { compromised?: boolean }).compromised).toBeUndefined();
  });

  it.each([
    [undefined, "invalid_replay_format"],
    ["other-format", "invalid_replay_format"],
  ])("rejects missing or wrong format %#", (format, code) => {
    const replay = replayObject();
    if (format === undefined) delete replay.format; else replay.format = format;
    expectReplayError(replay, format === undefined ? "invalid_replay_structure" : code);
  });

  it.each([undefined, 4, "1", true])("rejects missing or unsupported version %#", (version) => {
    const replay = replayObject();
    if (version === undefined) delete replay.version; else replay.version = version;
    expectReplayError(replay, version === undefined ? "invalid_replay_structure" : "unsupported_replay_version");
  });

  it("rejects missing structural fields and unsupported extra fields", () => {
    const missing = replayObject();
    delete missing.final_state;
    expectReplayError(missing, "invalid_replay_structure");

    const extra = replayObject();
    (extra.session as Record<string, unknown>).unexpected = true;
    expectReplayError(extra, "invalid_replay_structure");
  });

  it("rejects invalid rules and session setup", () => {
    const badRules = replayObject();
    const badRulesSession = badRules.session as { configuration: { rules: { decks: number } } };
    badRulesSession.configuration.rules.decks = 9;
    expectReplayError(badRules, "invalid_replay_rules");

    const badSeats = replayObject();
    const badSeatSession = badSeats.session as { configuration: { activeSeats: number[] } };
    badSeatSession.configuration.activeSeats = [1, 1];
    expectReplayError(badSeats, "invalid_replay_configuration");
  });

  it("rejects unsupported event types rather than skipping them", () => {
    expectReplayError(replaceEvent({ type: "CALCULATE_PROBABILITY" }), "unsupported_replay_event");
  });

  it.each([
    [{ kind: "known", rank: "T", suit: "spades" }, "invalid_replay_event"],
    [{ kind: "known", rank: "A", suit: "stars" }, "invalid_replay_event"],
    [{ kind: "unknown" }, "invalid_replay_structure"],
  ])("rejects invalid known-card representation %#", (card, code) => {
    expectReplayError(replaceEvent({ card }), code);
  });

  it.each([
    {},
    { kind: "value" },
    { kind: "value", value: "J" },
    { kind: "value", value: "Q" },
    { kind: "value", value: "K" },
    { kind: "value", value: 1 },
    { kind: "value", value: 11 },
    { kind: "value", value: "invalid" },
    { kind: "value", value: "10", suit: "spades" },
    { kind: "value", value: "10", rank: "10", suit: "spades" },
    { kind: "other", value: "10" },
  ])("rejects malformed value-only card representation %#", (card) => {
    const replay = JSON.parse(serializeSessionReplay(mixedValueSession())) as {
      session: { events: Array<Record<string, unknown>> };
    };
    const event = replay.session.events.find((candidate) =>
      candidate.type === "DEAL_VALUE_CARD"
    )!;
    event.card = card;
    expectReplayError(replay, Object.keys(card).length === 2
      ? "invalid_replay_event"
      : "invalid_replay_structure");
  });

  it("rejects a value-only event declared as historical replay v2", () => {
    const replay = JSON.parse(serializeSessionReplay(mixedValueSession())) as Record<string, unknown>;
    replay.version = 2;
    expectReplayError(replay, "unsupported_replay_event");
  });

  it("rejects an event targeting an inactive player seat", () => {
    expectReplayError(
      replaceEvent({ target: { kind: "player", seat: 2 } }),
      "invalid_replay_event",
    );
  });

  it("rejects nonsequential event identity and chronology", () => {
    expectReplayError(replaceEvent({ sequence: 9 }), "invalid_replay_chronology");
    expectReplayError(replaceEvent({ id: "evt_9000" }), "invalid_replay_chronology");
    const replay = replayObject();
    (replay.session as { events: Record<string, unknown>[] }).events.reverse();
    expectReplayError(replay, "invalid_replay_chronology");
  });

  it("rejects a NEW_SHOE configuration mismatch", () => {
    const replay = replayObject();
    const session = replay.session as { events: Record<string, unknown>[] };
    const event = session.events[0];
    event.configuration = { ...configuration, userSeat: 1 };

    expectReplayError(replay, "invalid_replay_chronology");
  });

  it("rejects final-state integrity mismatch", () => {
    const replay = replayObject();
    const finalState = replay.final_state as { dealer: { cards: unknown[] } };
    finalState.dealer.cards.push({ kind: "unknown" });

    expectReplayError(replay, "replay_integrity_mismatch");
  });

  it("rejects replay text larger than 1 MiB", () => {
    expectReplayError(" ".repeat(MAX_REPLAY_BYTES + 1), "replay_too_large");
  });

  it("rejects an oversized File before reading or parsing it", async () => {
    const text = vi.fn();
    const file = { size: MAX_REPLAY_BYTES + 1, text } as unknown as File;

    await expect(readAndValidateReplayFile(file)).rejects.toMatchObject({ code: "replay_too_large" });
    expect(text).not.toHaveBeenCalled();
  });

  it("calls backend validation with the reconstructed state before returning it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(validationResponse());
    vi.stubGlobal("fetch", fetchMock);
    const state = nontrivialSession();
    const file = {
      size: serializeSessionReplay(state).length,
      text: async () => serializeSessionReplay(state),
    } as File;

    await expect(readAndValidateReplayFile(file)).resolves.toEqual(state);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/validate");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(createSessionReplay(state).final_state);
  });

  it("rejects a backend-invalid candidate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(validationResponse(false)));
    const serialized = serializeSessionReplay(nontrivialSession());
    const file = { size: serialized.length, text: async () => serialized } as File;

    await expect(readAndValidateReplayFile(file)).rejects.toMatchObject({
      code: "backend_invalid_replay",
      message: "Backend rejected state.",
    });
  });
});
