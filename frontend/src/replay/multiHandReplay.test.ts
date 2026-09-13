import { describe, expect, it } from "vitest";

import { toLegacyTableStatePayload } from "../api/tableState";
import { gameReducer, type SessionState } from "../state/gameReducer";
import { createInitialState } from "../state/initialState";
import {
  parsePersistedSession,
  serializePersistedSession,
} from "../state/persistence";
import { selectObservedCardCount, selectTableState } from "../state/selectors";
import {
  createSessionReplay,
  parseSessionReplay,
  ReplayImportError,
  serializeSessionReplay,
} from "./sessionReplay";

function splitSession(): SessionState {
  let state = gameReducer(createInitialState(), { type: "ADD_PLAYER", seat: 4 });
  for (const suit of ["hearts", "clubs"] as const) {
    state = gameReducer(state, {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1" },
      card: { kind: "known", rank: "8", suit },
    });
  }
  state = gameReducer(state, {
    type: "SPLIT_PLAYER_HAND",
    seat: 4,
    handId: "seat-4-hand-1",
    leftHandId: "seat-4-hand-1-1",
    rightHandId: "seat-4-hand-1-2",
    splitDepth: 1,
    fromSplitAces: false,
  });
  state = gameReducer(state, {
    type: "DEAL_KNOWN_CARD",
    target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-1" },
    card: { kind: "known", rank: "3", suit: "diamonds" },
  });
  return gameReducer(state, {
    type: "DEAL_UNKNOWN_CARD",
    target: { kind: "player-hand", seat: 4, handId: "seat-4-hand-1-2" },
  });
}

describe("version 2 multi-hand replay and persistence", () => {
  it("round-trips split identity, lineage, hand cards, and subsequent undo", () => {
    const original = splitSession();
    const replayed = parseSessionReplay(serializeSessionReplay(original));

    expect(replayed).toEqual(original);
    expect(selectTableState(replayed).playerHands[4].map((hand) => hand.handId)).toEqual([
      "seat-4-hand-1-1",
      "seat-4-hand-1-2",
    ]);
    expect(gameReducer(replayed, { type: "UNDO" })).toEqual(
      gameReducer(original, { type: "UNDO" }),
    );
  });

  it("round-trips departure while preserving all removed observations", () => {
    const departed = gameReducer(splitSession(), { type: "LEAVE_PLAYER", seat: 4 });
    const replayed = parseSessionReplay(serializeSessionReplay(departed));
    const persisted = parsePersistedSession(serializePersistedSession(departed));

    expect(replayed).toEqual(departed);
    expect(persisted).toEqual(departed);
    expect(selectObservedCardCount(replayed)).toBe(4);
    expect(selectTableState(replayed).discardedCards).toHaveLength(4);
    expect(gameReducer(replayed, { type: "UNDO" })).toEqual(splitSession());
  });

  it("rejects forged deterministic hand identities during reconstruction", () => {
    const replay = structuredClone(createSessionReplay(splitSession())) as unknown as {
      session: { events: Array<Record<string, unknown>> };
    };
    const splitEvent = replay.session.events.find(
      (event) => event.type === "PLAYER_HAND_SPLIT",
    );
    if (!splitEvent) throw new Error("missing split test event");
    splitEvent.leftHandId = "random-hand-id";

    expect(() => parseSessionReplay(JSON.stringify(replay))).toThrowError(
      expect.objectContaining<Partial<ReplayImportError>>({
        code: "invalid_replay_chronology",
      }),
    );
  });

  it("keeps ordinary version 1 replay and saved-session payloads readable", () => {
    let legacy = gameReducer(createInitialState(), { type: "ADD_PLAYER", seat: 4 });
    legacy = gameReducer(legacy, {
      type: "DEAL_KNOWN_CARD",
      target: { kind: "player", seat: 4 },
      card: { kind: "known", rank: "A", suit: "spades" },
    });
    const replay = createSessionReplay(legacy) as unknown as Record<string, unknown>;
    replay.version = 1;
    replay.final_state = toLegacyTableStatePayload(legacy);
    const persistence = {
      format: "blackjack-session-storage",
      version: 1,
      session: replay.session,
    };

    expect(parseSessionReplay(JSON.stringify(replay))).toEqual(legacy);
    expect(parsePersistedSession(JSON.stringify(persistence))).toEqual(legacy);
  });

  it("does not permit version 2 split chronology inside a version 1 replay", () => {
    const replay = createSessionReplay(splitSession()) as unknown as Record<string, unknown>;
    replay.version = 1;
    replay.final_state = toLegacyTableStatePayload(splitSession());

    try {
      parseSessionReplay(JSON.stringify(replay));
      throw new Error("expected version 1 replay rejection");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ReplayImportError);
      expect((error as ReplayImportError).code).toBe("unsupported_replay_event");
    }
  });
});
