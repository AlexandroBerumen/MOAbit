import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import type { LoginRequest, RegisterRequest, User } from "../types";

export type AuthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "authed"; user: User }
  | { status: "unauthed" };

interface AuthContextValue {
  state: AuthState;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error("useAuthContext must be used inside AuthProvider");
  return ctx;
}
