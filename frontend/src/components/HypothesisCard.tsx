import type { Hypothesis } from "../types";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { EvidenceSection } from "./EvidenceSection";
import { ExperimentList } from "./ExperimentList";

interface Props {
  hypothesis: Hypothesis;
}

export function HypothesisCard({ hypothesis: h }: Props) {
  return (
    <article className="hypothesis-card">
      <header className="card-header">
        <span className="hypothesis-number">Hypothesis {h.id}</span>
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
        <summary>Literature &amp; Pathways</summary>
        <EvidenceSection
          abstracts={h.pubmed_abstracts}
          pathways={h.reactome_pathways}
        />
      </details>

      <details className="card-details" open>
        <summary>Suggested Experiments ({h.suggested_experiments.length})</summary>
        <ExperimentList experiments={h.suggested_experiments} />
      </details>
    </article>
  );
}
