import type { Hypothesis } from "../types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { EvidenceSection } from "./EvidenceSection";
import { ExperimentList } from "./ExperimentList";

interface Props {
  hypothesis: Hypothesis;
  drugName: string;
  allowSave?: boolean;
  showNumber?: boolean;
}

export function HypothesisCard({ hypothesis: h, drugName, allowSave = true, showNumber = true }: Props) {
  return (
    <article className="hypothesis-card">
      <header className="card-header">
        {showNumber ? <span className="hypothesis-number">Hypothesis {h.id}</span> : <span />}
        <ConfidenceBadge score={h.confidence_score} />
      </header>

      <section className="mechanism">
        <p>{h.mechanism}</p>
      </section>

      <section className="reasoning">
        <h4>Evidence Assessment</h4>
        <p>{h.reasoning}</p>
      </section>

      <details className="card-details">
        <summary>Sources &amp; Pathways</summary>
        <EvidenceSection abstracts={h.pubmed_abstracts} pathways={h.reactome_pathways} />
      </details>

      <details className="card-details" open>
        <summary>Suggested Experiments ({h.suggested_experiments.length})</summary>
        <ExperimentList
          hypothesis={h}
          experiments={h.suggested_experiments}
          drugName={drugName}
          mechanism={h.mechanism}
          allowSave={allowSave}
        />
      </details>
    </article>
  );
}
