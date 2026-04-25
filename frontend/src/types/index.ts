export interface DrugOverview {
  summary: string;
  mermaid_diagram: string;
}

export interface ProtocolStep {
  step_number: number;
  title: string;
  description: string;
}

export interface Protocol {
  title: string;
  overview: string;
  duration: string;
  materials: string[];
  steps: ProtocolStep[];
  expected_results: string;
  troubleshooting: string[];
  safety_notes: string;
}

export interface ProtocolRequest {
  drug_name: string;
  mechanism: string;
  experiment: SuggestedExperiment;
  observations?: string;
  prior_literature?: string;
}

export interface ProtocolResponse {
  protocol: Protocol;
  llm_provider: string;
}

export interface HypothesisRequest {
  drug_name: string;
  target?: string;
  context?: string;
  observations?: string;
  background?: string;
}

export interface PubMedAbstract {
  pmid: string;
  title: string;
  abstract: string;
  url: string;
}

export interface ReactomePathway {
  pathway_id: string;
  name: string;
  url: string;
}

export interface SuggestedExperiment {
  tier: "functional_rescue" | "reproducibility" | "mechanistic";
  measurement_type: "quantitative" | "qualitative";
  assay_type: string;
  primary_endpoint: string;
  cell_line: string;
  controls: string[];
  replicates: string;
  rationale: string;
}

export interface Hypothesis {
  id: number;
  mechanism: string;
  confidence_score: number;
  reasoning: string;
  pubmed_abstracts: PubMedAbstract[];
  reactome_pathways: ReactomePathway[];
  suggested_experiments: SuggestedExperiment[];
}

export interface HypothesisResponse {
  drug_name: string;
  drug_overview?: DrugOverview;
  hypotheses: Hypothesis[];
  llm_provider: string;
  disclaimer: string;
}

// ── SSE events from POST /api/hypotheses ─────────────────────────────────────

export interface DrugOverviewEvent {
  drug_name: string;
  drug_overview: DrugOverview | null;
  llm_provider: string;
  disclaimer: string;
}

export type SSEEvent =
  | { event: "drug_overview"; data: DrugOverviewEvent }
  | { event: "hypothesis"; data: Hypothesis }
  | { event: "done"; data: { llm_provider: string } }
  | { event: "error"; data: { message: string } };

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  email: string;
  name: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ── Saved hypotheses ──────────────────────────────────────────────────────────

export interface SavedHypothesis {
  id: number;
  drug_name: string;
  hypothesis: Hypothesis;
  notes: string;
  created_at: string;
}

export interface SaveRequest {
  drug_name: string;
  hypothesis: Hypothesis;
}

export interface PatchNotesRequest {
  notes: string;
}
