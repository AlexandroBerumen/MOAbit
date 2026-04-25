import { useReducer } from "react";
import { streamHypotheses } from "../api/client";
import type { DrugOverview, Hypothesis, HypothesisRequest } from "../types";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "results";
      drug_name: string;
      drug_overview: DrugOverview | null;
      hypotheses: Hypothesis[];
      llm_provider: string;
      disclaimer: string;
      complete: boolean;
    }
  | { status: "error"; message: string };

type Action =
  | { type: "SUBMIT" }
  | { type: "DRUG_OVERVIEW"; drug_name: string; drug_overview: DrugOverview | null; llm_provider: string; disclaimer: string }
  | { type: "HYPOTHESIS"; payload: Hypothesis }
  | { type: "DONE"; llm_provider: string }
  | { type: "ERROR"; message: string };

function upsertHypothesis(hypotheses: Hypothesis[], incoming: Hypothesis): Hypothesis[] {
  const next = hypotheses.filter((hypothesis) => hypothesis.id !== incoming.id);
  next.push(incoming);
  next.sort((a, b) => a.id - b.id);
  return next;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SUBMIT":
      return { status: "loading" };
    case "DRUG_OVERVIEW":
      return {
        status: "results",
        drug_name: action.drug_name,
        drug_overview: action.drug_overview,
        hypotheses: [],
        llm_provider: action.llm_provider,
        disclaimer: action.disclaimer,
        complete: false,
      };
    case "HYPOTHESIS":
      if (state.status !== "results") return state;
      return { ...state, hypotheses: upsertHypothesis(state.hypotheses, action.payload) };
    case "DONE":
      if (state.status !== "results") return state;
      return { ...state, llm_provider: action.llm_provider, complete: true };
    case "ERROR":
      return { status: "error", message: action.message };
    default:
      return state;
  }
}

export function useHypotheses() {
  const [state, dispatch] = useReducer(reducer, { status: "idle" });

  async function submit(req: HypothesisRequest) {
    dispatch({ type: "SUBMIT" });
    try {
      for await (const { event, data } of streamHypotheses(req)) {
        if (event === "drug_overview") {
          dispatch({
            type: "DRUG_OVERVIEW",
            drug_name: data.drug_name,
            drug_overview: data.drug_overview,
            llm_provider: data.llm_provider,
            disclaimer: data.disclaimer,
          });
        } else if (event === "hypothesis") {
          dispatch({ type: "HYPOTHESIS", payload: data });
        } else if (event === "done") {
          dispatch({ type: "DONE", llm_provider: data.llm_provider });
        } else if (event === "error") {
          dispatch({ type: "ERROR", message: data.message });
        }
      }
    } catch (err) {
      dispatch({ type: "ERROR", message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return { state, submit };
}
