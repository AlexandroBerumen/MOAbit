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
let _safeNodeCounter = 0;

function cleanLabelText(label: string): string {
  return label
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .trim();
}

function extractNodeLabel(token: string): string {
  const shapeMatch = token.match(/^([^\s[\](){}<>]+)\s*(\[(?:.*)\]|\((?:.*)\)|\{(?:.*)\})$/);
  if (!shapeMatch) return token.trim();

  const rawShape = shapeMatch[2].trim();
  const inner = rawShape.slice(1, -1).trim();
  return cleanLabelText(inner.replace(/^['"]|['"]$/g, ""));
}

function normalizeMermaidSource(source: string): string {
  const stripped = source
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/→/g, "-->")
    .trim();

  if (!stripped) return "flowchart TD";

  const rawLines = stripped
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.toLowerCase() !== "mermaid");

  const headerMatch = rawLines[0]?.match(/^(?:flowchart|graph)\s+(TD|TB|BT|RL|LR)\b/i);
  const direction = headerMatch?.[1].toUpperCase() ?? "TD";
  const bodyLines = headerMatch ? rawLines.slice(1) : rawLines;

  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();

  function getSafeId(rawId: string, fallbackLabel?: string): string {
    const key = rawId.trim();
    if (key && idMap.has(key)) return idMap.get(key)!;

    const base = (key || fallbackLabel || `node_${++_safeNodeCounter}`)
      .replace(/^['"]|['"]$/g, "")
      .replace(/[^A-Za-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || `node_${++_safeNodeCounter}`;

    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}_${suffix++}`;
    }

    usedIds.add(candidate);
    if (key) idMap.set(key, candidate);
    return candidate;
  }

  function normalizeNodeToken(token: string): string {
    const trimmed = token.trim();
    if (!trimmed) return trimmed;

    const nodeMatch = trimmed.match(/^([^\s[\](){}<>]+)\s*(\[(?:.*)\]|\((?:.*)\)|\{(?:.*)\})$/);
    if (nodeMatch) {
      const rawId = nodeMatch[1];
      const label = extractNodeLabel(trimmed);
      return `${getSafeId(rawId, label)}["${label}"]`;
    }

    if (/^[^\s[\](){}<>|]+$/.test(trimmed)) {
      return getSafeId(trimmed, trimmed);
    }

    return trimmed;
  }

  const normalizedLines = bodyLines.map((line) => {
    if (
      /^%%/.test(line) ||
      /^subgraph\b/i.test(line) ||
      /^end\b/i.test(line) ||
      /^classDef\b/i.test(line) ||
      /^class\b/i.test(line) ||
      /^style\b/i.test(line) ||
      /^linkStyle\b/i.test(line)
    ) {
      return line;
    }

    if (!/-->|---|==>|-.->/.test(line)) {
      return normalizeNodeToken(line);
    }

    return line
      .split(/(-\.->|-->|---|==>)/)
      .map((part, index) => (index % 2 === 1 ? part : normalizeNodeToken(part)))
      .join(" ");
  });

  return [`flowchart ${direction}`, ...normalizedLines].join("\n");
}

function buildFallbackDiagram(drugName: string): string {
  const agent = cleanLabelText(drugName.replace(/^\[DEMO\]\s*/, ""));

  return [
    "flowchart TD",
    `  agent["${agent}"] --> target["Primary target or receptor"]`,
    '  target --> pathway["Affected pathway signaling"]',
    '  pathway --> effect["Observed biological effect"]',
  ].join("\n");
}

interface Props {
  overview: DrugOverviewType;
  drugName: string;
}

export function DrugOverview({ overview, drugName }: Props) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const [diagramError, setDiagramError] = useState(false);

  useEffect(() => {
    if (!diagramRef.current || !overview.mermaid_diagram) return;

    let cancelled = false;

    async function renderDiagram() {
      setDiagramError(false);

      const candidates = [
        normalizeMermaidSource(overview.mermaid_diagram),
        buildFallbackDiagram(drugName),
      ];

      for (const source of candidates) {
        try {
          const { svg } = await mermaid.render(`mermaid-${++_diagramCounter}`, source);
          if (!cancelled && diagramRef.current) {
            diagramRef.current.innerHTML = svg;
          }
          return;
        } catch (error) {
          console.warn("Mermaid render failed, trying fallback", error);
        }
      }

      if (!cancelled) {
        if (diagramRef.current) diagramRef.current.innerHTML = "";
        setDiagramError(true);
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [drugName, overview.mermaid_diagram]);

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
