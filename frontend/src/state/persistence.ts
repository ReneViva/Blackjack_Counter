import type { SessionState } from "./gameReducer";

export const SESSION_SCHEMA_VERSION = 1 as const;

export type PersistedSession = Readonly<{
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  data: SessionState;
}>;

export interface SessionPersistence {
  load(): PersistedSession | null;
  save(session: PersistedSession): void;
  clear(): void;
}
