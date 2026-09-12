import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionConfiguration } from "../domain/game";
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

describe("session replay version 1", () => {
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

  it.each([undefined, 2, "1", true])("rejects missing or unsupported version %#", (version) => {
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
