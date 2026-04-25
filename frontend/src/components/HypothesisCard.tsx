import { useState } from "react";
import type { Hypothesis } from "../types";
import { apiClient } from "../api/client";
import { useAuthContext } from "../context/AuthContext";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { EvidenceSection } from "./EvidenceSection";
import { ExperimentList } from "./ExperimentList";

interface Props {
  hypothesis: Hypothesis;
  drugName: string;
}

export function HypothesisCard({ hypothesis: h, drugName }: Props) {
  const { state: authState } = useAuthContext();
  const isAuthed = authState.status === "authed";
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!isAuthed || saved || saving) return;
    setSaving(true);
    try {
      await apiClient.saveHypothesis({ drug_name: drugName, hypothesis: h });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="hypothesis-card">
      <header className="card-header">
        <span className="hypothesis-number">Hypothesis {h.id}</span>
        <ConfidenceBadge score={h.confidence_score} />
        {isAuthed ? (
          <button
            className={`save-btn ${saved ? "save-btn-saved" : ""}`}
            onClick={handleSave}
            disabled={saving || saved}
            title={saved ? "Saved to your library" : "Save this hypothesis"}
            type="button"
          >
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
          </button>
        ) : (
          <span className="save-hint" title="Log in to save hypotheses">
            Login to save
          </span>
        )}
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
        <EvidenceSection abstracts={h.pubmed_abstracts} pathways={h.reactome_pathways} />
      </details>

      <details className="card-details" open>
        <summary>Suggested Experiments ({h.suggested_experiments.length})</summary>
        <ExperimentList
          experiments={h.suggested_experiments}
          drugName={drugName}
          mechanism={h.mechanism}
        />
      </details>
    </article>
  );
}
