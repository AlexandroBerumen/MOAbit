import asyncio
import logging

from fastapi import APIRouter, HTTPException

from core.config import settings
from models.schemas import (
    Hypothesis,
    HypothesisRequest,
    HypothesisResponse,
    PubMedAbstract,
    ReactomePathway,
    SuggestedExperiment,
)
from services import gemini_service, pubmed_service, reactome_service, uniprot_service
from services.demo_data import DEMO_RESPONSE

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/hypotheses", response_model=HypothesisResponse)
async def generate_hypotheses(request: HypothesisRequest) -> HypothesisResponse:
    if settings.demo_mode:
        logger.info("Demo mode active — returning hardcoded response")
        return DEMO_RESPONSE

    # ── Step 1: LLM generates hypothesis skeletons + drug overview (1 call) ───
    try:
        raw_hypotheses, drug_overview_raw, provider_gen = await gemini_service.generate_hypotheses(
            drug_name=request.drug_name,
            target=request.target,
            context=request.context,
            observations=request.observations,
            background=request.background,
        )
    except Exception as exc:
        logger.error("Hypothesis generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Hypothesis generation failed: {exc}")

    if not raw_hypotheses:
        raise HTTPException(status_code=502, detail="Gemini returned no hypotheses.")

    # ── Step 2: Fetch external data for all hypotheses concurrently ───────────
    # No Gemini calls here — just PubMed, UniProt, Reactome in parallel.
    async def fetch_one(hyp: dict) -> dict:
        results = await asyncio.gather(
            pubmed_service.search_and_fetch(hyp.get("pubmed_search_queries", []), max_per_query=2),
            uniprot_service.fetch_protein_data(hyp.get("uniprot_gene_symbols", [])),
            reactome_service.fetch_pathways(hyp.get("reactome_search_terms", [])),
            return_exceptions=True,
        )
        # Each service is independent — a PubMed 429 shouldn't kill Reactome data
        pubmed_data  = results[0] if isinstance(results[0], list) else []
        reactome_data = results[2] if isinstance(results[2], list) else []
        if not isinstance(results[0], list):
            logger.warning("PubMed fetch failed for '%s': %s", hyp["mechanism"][:60], results[0])
        return {"mechanism": hyp["mechanism"], "pubmed_data": pubmed_data, "pathway_data": reactome_data}

    fetched = await asyncio.gather(
        *[fetch_one(h) for h in raw_hypotheses],
        return_exceptions=True,
    )

    enriched_inputs = [f for f in fetched if isinstance(f, dict)]
    if not enriched_inputs:
        raise HTTPException(status_code=502, detail="All external data fetches failed.")

    # ── Step 3: LLM scores ALL hypotheses in one call ────────────────────────
    try:
        syntheses, provider_syn = await gemini_service.synthesize_all(
            hypotheses=enriched_inputs,
            drug_name=request.drug_name,
            target=request.target,
            context=request.context,
            background=request.background,
        )
    except Exception as exc:
        logger.error("Batch synthesis failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Synthesis failed: {exc}")

    providers = sorted({provider_gen, provider_syn})
    llm_provider = " + ".join(providers)

    # ── Step 4: Assemble Hypothesis objects ───────────────────────────────────
    valid: list[Hypothesis] = []
    for enriched, synthesis in zip(enriched_inputs, syntheses):
        # Normalize supporting_pmids to strings — Gemini sometimes returns ints
        supporting_pmids = {str(p) for p in synthesis.get("supporting_pmids", [])}

        # Filter to cited abstracts; fall back to all fetched if Gemini cited none
        matched = [p for p in enriched["pubmed_data"] if p["pmid"] in supporting_pmids]
        abstracts_to_show = matched if matched else enriched["pubmed_data"]

        abstracts = [
            PubMedAbstract(
                pmid=p["pmid"],
                title=p["title"],
                abstract=p["abstract"],
                url=f"https://pubmed.ncbi.nlm.nih.gov/{p['pmid']}",
            )
            for p in abstracts_to_show
        ]

        pathways = [
            ReactomePathway(
                pathway_id=pw["id"],
                name=pw["name"],
                url=f"https://reactome.org/PathwayBrowser/#/{pw['id']}",
            )
            for pw in enriched["pathway_data"]
        ]

        experiments = []
        for exp in synthesis.get("suggested_experiments", []):
            try:
                experiments.append(SuggestedExperiment(**exp))
            except Exception:
                logger.warning("Skipping malformed experiment: %s", exp)

        valid.append(Hypothesis(
            id=0,  # placeholder; reassigned after sort
            mechanism=enriched["mechanism"],
            confidence_score=synthesis.get("confidence_score", 5),
            reasoning=synthesis.get("reasoning", ""),
            pubmed_abstracts=abstracts,
            reactome_pathways=pathways,
            suggested_experiments=experiments,
        ))

    valid.sort(key=lambda h: h.confidence_score, reverse=True)

    # Reassign IDs after sort so they always run 1, 2, 3... regardless of which
    # hypotheses succeeded or what order Gemini returned them in
    for i, h in enumerate(valid):
        h.id = i + 1

    from models.schemas import DrugOverview
    drug_overview = None
    if drug_overview_raw.get("summary") and drug_overview_raw.get("mermaid_diagram"):
        try:
            drug_overview = DrugOverview(**drug_overview_raw)
        except Exception:
            logger.warning("Malformed drug_overview from LLM — skipping")

    return HypothesisResponse(
        drug_name=request.drug_name,
        drug_overview=drug_overview,
        hypotheses=valid,
        llm_provider=llm_provider,
    )
