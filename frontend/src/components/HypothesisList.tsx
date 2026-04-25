import type { Hypothesis, DrugOverview as DrugOverviewType } from "../types";
import { HypothesisCard } from "./HypothesisCard";
import { DrugOverview } from "./DrugOverview";
import { StreamingBanner } from "./StatusBanner";

const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini 2.5 Flash",
  groq: "Groq · Llama",
  "gemini + groq": "Gemini 2.5 Flash + Groq",
};

interface Props {
  hypotheses: Hypothesis[];
  drugName: string;
  drugOverview?: DrugOverviewType;
  llmProvider: string;
  disclaimer: string;
  streaming?: boolean;
}

export function HypothesisList({ hypotheses, drugName, drugOverview, llmProvider, disclaimer, streaming }: Props) {
  const isDemo = disclaimer.startsWith("DEMO MODE");
  const providerLabel = PROVIDER_LABELS[llmProvider] ?? llmProvider;

  return (
    <div className="hypothesis-list">
      <div className="results-meta">
        <span className="provider-badge">
          {isDemo ? "Demo data" : providerLabel}
        </span>
      </div>

      {drugOverview && (
        <DrugOverview overview={drugOverview} drugName={drugName} />
      )}

      <div className={`disclaimer ${isDemo ? "disclaimer-demo" : ""}`} role="note">
        <strong>{isDemo ? "Demo mode:" : "Research use only:"}</strong>{" "}
        {disclaimer}
      </div>

      {hypotheses.map((h) => (
        <HypothesisCard key={h.id} hypothesis={h} drugName={drugName} />
      ))}

      {streaming && <StreamingBanner count={hypotheses.length} />}
    </div>
  );
}
