import type { HypothesisRequest, HypothesisResponse, ProtocolRequest, ProtocolResponse } from "../types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const apiClient = {
  generateHypotheses: (req: HypothesisRequest) =>
    post<HypothesisResponse>("/api/hypotheses", req),

  generateProtocol: (req: ProtocolRequest) =>
    post<ProtocolResponse>("/api/protocol", req),
};
