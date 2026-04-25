import { useEffect, useRef, useState } from "react";
import cytoscape, { type ElementDefinition, type StylesheetJson } from "cytoscape";
import type { DrugOverview as DrugOverviewType, MoAGraphEdge, MoAGraphNode } from "../types";

const CYTOSCAPE_STYLE: StylesheetJson = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-wrap": "wrap",
      "text-max-width": "140px",
      "font-size": "12px",
      "font-weight": "bold",
      color: "#10243f",
      "text-valign": "center",
      "text-halign": "center",
      width: "156px",
      height: "72px",
      padding: "14px",
      "border-width": "2px",
      "border-color": "#d7dde8",
      "background-color": "#f8fafc",
      shape: "round-rectangle",
    },
  },
  {
    selector: 'node[kind = "agent"]',
    style: {
      "background-color": "#fff3c4",
      "border-color": "#d9a800",
      shape: "round-rectangle",
    },
  },
  {
    selector: 'node[kind = "target"]',
    style: {
      "background-color": "#d7f0f4",
      "border-color": "#0f8ea3",
      shape: "ellipse",
    },
  },
  {
    selector: 'node[kind = "pathway"]',
    style: {
      "background-color": "#dde8ff",
      "border-color": "#4f7df3",
      shape: "round-rectangle",
    },
  },
  {
    selector: 'node[kind = "process"]',
    style: {
      "background-color": "#eef2f7",
      "border-color": "#8b9bb3",
      shape: "round-rectangle",
    },
  },
  {
    selector: 'node[kind = "effect"]',
    style: {
      "background-color": "#ffdfe0",
      "border-color": "#d35b61",
      shape: "hexagon",
    },
  },
  {
    selector: 'node[kind = "biomarker"]',
    style: {
      "background-color": "#efe1ff",
      "border-color": "#8a56d8",
      shape: "diamond",
    },
  },
  {
    selector: "edge",
    style: {
      width: "2.4px",
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "arrow-scale": 1.1,
      "line-color": "#95a3b8",
      "target-arrow-color": "#95a3b8",
      "source-endpoint": "outside-to-node",
      "target-endpoint": "outside-to-node",
    },
  },
  {
    selector: 'edge[interaction = "inhibits"]',
    style: {
      "line-color": "#d35b61",
      "target-arrow-color": "#d35b61",
      "target-arrow-shape": "tee",
    },
  },
  {
    selector: 'edge[interaction = "activates"]',
    style: {
      "line-color": "#2f9e5b",
      "target-arrow-color": "#2f9e5b",
    },
  },
  {
    selector: 'edge[interaction = "binds"]',
    style: {
      "line-color": "#0f8ea3",
      "target-arrow-color": "#0f8ea3",
      "target-arrow-shape": "diamond",
    },
  },
  {
    selector: 'edge[interaction = "causes"]',
    style: {
      "line-color": "#5d6f86",
      "target-arrow-color": "#5d6f86",
    },
  },
  {
    selector: 'edge[evidence = "inferred"]',
    style: {
      "line-style": "dashed",
    },
  },
];

const LEGEND_ITEMS = [
  { kind: "agent", label: "Therapeutic agent" },
  { kind: "target", label: "Target or receptor" },
  { kind: "pathway", label: "Pathway module" },
  { kind: "effect", label: "Phenotypic effect" },
];

const PATHWAY_PATTERN =
  /(pathway|signaling|signal transduction|cascade|mapk|pi3k|akt|stat|mtor|nf-?k|erk|smad|wnt|notch|hedgehog|vegf|tgf|jak)/i;
const EFFECT_PATTERN =
  /(apoptosis|survival|proliferation|differentiation|arrest|death|viability|growth|migration|resistance|senescence|inflammation|cytotoxicity|rescue|outcome)/i;
const BIOMARKER_PATTERN = /(biomarker|marker|phospho|ic50|ec50|mfi|readout|signal)/i;

type NodeKind = MoAGraphNode["kind"];

interface NormalizedNode {
  id: string;
  label: string;
  kind: NodeKind;
  group: string;
}

interface NormalizedEdge {
  source: string;
  target: string;
  interaction: MoAGraphEdge["interaction"];
  evidence: MoAGraphEdge["evidence"];
}

interface NetworkData {
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
}

let _fallbackNodeCounter = 0;

function cleanLabelText(label: string): string {
  return label
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

function makeSafeId(raw: string): string {
  const cleaned = raw
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  if (cleaned) return cleaned;
  _fallbackNodeCounter += 1;
  return `node_${_fallbackNodeCounter}`;
}

function fallbackNetwork(drugName: string): NetworkData {
  const agent = cleanLabelText(drugName.replace(/^\[DEMO\]\s*/, ""));
  return {
    nodes: [
      { id: "agent", label: agent || "Therapeutic agent", kind: "agent", group: "Therapeutic" },
      { id: "target", label: "Primary target or receptor", kind: "target", group: "Target" },
      { id: "pathway", label: "Affected pathway signaling", kind: "pathway", group: "Pathway" },
      { id: "effect", label: "Observed biological effect", kind: "effect", group: "Outcome" },
    ],
    edges: [
      { source: "agent", target: "target", interaction: "binds", evidence: "inferred" },
      { source: "target", target: "pathway", interaction: "modulates", evidence: "inferred" },
      { source: "pathway", target: "effect", interaction: "causes", evidence: "inferred" },
    ],
  };
}

function normalizeStructuredGraph(
  nodes: MoAGraphNode[] | undefined,
  edges: MoAGraphEdge[] | undefined,
): NetworkData | null {
  if (!nodes?.length) return null;

  const idMap = new Map<string, string>();
  const used = new Set<string>();
  const normalizedNodes: NormalizedNode[] = [];

  for (const node of nodes) {
    const originalId = cleanLabelText(node.id);
    const label = cleanLabelText(node.label || node.id);
    let safeId = makeSafeId(originalId || label);
    let suffix = 2;
    while (used.has(safeId)) {
      safeId = `${makeSafeId(originalId || label)}_${suffix++}`;
    }

    used.add(safeId);
    if (originalId) idMap.set(originalId, safeId);
    normalizedNodes.push({
      id: safeId,
      label: label || safeId,
      kind: node.kind ?? "unknown",
      group: cleanLabelText(node.group ?? ""),
    });
  }

  const normalizedEdges: NormalizedEdge[] = [];
  for (const edge of edges ?? []) {
    const source = idMap.get(cleanLabelText(edge.source));
    const target = idMap.get(cleanLabelText(edge.target));
    if (!source || !target || source === target) continue;
    normalizedEdges.push({
      source,
      target,
      interaction: edge.interaction ?? "modulates",
      evidence: edge.evidence ?? "inferred",
    });
  }

  if (!normalizedEdges.length && normalizedNodes.length > 1) {
    for (let i = 0; i < normalizedNodes.length - 1; i += 1) {
      normalizedEdges.push({
        source: normalizedNodes[i].id,
        target: normalizedNodes[i + 1].id,
        interaction: i === 0 ? "binds" : "modulates",
        evidence: "inferred",
      });
    }
  }

  return { nodes: normalizedNodes, edges: normalizedEdges };
}

function parseMermaidNode(token: string): { rawId: string; label: string } {
  const trimmed = token.trim();
  const match = trimmed.match(/^([^\s[\](){}<>]+)\s*(\[(.*)\]|\((.*)\)|\{(.*)\})?$/);
  if (!match) {
    const label = cleanLabelText(trimmed);
    return { rawId: label, label };
  }

  const rawId = cleanLabelText(match[1]);
  const label = cleanLabelText(match[3] || match[4] || match[5] || rawId);
  return { rawId, label: label || rawId };
}

function inferNodeKinds(network: NetworkData, drugName: string): NetworkData {
  const indegree = new Map<string, number>();
  const outdegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of network.nodes) {
    indegree.set(node.id, 0);
    outdegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of network.edges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outdegree.set(edge.source, (outdegree.get(edge.source) ?? 0) + 1);
    adjacency.get(edge.source)?.push(edge.target);
  }

  const drugLabel = cleanLabelText(drugName.replace(/^\[DEMO\]\s*/, "")).toLowerCase();
  const roots = network.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const depth = new Map<string, number>();
  const queue = [...roots];

  for (const root of roots) depth.set(root, 0);

  while (queue.length) {
    const current = queue.shift()!;
    const currentDepth = depth.get(current) ?? 0;
    for (const next of adjacency.get(current) ?? []) {
      if (!depth.has(next)) {
        depth.set(next, currentDepth + 1);
        queue.push(next);
      }
    }
  }

  return {
    nodes: network.nodes.map((node) => {
      if (node.kind !== "unknown") return node;

      const label = node.label.toLowerCase();
      const nodeDepth = depth.get(node.id) ?? 0;
      let kind: NodeKind = "process";

      if (nodeDepth === 0 || label === drugLabel) {
        kind = "agent";
      } else if (PATHWAY_PATTERN.test(label)) {
        kind = "pathway";
      } else if (BIOMARKER_PATTERN.test(label)) {
        kind = "biomarker";
      } else if (EFFECT_PATTERN.test(label) || (outdegree.get(node.id) ?? 0) === 0) {
        kind = "effect";
      } else if (nodeDepth === 1) {
        kind = "target";
      }

      return { ...node, kind };
    }),
    edges: network.edges,
  };
}

function parseMermaidNetwork(source: string, drugName: string): NetworkData | null {
  const stripped = source
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();

  if (!stripped) return null;

  const nodeMap = new Map<string, NormalizedNode>();
  const edges: NormalizedEdge[] = [];
  const rawToSafe = new Map<string, string>();

  function ensureNode(rawId: string, label: string): string {
    const cleanedRawId = cleanLabelText(rawId);
    if (cleanedRawId && rawToSafe.has(cleanedRawId)) {
      const existingId = rawToSafe.get(cleanedRawId)!;
      const existing = nodeMap.get(existingId);
      if (existing && existing.label === existing.id && label) existing.label = label;
      return existingId;
    }

    let safeId = makeSafeId(cleanedRawId || label);
    let suffix = 2;
    while (nodeMap.has(safeId)) {
      safeId = `${makeSafeId(cleanedRawId || label)}_${suffix++}`;
    }

    if (cleanedRawId) rawToSafe.set(cleanedRawId, safeId);
    nodeMap.set(safeId, {
      id: safeId,
      label: cleanLabelText(label || cleanedRawId || safeId),
      kind: "unknown",
      group: "",
    });
    return safeId;
  }

  for (const rawLine of stripped.split("\n")) {
    const line = rawLine.trim();
    if (
      !line ||
      /^(?:flowchart|graph)\b/i.test(line) ||
      /^%%/.test(line) ||
      /^subgraph\b/i.test(line) ||
      /^end\b/i.test(line) ||
      /^classDef\b/i.test(line) ||
      /^class\b/i.test(line) ||
      /^style\b/i.test(line) ||
      /^linkStyle\b/i.test(line)
    ) {
      continue;
    }

    const segments = line.split(/(-\.->|-->|---|==>)/).map((part) => part.trim()).filter(Boolean);
    if (!segments.length) continue;

    const firstNode = parseMermaidNode(segments[0]);
    let previousId = ensureNode(firstNode.rawId, firstNode.label);

    for (let i = 1; i < segments.length; i += 2) {
      const arrow = segments[i];
      const nextToken = segments[i + 1];
      if (!nextToken) continue;

      const nextNode = parseMermaidNode(nextToken);
      const nextId = ensureNode(nextNode.rawId, nextNode.label);
      edges.push({
        source: previousId,
        target: nextId,
        interaction: arrow === "---" ? "associated_with" : "modulates",
        evidence: "inferred",
      });
      previousId = nextId;
    }
  }

  if (!nodeMap.size) return null;
  return inferNodeKinds({ nodes: [...nodeMap.values()], edges }, drugName);
}

function buildNetwork(overview: DrugOverviewType, drugName: string): NetworkData {
  const structured = normalizeStructuredGraph(overview.moa_graph?.nodes, overview.moa_graph?.edges);
  if (structured) return inferNodeKinds(structured, drugName);

  if (overview.mermaid_diagram) {
    const parsed = parseMermaidNetwork(overview.mermaid_diagram, drugName);
    if (parsed) return parsed;
  }

  return fallbackNetwork(drugName);
}

function countByKind(nodes: NormalizedNode[], kind: NodeKind): number {
  return nodes.filter((node) => node.kind === kind).length;
}

interface Props {
  overview: DrugOverviewType;
  drugName: string;
}

export function DrugOverview({ overview, drugName }: Props) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const [diagramError, setDiagramError] = useState(false);
  const network = buildNetwork(overview, drugName);
  const graphSignature = JSON.stringify(overview.moa_graph ?? null);

  useEffect(() => {
    if (!diagramRef.current) return;

    let disposed = false;

    try {
      const elements: ElementDefinition[] = [
        ...network.nodes.map((node) => ({
          data: {
            id: node.id,
            label: node.label,
            kind: node.kind,
            group: node.group,
          },
        })),
        ...network.edges.map((edge, index) => ({
          data: {
            id: `${edge.source}_${edge.target}_${index}`,
            source: edge.source,
            target: edge.target,
            interaction: edge.interaction,
            evidence: edge.evidence,
          },
        })),
      ];

      const cy = cytoscape({
        container: diagramRef.current,
        elements,
        style: CYTOSCAPE_STYLE,
        layout: {
          name: "breadthfirst",
          directed: true,
          spacingFactor: 1.25,
          padding: 28,
          animate: false,
        },
        userZoomingEnabled: false,
        userPanningEnabled: false,
        boxSelectionEnabled: false,
        autoungrabify: true,
      });

      setDiagramError(false);

      const handleResize = () => {
        if (disposed) return;
        cy.resize();
        cy.fit(undefined, 24);
      };

      cy.ready(() => handleResize());
      window.addEventListener("resize", handleResize);

      return () => {
        disposed = true;
        window.removeEventListener("resize", handleResize);
        cy.destroy();
      };
    } catch (error) {
      console.warn("Cytoscape render failed", error);
      if (!disposed) setDiagramError(true);
    }
  }, [drugName, overview.mermaid_diagram, graphSignature]);

  const cleanDrugName = drugName.replace(/^\[DEMO\] /, "");

  return (
    <section className="drug-overview">
      <div className="drug-overview-header">
        <div>
          <h2 className="drug-overview-title">{cleanDrugName} — Mechanism Network</h2>
          <p className="drug-overview-summary">{overview.summary}</p>
        </div>
        <div className="drug-overview-stats" aria-label="Mechanism network summary">
          <span className="drug-overview-stat">
            <strong>{countByKind(network.nodes, "target")}</strong> targets
          </span>
          <span className="drug-overview-stat">
            <strong>{countByKind(network.nodes, "pathway")}</strong> pathways
          </span>
          <span className="drug-overview-stat">
            <strong>{countByKind(network.nodes, "effect")}</strong> effects
          </span>
        </div>
      </div>

      <div className="drug-overview-legend" role="list" aria-label="Mechanism network legend">
        {LEGEND_ITEMS.map((item) => (
          <span key={item.kind} className="drug-overview-legend-item" role="listitem">
            <span className={`drug-overview-swatch drug-overview-swatch-${item.kind}`} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>

      {!diagramError ? (
        <div className="drug-overview-diagram-frame">
          <div className="drug-overview-diagram" ref={diagramRef} />
        </div>
      ) : (
        <p className="drug-overview-diagram-error">Mechanism network could not be rendered.</p>
      )}
    </section>
  );
}
