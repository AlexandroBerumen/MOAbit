import { type FormEvent, useState } from "react";
import type { HypothesisRequest } from "../types";

interface Props {
  onSubmit: (req: HypothesisRequest) => void;
  isLoading: boolean;
}

export function InputForm({ onSubmit, isLoading }: Props) {
  const [drugName, setDrugName] = useState("");
  const [target, setTarget] = useState("");
  const [context, setContext] = useState("");
  const [observations, setObservations] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!drugName.trim()) return;
    onSubmit({
      drug_name: drugName.trim(),
      target: target.trim() || undefined,
      context: context.trim() || undefined,
      observations: observations.trim() || undefined,
    });
  }

  return (
    <form className="input-form" onSubmit={handleSubmit}>
      <div className="field required">
        <label htmlFor="drug-name">Drug / Compound</label>
        <input
          id="drug-name"
          type="text"
          placeholder="e.g. imatinib, SB-431542, compound 12"
          value={drugName}
          onChange={(e) => setDrugName(e.target.value)}
          required
          disabled={isLoading}
        />
      </div>

      <div className="field">
        <label htmlFor="target">
          Target <span className="optional">(gene, protein, pathway, or leave blank if unknown)</span>
        </label>
        <input
          id="target"
          type="text"
          placeholder="e.g. BCR-ABL1, TGFBR1, PI3K pathway"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="field">
        <label htmlFor="context">
          Experimental Context <span className="optional">(cell type, organism, disease, assay system)</span>
        </label>
        <input
          id="context"
          type="text"
          placeholder="e.g. K562 cells, primary mouse hepatocytes, xenograft model"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="field">
        <label htmlFor="observations">
          Observations <span className="optional">(what do you see in your assay?)</span>
        </label>
        <textarea
          id="observations"
          placeholder="e.g. 40% reduction in cell viability at 1 µM; resistance emerging after 6 months of treatment"
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          disabled={isLoading}
          rows={3}
        />
      </div>

      <button type="submit" disabled={isLoading || !drugName.trim()}>
        {isLoading ? "Generating hypotheses…" : "Generate MOA Hypotheses"}
      </button>
    </form>
  );
}
