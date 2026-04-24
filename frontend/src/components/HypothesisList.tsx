import type { Hypothesis } from "../types";
import { HypothesisCard } from "./HypothesisCard";

interface Props {
  hypotheses: Hypothesis[];
  disclaimer: string;
}

export function HypothesisList({ hypotheses, disclaimer }: Props) {
  return (
    <div className="hypothesis-list">
      <div className={`disclaimer ${disclaimer.startsWith("DEMO MODE") ? "disclaimer-demo" : ""}`} role="note">
        <strong>{disclaimer.startsWith("DEMO MODE") ? "Demo mode:" : "Research use only:"}</strong>{" "}
        {disclaimer}
      </div>
      {hypotheses.map((h) => (
        <HypothesisCard key={h.id} hypothesis={h} />
      ))}
    </div>
  );
}
