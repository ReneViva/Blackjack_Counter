import {
  BLACKJACK_VALUE_CLASSES,
  RANKS,
  SUITS,
  type BlackjackValueClass,
  type KnownCard,
  type Rank,
  type Suit,
  type ValueOnlyCard,
} from "../domain/card";
import type { GameEvent, RecordedTableTarget, SessionAction } from "../domain/events";
import { SEAT_NUMBERS, type SeatNumber, type SessionConfiguration } from "../domain/game";
import { DECK_COUNTS, type DeckCount, type SessionRules } from "../domain/rules";
import { validateSessionState, ValidationApiError } from "../api/validation";
import {
  toLegacyTableStatePayload,
  toTableStatePayload,
  type TableStatePayload,
} from "../api/tableState";
import { gameReducer, type SessionState } from "../state/gameReducer";
import { createInitialState } from "../state/initialState";

export const REPLAY_FORMAT = "blackjack-session-replay" as const;
export const REPLAY_VERSION = 3 as const;
export const MAX_REPLAY_BYTES = 1024 * 1024;

export type ReplayVersion = 1 | 2 | typeof REPLAY_VERSION;

export type SessionReplayEnvelope = Readonly<{
  format: typeof REPLAY_FORMAT;
  version: typeof REPLAY_VERSION;
  session: Readonly<{
    configuration: SessionConfiguration;
    events: readonly GameEvent[];
  }>;
  final_state: TableStatePayload;
}>;

export type SerializedSession = Readonly<{
  configuration: SessionConfiguration;
  events: readonly GameEvent[];
}>;

export class ReplayImportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReplayImportError";
    this.code = code;
  }
}

type JsonObject = Record<string, unknown>;

function fail(code: string, message: string): never {
  throw new ReplayImportError(code, message);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: JsonObject, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) fail("invalid_replay_structure", `${label} must be an object.`);
  return value;
}

function requireExactKeys(
  value: JsonObject,
  keys: readonly string[],
  label: string,
): void {
  if (!hasExactKeys(value, keys)) {
    fail("invalid_replay_structure", `${label} has missing or unsupported fields.`);
  }
}

function isSeat(value: unknown): value is SeatNumber {
  return typeof value === "number" && SEAT_NUMBERS.includes(value as SeatNumber);
}

function parseRules(value: unknown): SessionRules {
  const rules = requireObject(value, "session rules");
  requireExactKeys(rules, [
    "decks",
    "dealerSoft17",
    "splittingEnabled",
    "maxSplitHands",
    "resplitAces",
    "hitSplitAces",
    "blackjackAfterSplit",
    "doublingEnabled",
    "doubleAfterSplit",
    "surrender",
    "dealerSecondCard",
    "dealerBlackjackCheck",
  ], "session rules");
  const deckValid = rules.decks === null ||
    (typeof rules.decks === "number" && DECK_COUNTS.includes(rules.decks as DeckCount));
  const booleans = [
    rules.splittingEnabled,
    rules.resplitAces,
    rules.hitSplitAces,
    rules.blackjackAfterSplit,
    rules.doublingEnabled,
    rules.doubleAfterSplit,
  ];
  if (!deckValid ||
      !["hit", "stand"].includes(rules.dealerSoft17 as string) ||
      !booleans.every((item) => typeof item === "boolean") ||
      ![1, 2, 3, 4].includes(rules.maxSplitHands as number) ||
      !["none", "late"].includes(rules.surrender as string) ||
      !["hole_card", "no_hole_card"].includes(rules.dealerSecondCard as string) ||
      !["peek", "no_peek"].includes(rules.dealerBlackjackCheck as string)) {
    fail("invalid_replay_rules", "Replay rules contain unsupported values.");
  }
  return rules as unknown as SessionRules;
}

function parseConfiguration(value: unknown): SessionConfiguration {
  const configuration = requireObject(value, "session configuration");
  requireExactKeys(
    configuration,
    ["rules", "activeSeats", "userSeat"],
    "session configuration",
  );
  if (!Array.isArray(configuration.activeSeats) ||
      !configuration.activeSeats.every(isSeat) ||
      new Set(configuration.activeSeats).size !== configuration.activeSeats.length ||
      !configuration.activeSeats.every((seat, index, seats) => index === 0 || seats[index - 1] < seat)) {
    fail("invalid_replay_configuration", "Active seats must be unique supported seats in ascending order.");
  }
  if (configuration.userSeat !== null && !isSeat(configuration.userSeat)) {
    fail("invalid_replay_configuration", "The selected user seat is invalid.");
  }
  if (configuration.userSeat !== null && !configuration.activeSeats.includes(configuration.userSeat)) {
    fail("invalid_replay_configuration", "The selected user seat must be active.");
  }
  return {
    rules: parseRules(configuration.rules),
    activeSeats: configuration.activeSeats as SeatNumber[],
    userSeat: configuration.userSeat as SeatNumber | null,
  };
}

function parseTarget(
  value: unknown,
  configuration: SessionConfiguration,
): RecordedTableTarget {
  const target = requireObject(value, "event target");
  if (target.kind === "dealer") {
    requireExactKeys(target, ["kind"], "dealer target");
    return { kind: "dealer" };
  }
  if (target.kind === "player") {
    requireExactKeys(target, ["kind", "seat"], "player target");
    if (!isSeat(target.seat) || !configuration.activeSeats.includes(target.seat)) {
      fail("invalid_replay_event", "A player event targets an inactive or invalid seat.");
    }
    return { kind: "player", seat: target.seat };
  }
  if (target.kind === "player-hand") {
    requireExactKeys(target, ["kind", "seat", "handId"], "player-hand target");
    if (!isSeat(target.seat) ||
        !configuration.activeSeats.includes(target.seat) ||
        typeof target.handId !== "string" || target.handId.length === 0) {
      fail("invalid_replay_event", "A hand event targets an inactive or invalid player hand.");
    }
    return {
      kind: "player-hand",
      seat: target.seat,
      handId: target.handId,
    };
  }
  return fail("invalid_replay_event", "Event target kind is unsupported.");
}

function parseKnownCard(value: unknown): KnownCard {
  const card = requireObject(value, "known card");
  requireExactKeys(card, ["kind", "rank", "suit"], "known card");
  if (card.kind !== "known" ||
      !RANKS.includes(card.rank as Rank) ||
      !SUITS.includes(card.suit as Suit)) {
    fail("invalid_replay_event", "Known card rank or suit is unsupported.");
  }
  return { kind: "known", rank: card.rank as Rank, suit: card.suit as Suit };
}

function parseValueOnlyCard(value: unknown): ValueOnlyCard {
  const card = requireObject(value, "value-only card");
  requireExactKeys(card, ["kind", "value"], "value-only card");
  if (card.kind !== "value" ||
      !BLACKJACK_VALUE_CLASSES.includes(card.value as BlackjackValueClass)) {
    fail("invalid_replay_event", "Value-only card value is unsupported.");
  }
  return { kind: "value", value: card.value as BlackjackValueClass };
}

function parseIdentity(event: JsonObject, index: number): void {
  const expectedSequence = index + 1;
  const expectedId = `evt_${expectedSequence.toString().padStart(4, "0")}`;
  if (event.sequence !== expectedSequence || event.id !== expectedId) {
    fail("invalid_replay_chronology", "Replay event identity or ordering is invalid.");
  }
}

function eventAction(
  value: unknown,
  index: number,
  configuration: SessionConfiguration,
  version: ReplayVersion,
): SessionAction {
  const event = requireObject(value, `event ${index + 1}`);
  if (typeof event.type !== "string") {
    fail("invalid_replay_event", `Event ${index + 1} has no supported type.`);
  }
  parseIdentity(event, index);
  switch (event.type) {
    case "NEW_SHOE": {
      requireExactKeys(event, ["id", "sequence", "type", "configuration"], "NEW_SHOE event");
      const eventConfiguration = parseConfiguration(event.configuration);
      if (!semanticEqual(eventConfiguration, configuration)) {
        fail("invalid_replay_chronology", "NEW_SHOE configuration does not match the replay session.");
      }
      return { type: "NEW_SHOE" };
    }
    case "PLAYER_ADDED":
      requireExactKeys(event, ["id", "sequence", "type", "seat"], "PLAYER_ADDED event");
      if (!isSeat(event.seat) || configuration.activeSeats.includes(event.seat)) {
        fail("invalid_replay_event", "A player-add event must target an inactive supported seat.");
      }
      return { type: "ADD_PLAYER", seat: event.seat };
    case "PLAYER_LEFT":
      if (version === 1) {
        fail("unsupported_replay_event", "PLAYER_LEFT requires replay version 2.");
      }
      requireExactKeys(event, ["id", "sequence", "type", "seat"], "PLAYER_LEFT event");
      if (!isSeat(event.seat) || !configuration.activeSeats.includes(event.seat)) {
        fail("invalid_replay_event", "A player-leave event must target an active supported seat.");
      }
      return { type: "LEAVE_PLAYER", seat: event.seat };
    case "PLAYER_HAND_SPLIT":
      if (version === 1) {
        fail("unsupported_replay_event", "PLAYER_HAND_SPLIT requires replay version 2.");
      }
      requireExactKeys(event, [
        "id",
        "sequence",
        "type",
        "seat",
        "sourceHandId",
        "leftHandId",
        "rightHandId",
        "splitDepth",
        "fromSplitAces",
      ], "PLAYER_HAND_SPLIT event");
      if (!isSeat(event.seat) ||
          !configuration.activeSeats.includes(event.seat) ||
          typeof event.sourceHandId !== "string" || !event.sourceHandId ||
          typeof event.leftHandId !== "string" || !event.leftHandId ||
          typeof event.rightHandId !== "string" || !event.rightHandId ||
          !Number.isInteger(event.splitDepth) || (event.splitDepth as number) < 1 ||
          typeof event.fromSplitAces !== "boolean") {
        fail("invalid_replay_event", "A split event contains invalid hand metadata.");
      }
      return {
        type: "SPLIT_PLAYER_HAND",
        seat: event.seat,
        handId: event.sourceHandId,
        leftHandId: event.leftHandId,
        rightHandId: event.rightHandId,
        splitDepth: event.splitDepth as number,
        fromSplitAces: event.fromSplitAces,
      };
    case "DEAL_KNOWN_CARD":
      requireExactKeys(event, ["id", "sequence", "type", "target", "card"], "DEAL_KNOWN_CARD event");
      return {
        type: "DEAL_KNOWN_CARD",
        target: parseTarget(event.target, configuration),
        card: parseKnownCard(event.card),
      };
    case "DEAL_VALUE_CARD":
      if (version < 3) {
        fail("unsupported_replay_event", "DEAL_VALUE_CARD requires replay version 3.");
      }
      requireExactKeys(event, ["id", "sequence", "type", "target", "card"], "DEAL_VALUE_CARD event");
      return {
        type: "DEAL_VALUE_CARD",
        target: parseTarget(event.target, configuration),
        card: parseValueOnlyCard(event.card),
      };
    case "DEAL_UNKNOWN_CARD":
      requireExactKeys(event, ["id", "sequence", "type", "target"], "DEAL_UNKNOWN_CARD event");
      return { type: "DEAL_UNKNOWN_CARD", target: parseTarget(event.target, configuration) };
    case "ROUND_COMPLETE":
      requireExactKeys(event, ["id", "sequence", "type"], "ROUND_COMPLETE event");
      return { type: "ROUND_COMPLETE" };
    case "SHUFFLE":
      requireExactKeys(event, ["id", "sequence", "type"], "SHUFFLE event");
      return { type: "SHUFFLE" };
    default:
      return fail("unsupported_replay_event", `Unsupported replay event type: ${event.type}`);
  }
}

function semanticEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => semanticEqual(item, right[index]));
  }
  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) =>
        key === rightKeys[index] && semanticEqual(left[key], right[key]),
      );
  }
  return false;
}

export function createSessionReplay(state: SessionState): SessionReplayEnvelope {
  return {
    format: REPLAY_FORMAT,
    version: REPLAY_VERSION,
    session: {
      configuration: state.configuration,
      events: state.events,
    },
    final_state: toTableStatePayload(state),
  };
}

export function serializeSessionReplay(state: SessionState): string {
  return `${JSON.stringify(createSessionReplay(state), null, 2)}\n`;
}

export function reconstructSerializedSession(
  value: unknown,
  allowEmptyChronology = false,
  version: ReplayVersion = REPLAY_VERSION,
): SessionState {
  const session = requireObject(value, "serialized session");
  requireExactKeys(session, ["configuration", "events"], "serialized session");
  const configuration = parseConfiguration(session.configuration);
  if (!Array.isArray(session.events)) {
    fail("invalid_replay_structure", "Session event chronology must be an array.");
  }
  if (session.events.length === 0) {
    if (!allowEmptyChronology) {
      fail("invalid_replay_structure", "Replay event chronology must be a nonempty array.");
    }
    return createInitialState(configuration);
  }
  if (!isObject(session.events[0]) || session.events[0].type !== "NEW_SHOE") {
    fail("invalid_replay_chronology", "Session chronology must begin with NEW_SHOE.");
  }

  const firstEvent = requireObject(session.events[0], "event 1");
  const initialConfiguration = parseConfiguration(firstEvent.configuration);
  const hasDynamicPlayerEvent = (session.events as readonly unknown[]).some(
    (event) => isObject(event) &&
      (event.type === "PLAYER_ADDED" || event.type === "PLAYER_LEFT"),
  );
  if (!hasDynamicPlayerEvent && !semanticEqual(initialConfiguration, configuration)) {
    fail("invalid_replay_chronology", "NEW_SHOE configuration does not match the session.");
  }
  let candidate = createInitialState(initialConfiguration);
  for (const [index, serializedEvent] of session.events.entries()) {
    candidate = gameReducer(
      candidate,
      eventAction(serializedEvent, index, candidate.configuration, version),
    );
    if (!semanticEqual(candidate.events[index], serializedEvent)) {
      fail("invalid_replay_chronology", `Event ${index + 1} did not replay deterministically.`);
    }
  }
  if (!semanticEqual(candidate.configuration, configuration)) {
    fail("replay_integrity_mismatch", "Session configuration did not reconstruct deterministically.");
  }
  return candidate;
}

export function parseSessionReplay(text: string): SessionState {
  if (new TextEncoder().encode(text).byteLength > MAX_REPLAY_BYTES) {
    fail("replay_too_large", "Replay files must not exceed 1 MiB.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return fail("malformed_replay_json", "Replay file is not valid JSON.");
  }
  const envelope = requireObject(parsed, "replay envelope");
  requireExactKeys(envelope, ["format", "version", "session", "final_state"], "replay envelope");
  if (envelope.format !== REPLAY_FORMAT) {
    fail("invalid_replay_format", `Replay format must be ${REPLAY_FORMAT}.`);
  }
  if (envelope.version !== 1 && envelope.version !== 2 && envelope.version !== REPLAY_VERSION) {
    fail("unsupported_replay_version", "Only replay versions 1, 2, and 3 are supported.");
  }
  const version = envelope.version as ReplayVersion;
  const candidate = reconstructSerializedSession(envelope.session, false, version);
  const finalState = version === 1
    ? toLegacyTableStatePayload(candidate)
    : toTableStatePayload(candidate);
  if (!semanticEqual(finalState, envelope.final_state)) {
    fail("replay_integrity_mismatch", "Replay final-state integrity check failed.");
  }
  return candidate;
}

export async function readAndValidateReplayFile(
  file: File,
  signal?: AbortSignal,
): Promise<SessionState> {
  if (file.size > MAX_REPLAY_BYTES) {
    fail("replay_too_large", "Replay files must not exceed 1 MiB.");
  }
  const candidate = parseSessionReplay(await file.text());
  try {
    const validation = await validateSessionState(candidate, signal);
    if (!validation.valid) {
      fail(
        "backend_invalid_replay",
        validation.errors[0]?.message ?? "Backend rejected the reconstructed replay state.",
      );
    }
  } catch (error: unknown) {
    if (error instanceof ReplayImportError) throw error;
    if (error instanceof ValidationApiError) {
      fail(error.code, error.message);
    }
    throw error;
  }
  return candidate;
}
