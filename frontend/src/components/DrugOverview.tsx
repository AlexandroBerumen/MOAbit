import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import type { DrugOverview as DrugOverviewType } from "../types";

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  flowchart: { curve: "basis", padding: 20 },
  securityLevel: "loose",
});

let _diagramCounter = 0;

interface Props {
  overview: DrugOverviewType;
  drugName: string;
}

export function DrugOverview({ overview, drugName }: Props) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const [diagramError, setDiagramError] = useState(false);

  useEffect(() => {
    if (!diagramRef.current || !overview.mermaid_diagram) return;

    const id = `mermaid-${++_diagramCounter}`;

    mermaid
      .render(id, overview.mermaid_diagram)
      .then(({ svg }) => {
        if (diagramRef.current) {
          diagramRef.current.innerHTML = svg;
        }
      })
      .catch(() => setDiagramError(true));
  }, [overview.mermaid_diagram]);

  return (
    <section className="drug-overview">
      <h2 className="drug-overview-title">
        {drugName.replace(/^\[DEMO\] /, "")} — Mechanism Overview
      </h2>
      <p className="drug-overview-summary">{overview.summary}</p>
      {!diagramError ? (
        <div className="drug-overview-diagram" ref={diagramRef} />
      ) : (
        <p className="drug-overview-diagram-error">Diagram could not be rendered.</p>
      )}
    </section>
  );
}
