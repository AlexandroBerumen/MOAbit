export interface HypothesisRequest {
  drug_name: string;
  target?: string;
  context?: string;
  observations?: string;
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
  hypotheses: Hypothesis[];
  disclaimer: string;
}
