import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DEVICE_PREFERENCES,
  DEVICE_PREFERENCES_FORMAT,
  DEVICE_PREFERENCES_KEY,
  DEVICE_PREFERENCES_VERSION,
  loadDevicePreferences,
  saveDevicePreferences,
} from "./preferences";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next; }),
  };
}

describe("device preferences", () => {
  it("round-trips only presentation mode and preferred deck count", () => {
    const storage = memoryStorage();
    expect(saveDevicePreferences(
      { workspaceMode: "pro", preferredDeckCount: 8 }, storage,
    )).toBe(true);
    expect(loadDevicePreferences(storage)).toEqual({
      workspaceMode: "pro",
      preferredDeckCount: 8,
    });
    expect(storage.setItem).toHaveBeenCalledWith(
      DEVICE_PREFERENCES_KEY,
      expect.stringContaining(DEVICE_PREFERENCES_FORMAT),
    );
  });

  it.each([
    ["malformed JSON", "{"],
    ["unsupported version", JSON.stringify({
      format: DEVICE_PREFERENCES_FORMAT,
      version: DEVICE_PREFERENCES_VERSION + 1,
      preferences: { workspaceMode: "pro", preferredDeckCount: 8 },
    })],
    ["invalid mode", JSON.stringify({
      format: DEVICE_PREFERENCES_FORMAT,
      version: DEVICE_PREFERENCES_VERSION,
      preferences: { workspaceMode: "casino", preferredDeckCount: 8 },
    })],
    ["unsupported deck", JSON.stringify({
      format: DEVICE_PREFERENCES_FORMAT,
      version: DEVICE_PREFERENCES_VERSION,
      preferences: { workspaceMode: "pro", preferredDeckCount: 9 },
    })],
  ])("falls back safely for %s", (_case, stored) => {
    expect(loadDevicePreferences(memoryStorage(stored)))
      .toEqual(DEFAULT_DEVICE_PREFERENCES);
  });

  it("survives storage read and write failures", () => {
    const storage = {
      getItem: vi.fn(() => { throw new DOMException("blocked", "SecurityError"); }),
      setItem: vi.fn(() => { throw new DOMException("quota", "QuotaExceededError"); }),
    };

    expect(loadDevicePreferences(storage)).toEqual(DEFAULT_DEVICE_PREFERENCES);
    expect(saveDevicePreferences(
      { workspaceMode: "pro", preferredDeckCount: 7 }, storage,
    )).toBe(false);
  });
});
