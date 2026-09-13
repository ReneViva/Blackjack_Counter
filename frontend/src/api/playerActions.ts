import type { TableTarget } from "../domain/events";
import type { SessionState } from "../state/gameReducer";
import { getApiBaseUrl } from "./client";
import { toTableStatePayload } from "./tableState";

export type LegalAction = Readonly<{
  allowed: boolean;
  code: string | null;
  reason: string | null;
}>;

export type PlayerActionsResponse = Readonly<{ split: LegalAction }>;

export class PlayerActionsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerActionsApiError";
  }
}

function isResponse(value: unknown): value is PlayerActionsResponse {
  if (typeof value !== "object" || value === null || !("split" in value)) {
    return false;
  }
  const split = (value as { split?: unknown }).split;
  if (typeof split !== "object" || split === null) return false;
  const action = split as Record<string, unknown>;
  return typeof action.allowed === "boolean" &&
    (action.code === null || typeof action.code === "string") &&
    (action.reason === null || typeof action.reason === "string");
}

export async function getPlayerActions(
  state: SessionState,
  target: Extract<TableTarget, { kind: "player-hand" }>,
  signal?: AbortSignal,
): Promise<PlayerActionsResponse> {
  const response = await fetch(`${getApiBaseUrl()}/player-actions`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      state: toTableStatePayload(state, target),
      target: { seat: target.seat, hand_id: target.handId },
    }),
    signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isResponse(payload)) {
    throw new PlayerActionsApiError(
      "Player action legality could not be confirmed by Python.",
    );
  }
  return payload;
}
