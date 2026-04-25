import type {
  HypothesisRequest,
  HypothesisResponse,
  LoginRequest,
  PatchNotesRequest,
  ProtocolRequest,
  ProtocolResponse,
  RegisterRequest,
  SavedHypothesis,
  SaveRequest,
  SSEEvent,
  TokenResponse,
  User,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "moabit_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const post  = <T>(path: string, body: unknown) => request<T>("POST",   path, body);
const get   = <T>(path: string)                => request<T>("GET",    path);
const patch = <T>(path: string, body: unknown) => request<T>("PATCH",  path, body);
const del   = <T>(path: string)                => request<T>("DELETE", path);

export async function* streamHypotheses(req: HypothesisRequest): AsyncGenerator<SSEEvent> {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/api/hypotheses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(req),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        let eventType = "";
        let dataStr = "";
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          else if (line.startsWith("data: ")) dataStr = line.slice(6);
        }

        if (eventType && dataStr) {
          yield { event: eventType, data: JSON.parse(dataStr) } as SSEEvent;
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export const apiClient = {
  // Hypothesis generation — kept for backward compat (demo mode / direct calls)
  generateHypotheses: (req: HypothesisRequest) =>
    post<HypothesisResponse>("/api/hypotheses", req),
  generateProtocol: (req: ProtocolRequest) =>
    post<ProtocolResponse>("/api/protocol", req),

  // Auth
  register: (req: RegisterRequest) => post<TokenResponse>("/api/auth/register", req),
  login:    (req: LoginRequest)    => post<TokenResponse>("/api/auth/login",    req),
  getMe:    ()                     => get<User>("/api/auth/me"),

  // Saved hypotheses
  saveHypothesis: (req: SaveRequest)                      => post<SavedHypothesis>("/api/saved",      req),
  getSaved:       ()                                      => get<SavedHypothesis[]>("/api/saved"),
  updateNotes:    (id: number, req: PatchNotesRequest)    => patch<SavedHypothesis>(`/api/saved/${id}`, req),
  deleteSaved:    (id: number)                            => del<void>(`/api/saved/${id}`),
};
