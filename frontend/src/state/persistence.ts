import {
  reconstructSerializedSession,
  ReplayImportError,
  type SerializedSession,
} from "../replay/sessionReplay";
import type { SessionState } from "./gameReducer";

export const SESSION_STORAGE_KEY = "blackjack-probability-lab.session" as const;
export const SESSION_STORAGE_FORMAT = "blackjack-session-storage" as const;
export const SESSION_SCHEMA_VERSION = 2 as const;
export const MAX_PERSISTED_SESSION_BYTES = 1024 * 1024;

export type PersistedSession = Readonly<{
  format: typeof SESSION_STORAGE_FORMAT;
  version: typeof SESSION_SCHEMA_VERSION;
  session: SerializedSession;
}>;

export type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface SessionPersistence {
  load(): SessionState | null;
  save(state: SessionState): void;
  clear(): void;
}

export class SessionPersistenceError extends Error {
  readonly code: string;
  readonly definitiveCorruption: boolean;

  constructor(
    code: string,
    message: string,
    definitiveCorruption = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SessionPersistenceError";
    this.code = code;
    this.definitiveCorruption = definitiveCorruption;
  }
}

type JsonObject = Record<string, unknown>;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: JsonObject, expectedKeys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function corrupt(code: string, message: string, cause?: unknown): never {
  throw new SessionPersistenceError(
    code,
    message,
    true,
    cause === undefined ? undefined : { cause },
  );
}

function browserStorage(): SessionStorage {
  try {
    return window.localStorage;
  } catch (cause: unknown) {
    throw new SessionPersistenceError(
      "storage_unavailable",
      "Browser storage is unavailable.",
      false,
      { cause },
    );
  }
}

export function createPersistedSession(state: SessionState): PersistedSession {
  return {
    format: SESSION_STORAGE_FORMAT,
    version: SESSION_SCHEMA_VERSION,
    session: {
      configuration: state.configuration,
      events: state.events,
    },
  };
}

export function parsePersistedSession(text: string): SessionState {
  if (byteLength(text) > MAX_PERSISTED_SESSION_BYTES) {
    corrupt("persisted_session_too_large", "Saved session data exceeds the 1 MiB limit.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (cause: unknown) {
    corrupt("malformed_persistence_json", "Saved session data is not valid JSON.", cause);
  }

  if (!isObject(parsed) || !hasExactKeys(parsed, ["format", "version", "session"])) {
    corrupt("invalid_persistence_structure", "Saved session data has missing or unsupported fields.");
  }
  if (parsed.format !== SESSION_STORAGE_FORMAT) {
    corrupt("invalid_persistence_format", `Saved session format must be ${SESSION_STORAGE_FORMAT}.`);
  }
  if (parsed.version !== 1 && parsed.version !== SESSION_SCHEMA_VERSION) {
    corrupt("unsupported_persistence_version", "Only saved-session versions 1 and 2 are supported.");
  }

  try {
    return reconstructSerializedSession(
      parsed.session,
      true,
      parsed.version as 1 | 2,
    );
  } catch (cause: unknown) {
    if (cause instanceof ReplayImportError) {
      corrupt(
        "invalid_persistence_session",
        `Saved session chronology is invalid (${cause.code}).`,
        cause,
      );
    }
    throw cause;
  }
}

export function serializePersistedSession(state: SessionState): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(createPersistedSession(state));
  } catch (cause: unknown) {
    throw new SessionPersistenceError(
      "persistence_serialization_failed",
      "Session could not be serialized for local storage.",
      false,
      { cause },
    );
  }
  if (byteLength(serialized) > MAX_PERSISTED_SESSION_BYTES) {
    throw new SessionPersistenceError(
      "persisted_session_too_large",
      "Session exceeds the 1 MiB local-storage limit.",
    );
  }
  parsePersistedSession(serialized);
  return serialized;
}

export function loadSession(storage: SessionStorage = browserStorage()): SessionState | null {
  let stored: string | null;
  try {
    stored = storage.getItem(SESSION_STORAGE_KEY);
  } catch (cause: unknown) {
    throw new SessionPersistenceError(
      "storage_read_failed",
      "Saved session data could not be read.",
      false,
      { cause },
    );
  }
  return stored === null ? null : parsePersistedSession(stored);
}

export function saveSession(
  state: SessionState,
  storage: SessionStorage = browserStorage(),
): void {
  const serialized = serializePersistedSession(state);
  try {
    storage.setItem(SESSION_STORAGE_KEY, serialized);
  } catch (cause: unknown) {
    throw new SessionPersistenceError(
      "storage_write_failed",
      "Session could not be saved locally.",
      false,
      { cause },
    );
  }
}

export function clearSession(storage: SessionStorage = browserStorage()): void {
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch (cause: unknown) {
    throw new SessionPersistenceError(
      "storage_remove_failed",
      "Invalid saved session data could not be removed.",
      false,
      { cause },
    );
  }
}

export const browserSessionPersistence: SessionPersistence = {
  load: () => loadSession(),
  save: (state) => saveSession(state),
  clear: () => clearSession(),
};
