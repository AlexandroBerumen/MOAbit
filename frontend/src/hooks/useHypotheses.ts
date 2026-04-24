import { useReducer } from "react";
import { apiClient } from "../api/client";
import type { HypothesisRequest, HypothesisResponse } from "../types";

// A discriminated union means exactly one status is active at a time —
// prevents impossible states like isLoading=true and error="something" simultaneously.
type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: HypothesisResponse }
  | { status: "error"; message: string };

type Action =
  | { type: "SUBMIT" }
  | { type: "SUCCESS"; payload: HypothesisResponse }
  | { type: "ERROR"; payload: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SUBMIT":
      return { status: "loading" };
    case "SUCCESS":
      return { status: "success", data: action.payload };
    case "ERROR":
      return { status: "error", message: action.payload };
    default:
      return state;
  }
}

export function useHypotheses() {
  const [state, dispatch] = useReducer(reducer, { status: "idle" });

  async function submit(req: HypothesisRequest) {
    dispatch({ type: "SUBMIT" });
    try {
      const data = await apiClient.generateHypotheses(req);
      dispatch({ type: "SUCCESS", payload: data });
    } catch (err) {
      dispatch({
        type: "ERROR",
        payload: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return { state, submit };
}
