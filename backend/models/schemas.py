from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field


class DrugOverview(BaseModel):
    summary: str
    mermaid_diagram: str


class HypothesisRequest(BaseModel):
    drug_name: str = Field(..., min_length=1, max_length=200)
    target: Optional[str] = Field(None, max_length=200)
    context: Optional[str] = Field(None, max_length=8000)
    observations: Optional[str] = Field(None, max_length=1000)
    background: Optional[str] = Field(None, max_length=8000)


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


class ProtocolStep(BaseModel):
    step_number: int
    title: str
    description: str


class Protocol(BaseModel):
    title: str
    overview: str
    duration: str
    materials: list[str]
    steps: list[ProtocolStep]
    expected_results: str
    troubleshooting: list[str]
    safety_notes: str


class ProtocolRequest(BaseModel):
    drug_name: str
    mechanism: str
    experiment: SuggestedExperiment
    observations: str = ""
    prior_literature: str = ""


class ProtocolResponse(BaseModel):
    protocol: Protocol
    llm_provider: str = "unknown"


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str = Field(..., max_length=254)
    password: str = Field(..., min_length=8, max_length=128)
    name: str = Field(..., min_length=1, max_length=120)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    name: str


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Saved hypotheses ──────────────────────────────────────────────────────────

class SaveRequest(BaseModel):
    drug_name: str = Field(..., max_length=200)
    hypothesis: Hypothesis


class PatchNotesRequest(BaseModel):
    notes: str = Field(..., max_length=2000)


class SavedHypothesisResponse(BaseModel):
    id: int
    drug_name: str
    hypothesis: Hypothesis
    notes: str
    created_at: datetime


class HypothesisResponse(BaseModel):
    drug_name: str
    drug_overview: Optional[DrugOverview] = None
    hypotheses: list[Hypothesis]
    llm_provider: str = "unknown"
    disclaimer: str = (
        "MOAbit generates AI-assisted hypotheses for research purposes only. "
        "Outputs have not undergone regulatory review and must not be used as "
        "the sole basis for clinical or regulatory decisions."
    )
