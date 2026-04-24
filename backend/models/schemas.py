from typing import Literal, Optional
from pydantic import BaseModel, Field


class HypothesisRequest(BaseModel):
    drug_name: str = Field(..., min_length=1, max_length=200)
    target: Optional[str] = Field(None, max_length=200)
    context: Optional[str] = Field(None, max_length=500)
    observations: Optional[str] = Field(None, max_length=1000)


class PubMedAbstract(BaseModel):
    pmid: str
    title: str
    abstract: str
    url: str


class ReactomePathway(BaseModel):
    pathway_id: str
    name: str
    url: str


class SuggestedExperiment(BaseModel):
    tier: Literal["functional_rescue", "reproducibility", "mechanistic"]
    measurement_type: Literal["quantitative", "qualitative"]
    assay_type: str
    primary_endpoint: str
    cell_line: str
    controls: list[str]
    replicates: str
    rationale: str


class Hypothesis(BaseModel):
    id: int
    mechanism: str
    confidence_score: int = Field(..., ge=1, le=10)
    reasoning: str
    pubmed_abstracts: list[PubMedAbstract]
    reactome_pathways: list[ReactomePathway]
    suggested_experiments: list[SuggestedExperiment]


class HypothesisResponse(BaseModel):
    drug_name: str
    hypotheses: list[Hypothesis]
    disclaimer: str = (
        "MOAbit generates AI-assisted hypotheses for research purposes only. "
        "Outputs have not undergone regulatory review and must not be used as "
        "the sole basis for clinical or regulatory decisions."
    )
