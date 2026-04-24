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

    # Step 1: Gemini generates hypothesis skeletons with search strategies, not PMIDs
    try:
        raw_hypotheses = await gemini_service.generate_hypotheses(
            drug_name=request.drug_name,
            target=request.target,
            context=request.context,
            observations=request.observations,
        )
    except Exception as exc:
        logger.error("Hypothesis generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Hypothesis generation failed: {exc}")

    if not raw_hypotheses:
        raise HTTPException(status_code=502, detail="Gemini returned no hypotheses.")

    # Step 2 + 3: For each hypothesis, fetch all data sources concurrently, then synthesize
    async def enrich_one(idx: int, hyp: dict) -> Hypothesis:
        pubmed_data, uniprot_data, reactome_data = await asyncio.gather(
            pubmed_service.search_and_fetch(hyp.get("pubmed_search_queries", [])),
            uniprot_service.fetch_protein_data(hyp.get("uniprot_gene_symbols", [])),
            reactome_service.fetch_pathways(hyp.get("reactome_search_terms", [])),
        )

        synthesis = await gemini_service.synthesize_evidence(
            mechanism=hyp["mechanism"],
            drug_name=request.drug_name,
            target=request.target,
            context=request.context,
            pubmed_data=pubmed_data,
            pathway_data=reactome_data,
        )

        supporting_pmids: set[str] = set(synthesis.get("supporting_pmids", []))
        abstracts = [
            PubMedAbstract(
                pmid=p["pmid"],
                title=p["title"],
                abstract=p["abstract"],
                url=f"https://pubmed.ncbi.nlm.nih.gov/{p['pmid']}",
            )
            for p in pubmed_data
            if p["pmid"] in supporting_pmids
        ]

        pathways = [
            ReactomePathway(
                pathway_id=pw["id"],
                name=pw["name"],
                url=f"https://reactome.org/PathwayBrowser/#/{pw['id']}",
            )
            for pw in reactome_data
        ]

        experiments = []
        for exp in synthesis.get("suggested_experiments", []):
            try:
                experiments.append(SuggestedExperiment(**exp))
            except Exception:
                logger.warning("Skipping malformed experiment: %s", exp)

        return Hypothesis(
            id=idx + 1,
            mechanism=hyp["mechanism"],
            confidence_score=synthesis.get("confidence_score", 5),
            reasoning=synthesis.get("reasoning", ""),
            pubmed_abstracts=abstracts,
            reactome_pathways=pathways,
            suggested_experiments=experiments,
        )

    # Run all enrichments concurrently; return_exceptions prevents one failure from crashing all
    enriched = await asyncio.gather(
        *[enrich_one(i, h) for i, h in enumerate(raw_hypotheses)],
        return_exceptions=True,
    )

    valid: list[Hypothesis] = []
    for i, result in enumerate(enriched):
        if isinstance(result, Hypothesis):
            valid.append(result)
        else:
            logger.warning("Hypothesis %d failed enrichment: %s", i, result)

    if not valid:
        raise HTTPException(status_code=502, detail="All hypotheses failed enrichment.")

    valid.sort(key=lambda h: h.confidence_score, reverse=True)

    return HypothesisResponse(drug_name=request.drug_name, hypotheses=valid)
