import { describe, expect, it, vi } from "vitest";

import { parseSessionReplay, serializeSessionReplay } from "../replay/sessionReplay";
import { toTableStatePayload } from "../api/tableState";
import { splitChildHandIds } from "../domain/hands";
import { gameReducer, type SessionState } from "./gameReducer";
import { createInitialState } from "./initialState";
import {
  clearSession,
  createPersistedSession,
  loadSession,
  MAX_PERSISTED_SESSION_BYTES,
  parsePersistedSession,
  saveSession,
  serializePersistedSession,
  SESSION_SCHEMA_VERSION,
  SESSION_STORAGE_FORMAT,
  SESSION_STORAGE_KEY,
  SessionPersistenceError,
  type SessionStorage,
} from "./persistence";
import { selectTableState } from "./selectors";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: SessionStorage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
  return { storage, values };
}

function activeSession(): SessionState {
  let state = gameReducer(createInitialState(), { type: "ADD_PLAYER", seat: 4 });
  state = gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "player", seat: 4 },
    card: { kind: "known", rank: "8", suit: "hearts" },
  });
  state = gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "player", seat: 4 },
    card: { kind: "known", rank: "6", suit: "spades" },
  });
  state = gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "dealer" },
    card: { kind: "known", rank: "10", suit: "diamonds" },
  });
  return gameReducer(state, {
    type: "DEAL_UNKNOWN_CARD",
    target: { kind: "dealer" },
  });
}

function valueSession(): SessionState {
  let state = activeSession();
  state = gameReducer(state, {
    type: "DEAL_VALUE_CARD",
    target: { kind: "player", seat: 4 },
    card: { kind: "value", value: "A" },
  });
  return gameReducer(state, {
    type: "DEAL_VALUE_CARD",
    target: { kind: "dealer" },
    card: { kind: "value", value: "10" },
  });
}

function splitValueSession(): SessionState {
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

function expectPersistenceCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error("Expected persistence operation to fail.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(SessionPersistenceError);
    expect((error as SessionPersistenceError).code).toBe(code);
  }
}

describe("versioned session persistence", () => {
  it("serializes the required format, version, configuration, and ordered chronology", () => {
    const state = activeSession();
    const envelope = JSON.parse(serializePersistedSession(state)) as Record<string, unknown>;

    expect(envelope.format).toBe(SESSION_STORAGE_FORMAT);
    expect(envelope.version).toBe(SESSION_SCHEMA_VERSION);
    expect(Object.keys(envelope).sort()).toEqual(["format", "session", "version"]);
    expect(envelope.session).toEqual({
      configuration: state.configuration,
      events: state.events,
    });
    expect(createPersistedSession(state).session.events.map((event) => event.type)).toEqual([
      "NEW_SHOE",
      "PLAYER_ADDED",
      "DEAL_KNOWN_CARD",
      "DEAL_KNOWN_CARD",
      "DEAL_KNOWN_CARD",
      "DEAL_UNKNOWN_CARD",
    ]);
  });

  it("round-trips player occupancy, known cards, and an unknown observation", () => {
    const state = activeSession();
    const restored = parsePersistedSession(serializePersistedSession(state));

    expect(restored).toEqual(state);
    expect(restored.configuration.activeSeats).toEqual([4]);
    expect(restored.configuration.userSeat).toBe(4);
    expect(selectTableState(restored).playerHands[4][0].cards).toEqual([
      { kind: "known", rank: "8", suit: "hearts" },
      { kind: "known", rank: "6", suit: "spades" },
    ]);
    expect(selectTableState(restored).dealerCards.at(-1)).toEqual({ kind: "unknown" });
  });

  it("round-trips mixed exact, value-only, and unknown chronology without precision loss", () => {
    const original = valueSession();
    const serialized = serializePersistedSession(original);
    const restored = parsePersistedSession(serialized);

    expect(restored).toEqual(original);
    expect(selectTableState(restored).playerHands[4][0].cards.at(-1)).toEqual({
      kind: "value",
      value: "A",
    });
    expect(selectTableState(restored).dealerCards.at(-1)).toEqual({
      kind: "value",
      value: "10",
    });
    expect(toTableStatePayload(restored)).toEqual(toTableStatePayload(original));
    expect(JSON.parse(serialized)).not.toHaveProperty("analysis");
  });

  it("reads historical storage versions 1 and 2", () => {
    const current = createPersistedSession(activeSession());
    for (const version of [1, 2]) {
      expect(parsePersistedSession(JSON.stringify({ ...current, version })))
        .toEqual(activeSession());
    }
  });

  it("preserves split hand identity and value-only targeting across reload", () => {
    const original = splitValueSession();
    const restored = parsePersistedSession(serializePersistedSession(original));

    expect(restored).toEqual(original);
    expect(selectTableState(restored).playerHands[4][1]).toMatchObject({
      handId: "seat-4-hand-1-2",
      parentHandId: "seat-4-hand-1",
      splitDepth: 1,
      cards: [
        { kind: "known", rank: "8", suit: "clubs" },
        { kind: "value", value: "10" },
      ],
    });
  });

  it("preserves completed-round, discard, shuffle, and undo chronology", () => {
    let state = gameReducer(activeSession(), { type: "ROUND_COMPLETE" });
    state = gameReducer(state, { type: "SHUFFLE" });
    const restored = parsePersistedSession(serializePersistedSession(state));

    expect(restored.events.at(-2)?.type).toBe("ROUND_COMPLETE");
    expect(restored.events.at(-1)?.type).toBe("SHUFFLE");
    expect(selectTableState(restored).discardedCards).toEqual([]);

    const undone = gameReducer(restored, { type: "UNDO" });
    const restoredAfterUndo = parsePersistedSession(serializePersistedSession(undone));
    expect(restoredAfterUndo.events.at(-1)?.type).toBe("ROUND_COMPLETE");
    expect(selectTableState(restoredAfterUndo).discardedCards).toHaveLength(4);
  });

  it("persists no analysis response, active target, file path, or personal metadata", () => {
    const serialized = serializePersistedSession(activeSession());

    for (const forbidden of [
      "activeTarget",
      "proMode",
      "inputMode",
      "workspaceMode",
      "analysisResponse",
      "confidenceInterval",
      "researchResponse",
      "username",
      "account",
      "location",
      "ipAddress",
      "fingerprint",
      "filePath",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("supports the ordinary empty initial session", () => {
    const initial = createInitialState();
    expect(parsePersistedSession(serializePersistedSession(initial))).toEqual(initial);
  });

  it("keeps the persistence and replay envelopes distinct", () => {
    expectPersistenceCode(
      () => parsePersistedSession(serializeSessionReplay(activeSession())),
      "invalid_persistence_structure",
    );
  });

  it("restores into the ordinary reducer and remains replay-export compatible", () => {
    const restored = parsePersistedSession(serializePersistedSession(activeSession()));
    const replayRestored = parseSessionReplay(serializeSessionReplay(restored));

    expect(replayRestored).toEqual(restored);
    expect(gameReducer(restored, { type: "UNDO" }).events).toHaveLength(
      restored.events.length - 1,
    );
  });
});

describe("strict persistence parsing", () => {
  it("rejects malformed JSON", () => {
    expectPersistenceCode(() => parsePersistedSession("{"), "malformed_persistence_json");
  });

  it("rejects the wrong format and unsupported versions", () => {
    const envelope = createPersistedSession(activeSession());
    expectPersistenceCode(
      () => parsePersistedSession(JSON.stringify({ ...envelope, format: "other" })),
      "invalid_persistence_format",
    );
    expectPersistenceCode(
      () => parsePersistedSession(JSON.stringify({ ...envelope, version: 4 })),
      "unsupported_persistence_version",
    );
  });

  it("rejects unsupported envelope fields and malformed sessions", () => {
    const envelope = createPersistedSession(activeSession());
    expectPersistenceCode(
      () => parsePersistedSession(JSON.stringify({ ...envelope, analysis: {} })),
      "invalid_persistence_structure",
    );
    expectPersistenceCode(
      () => parsePersistedSession(JSON.stringify({ ...envelope, session: { events: [] } })),
      "invalid_persistence_session",
    );
  });

  it("rejects unsupported events and impossible chronology", () => {
    const envelope = createPersistedSession(activeSession());
    const unsupported = structuredClone(envelope) as unknown as {
      session: { events: Array<Record<string, unknown>> };
    };
    unsupported.session.events[1].type = "UNSUPPORTED";
    expectPersistenceCode(
      () => parsePersistedSession(JSON.stringify(unsupported)),
      "invalid_persistence_session",
    );

    const outOfOrder = structuredClone(envelope) as unknown as {
      session: { events: Array<Record<string, unknown>> };
    };
    outOfOrder.session.events[1].sequence = 99;
    expectPersistenceCode(
      () => parsePersistedSession(JSON.stringify(outOfOrder)),
      "invalid_persistence_session",
    );
  });

  it("rejects malformed value-only chronology without coercing it to Unknown", () => {
    const envelope = structuredClone(createPersistedSession(valueSession())) as unknown as {
      session: { events: Array<Record<string, unknown>> };
    };
    const valueEvent = envelope.session.events.find((event) =>
      event.type === "DEAL_VALUE_CARD"
    )!;
    valueEvent.card = { kind: "value", value: "K" };

    expectPersistenceCode(
      () => parsePersistedSession(JSON.stringify(envelope)),
      "invalid_persistence_session",
    );
  });

  it("rejects value-only chronology mislabeled as historical storage v2", () => {
    const envelope = { ...createPersistedSession(valueSession()), version: 2 };
    expectPersistenceCode(
      () => parsePersistedSession(JSON.stringify(envelope)),
      "invalid_persistence_session",
    );
  });

  it("rejects payloads over 1 MiB before writing", () => {
    const oversized = {
      ...createInitialState(),
      configuration: {
        ...createInitialState().configuration,
        padding: "x".repeat(MAX_PERSISTED_SESSION_BYTES),
      },
    } as unknown as SessionState;
    const { storage } = createStorage();

    expectPersistenceCode(
      () => saveSession(oversized, storage),
      "persisted_session_too_large",
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe("storage operations", () => {
  it("returns null when the application key is absent", () => {
    const { storage } = createStorage({ unrelated: "keep" });
    expect(loadSession(storage)).toBeNull();
  });

  it("writes one complete validated payload and loads it", () => {
    const state = activeSession();
    const { storage, values } = createStorage();

    saveSession(state, storage);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      SESSION_STORAGE_KEY,
      expect.any(String),
    );
    expect(loadSession(storage)).toEqual(state);
    expect(parsePersistedSession(values.get(SESSION_STORAGE_KEY)!)).toEqual(state);
  });

  it("replaces stored chronology after a durable change and undo", () => {
    const { storage } = createStorage();
    const state = activeSession();
    saveSession(state, storage);
    const undone = gameReducer(state, { type: "UNDO" });
    saveSession(undone, storage);

    expect(loadSession(storage)?.events).toEqual(undone.events);
    expect(selectTableState(loadSession(storage)!).dealerCards).toEqual([
      { kind: "known", rank: "10", suit: "diamonds" },
    ]);
  });

  it("replaces an old session with the normal reset state", () => {
    const { storage } = createStorage();
    saveSession(activeSession(), storage);
    const reset = gameReducer(activeSession(), { type: "RESET" });
    saveSession(reset, storage);

    expect(loadSession(storage)).toEqual(createInitialState());
  });

  it("removes only the namespaced application key", () => {
    const { storage, values } = createStorage({
      [SESSION_STORAGE_KEY]: "invalid",
      unrelated: "keep",
    });
    clearSession(storage);

    expect(storage.removeItem).toHaveBeenCalledOnce();
    expect(storage.removeItem).toHaveBeenCalledWith(SESSION_STORAGE_KEY);
    expect(values.get("unrelated")).toBe("keep");
  });

  it("wraps read, write, and remove failures without mutating session state", () => {
    const state = activeSession();
    const failingRead = createStorage().storage;
    vi.mocked(failingRead.getItem).mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expectPersistenceCode(() => loadSession(failingRead), "storage_read_failed");

    const failingWrite = createStorage().storage;
    vi.mocked(failingWrite.setItem).mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expectPersistenceCode(() => saveSession(state, failingWrite), "storage_write_failed");
    expect(state).toEqual(activeSession());

    const failingRemove = createStorage().storage;
    vi.mocked(failingRemove.removeItem).mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expectPersistenceCode(() => clearSession(failingRemove), "storage_remove_failed");
  });
});
