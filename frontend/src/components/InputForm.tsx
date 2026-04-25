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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!drugName.trim()) return;
    onSubmit({
      drug_name: drugName.trim(),
      target: target.trim() || undefined,
      context: context.trim() || undefined,
    });
  }

  return (
    <form className="input-form" onSubmit={handleSubmit}>
      <div className="field required">
        <label htmlFor="drug-name">
          Therapeutic Agent
          <span className="optional"> (small molecule, biologic, AAV vector, mRNA, cell therapy, clinical candidate…)</span>
        </label>
        <input
          id="drug-name"
          type="text"
          placeholder="e.g. imatinib, AAV9-SMN1, pembrolizumab, BNT111, CAR-T BCMA"
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
          placeholder="e.g. BCR-ABL1, SMN1, PD-1, capsid serotype AAV9"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="field">
        <label htmlFor="context">
          Additional Context <span className="optional">(optional)</span>
        </label>
        <textarea
          id="context"
          placeholder={`Cell type, organism, disease model, assay system — e.g. K562 cells, xenograft model\nObservations — e.g. 40% reduction in cell viability at 1 µM; resistance after 6 months\nPrior literature — paste abstracts, IC50 data, known biology`}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={isLoading}
          rows={5}
        />
      </div>

      <button type="submit" disabled={isLoading || !drugName.trim()}>
        {isLoading ? "Generating hypotheses…" : "Generate MOA Hypotheses"}
      </button>
    </form>
  );
}
