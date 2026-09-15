import { DECK_COUNTS, type DeckCount } from "../domain/rules";
import type { WorkspaceMode } from "../domain/workspace";

export const DEVICE_PREFERENCES_KEY = "blackjack-probability-lab.preferences" as const;
export const DEVICE_PREFERENCES_FORMAT = "blackjack-device-preferences" as const;
export const DEVICE_PREFERENCES_VERSION = 1 as const;

export type DevicePreferences = Readonly<{
  workspaceMode: WorkspaceMode;
  preferredDeckCount: DeckCount | null;
}>;

type PreferenceEnvelope = Readonly<{
  format: typeof DEVICE_PREFERENCES_FORMAT;
  version: typeof DEVICE_PREFERENCES_VERSION;
  preferences: DevicePreferences;
}>;

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  workspaceMode: "normal",
  preferredDeckCount: null,
};

function storageOrNull(storage?: PreferenceStorage): PreferenceStorage | null {
  if (storage) return storage;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parsePreferences(value: string): DevicePreferences | null {
  try {
    const envelope = JSON.parse(value) as Record<string, unknown>;
    if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope) ||
        envelope.format !== DEVICE_PREFERENCES_FORMAT ||
        envelope.version !== DEVICE_PREFERENCES_VERSION ||
        Object.keys(envelope).sort().join(",") !== "format,preferences,version") {
      return null;
    }
    const preferences = envelope.preferences as Record<string, unknown> | null;
    if (preferences === null || typeof preferences !== "object" || Array.isArray(preferences) ||
        Object.keys(preferences).sort().join(",") !== "preferredDeckCount,workspaceMode" ||
        (preferences.workspaceMode !== "normal" && preferences.workspaceMode !== "pro") ||
        (preferences.preferredDeckCount !== null &&
          (!Number.isInteger(preferences.preferredDeckCount) ||
            !DECK_COUNTS.includes(preferences.preferredDeckCount as DeckCount)))) {
      return null;
    }
    return {
      workspaceMode: preferences.workspaceMode,
      preferredDeckCount: preferences.preferredDeckCount as DeckCount | null,
    };
  } catch {
    return null;
  }
}

export function loadDevicePreferences(
  storage?: PreferenceStorage,
): DevicePreferences {
  const target = storageOrNull(storage);
  if (!target) return DEFAULT_DEVICE_PREFERENCES;
  try {
    const stored = target.getItem(DEVICE_PREFERENCES_KEY);
    return stored === null
      ? DEFAULT_DEVICE_PREFERENCES
      : parsePreferences(stored) ?? DEFAULT_DEVICE_PREFERENCES;
  } catch {
    return DEFAULT_DEVICE_PREFERENCES;
  }
}

export function saveDevicePreferences(
  preferences: DevicePreferences,
  storage?: PreferenceStorage,
): boolean {
  const target = storageOrNull(storage);
  if (!target) return false;
  const envelope: PreferenceEnvelope = {
    format: DEVICE_PREFERENCES_FORMAT,
    version: DEVICE_PREFERENCES_VERSION,
    preferences,
  };
  try {
    target.setItem(DEVICE_PREFERENCES_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}
