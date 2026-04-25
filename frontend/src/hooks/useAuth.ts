import { useCallback, useEffect, useReducer } from "react";
import { apiClient, clearToken, storeToken } from "../api/client";
import type { LoginRequest, RegisterRequest, User } from "../types";

type AuthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "authed"; user: User }
  | { status: "unauthed" };

type AuthAction =
  | { type: "LOADING" }
  | { type: "AUTHED"; user: User }
  | { type: "UNAUTHED" };

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOADING":  return { status: "loading" };
    case "AUTHED":   return { status: "authed", user: action.user };
    case "UNAUTHED": return { status: "unauthed" };
    default:         return state;
  }
}

export function useAuth() {
  const [state, dispatch] = useReducer(reducer, { status: "idle" });

  useEffect(() => {
    const token = localStorage.getItem("moabit_token");
    if (!token) {
      dispatch({ type: "UNAUTHED" });
      return;
    }
    dispatch({ type: "LOADING" });
    apiClient
      .getMe()
      .then((user) => dispatch({ type: "AUTHED", user }))
      .catch(() => {
        clearToken();
        dispatch({ type: "UNAUTHED" });
      });
  }, []);

  const login = useCallback(async (req: LoginRequest): Promise<void> => {
    dispatch({ type: "LOADING" });
    try {
      const res = await apiClient.login(req);
      storeToken(res.access_token);
      dispatch({ type: "AUTHED", user: { id: res.user_id, email: res.email, name: res.name } });
    } catch (error) {
      clearToken();
      dispatch({ type: "UNAUTHED" });
      throw error;
    }
  }, []);

  const register = useCallback(async (req: RegisterRequest): Promise<void> => {
    dispatch({ type: "LOADING" });
    try {
      const res = await apiClient.register(req);
      storeToken(res.access_token);
      dispatch({ type: "AUTHED", user: { id: res.user_id, email: res.email, name: res.name } });
    } catch (error) {
      clearToken();
      dispatch({ type: "UNAUTHED" });
      throw error;
    }
  }, []);

  const logout = useCallback((): void => {
    clearToken();
    dispatch({ type: "UNAUTHED" });
  }, []);

  return { state, login, register, logout };
}
