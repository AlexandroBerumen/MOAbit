import type { HypothesisRequest, HypothesisResponse } from "../types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const apiClient = {
  async generateHypotheses(req: HypothesisRequest): Promise<HypothesisResponse> {
    const res = await fetch(`${BASE_URL}/api/hypotheses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<HypothesisResponse>;
  },
};
