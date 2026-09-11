export type HealthResponse = {
  status: "ok";
  service: "blackjack-analysis-api";
};

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api";

function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  return (configuredUrl || DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<HealthResponse>;
  return (
    candidate.status === "ok" &&
    candidate.service === "blackjack-analysis-api"
  );
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${getApiBaseUrl()}/health`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Health request failed with HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!isHealthResponse(payload)) {
    throw new Error("Health response did not match the expected contract");
  }

  return payload;
}
