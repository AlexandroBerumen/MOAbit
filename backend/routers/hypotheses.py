import asyncio
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from core.config import settings
from models.schemas import (
    Hypothesis,
    HypothesisRequest,
    PubMedAbstract,
    ReactomePathway,
    SuggestedExperiment,
)
from services import gemini_service, pubmed_service, reactome_service
from services.demo_data import DEMO_RESPONSE

logger = logging.getLogger(__name__)
router = APIRouter()

_DISCLAIMER = (
    "MOAbit generates AI-assisted hypotheses for research purposes only. "
    "Outputs have not undergone regulatory review and must not be used as "
    "the sole basis for clinical or regulatory decisions."
)


def _sse(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _hypothesis_stream(request: HypothesisRequest) -> AsyncGenerator[str, None]:
    # ── Step 1: LLM generates skeletons + drug overview ──────────────────────
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
        yield _sse("error", {"message": f"Hypothesis generation failed: {exc}"})
        return

    if not raw_hypotheses:
        yield _sse("error", {"message": "No hypotheses generated."})
        return

    # Emit drug_overview immediately so the frontend has something to show (~5-8 s in)
    drug_overview_payload = None
    if drug_overview_raw.get("summary") and (
        drug_overview_raw.get("moa_graph") or drug_overview_raw.get("mermaid_diagram")
    ):
        drug_overview_payload = drug_overview_raw

    yield _sse("drug_overview", {
        "drug_name": request.drug_name,
        "drug_overview": drug_overview_payload,
        "llm_provider": provider_gen,
        "disclaimer": _DISCLAIMER,
    })

    # ── Steps 2+3: fetch + synthesize each hypothesis independently ───────────
    # All hypotheses run concurrently; results are streamed as each finishes.
    result_queue: asyncio.Queue[tuple[str, object] | None] = asyncio.Queue()

    async def process_one(hyp: dict, h_index: int) -> None:
        # Fetch external data (PubMed + Reactome in parallel; UniProt dropped — unused)
        fetch_results = await asyncio.gather(
            pubmed_service.search_and_fetch(hyp.get("pubmed_search_queries", []), max_per_query=2),
            reactome_service.fetch_pathways(hyp.get("reactome_search_terms", [])),
            return_exceptions=True,
        )
        pubmed_data = fetch_results[0] if isinstance(fetch_results[0], list) else []
        reactome_data = fetch_results[1] if isinstance(fetch_results[1], list) else []

        if not isinstance(fetch_results[0], list):
            logger.warning("PubMed fetch failed for hypothesis %d: %s", h_index, fetch_results[0])

        # Synthesize this single hypothesis
        try:
            synthesis, provider_syn = await gemini_service.synthesize_one(
                hypothesis={"mechanism": hyp["mechanism"], "pubmed_data": pubmed_data, "pathway_data": reactome_data},
                drug_name=request.drug_name,
                target=request.target,
                context=request.context,
            )
        except Exception as exc:
            logger.warning("Synthesis failed for hypothesis %d: %s", h_index, exc)
            return

        # Build Hypothesis object
        supporting_pmids = {str(p) for p in synthesis.get("supporting_pmids", [])}
        matched = [p for p in pubmed_data if p["pmid"] in supporting_pmids]
        abstracts_to_show = matched if matched else pubmed_data

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
            for pw in reactome_data
        ]
        experiments: list[SuggestedExperiment] = []
        for exp in synthesis.get("suggested_experiments", []):
            try:
                experiments.append(SuggestedExperiment(**exp))
            except Exception:
                logger.warning("Skipping malformed experiment: %s", exp)

        h = Hypothesis(
            id=h_index + 1,  # stable rank from initial hypothesis generation order
            mechanism=hyp["mechanism"],
            confidence_score=synthesis.get("confidence_score", 5),
            reasoning=synthesis.get("reasoning", ""),
            pubmed_abstracts=abstracts,
            reactome_pathways=pathways,
            suggested_experiments=experiments,
        )
        await result_queue.put(("hypothesis", h.model_dump(), provider_syn))

    async def run_all() -> None:
        try:
            await asyncio.gather(
                *[process_one(h, i) for i, h in enumerate(raw_hypotheses)],
                return_exceptions=True,
            )
        finally:
            await result_queue.put(None)  # sentinel — always sent even on error

    asyncio.create_task(run_all())

    providers: set[str] = {provider_gen}
    while True:
        item = await result_queue.get()
        if item is None:
            break
        event_type, data, provider_syn = item
        providers.add(provider_syn)
        yield _sse(event_type, data)

    yield _sse("done", {"llm_provider": " + ".join(sorted(providers))})


async def _demo_stream() -> AsyncGenerator[str, None]:
    data = DEMO_RESPONSE
    yield _sse("drug_overview", {
        "drug_name": data.drug_name,
        "drug_overview": data.drug_overview.model_dump() if data.drug_overview else None,
        "llm_provider": data.llm_provider,
        "disclaimer": data.disclaimer,
    })
    for h in data.hypotheses:
        yield _sse("hypothesis", h.model_dump())
    yield _sse("done", {"llm_provider": data.llm_provider})


@router.post("/hypotheses")
async def generate_hypotheses(request: HypothesisRequest) -> StreamingResponse:
    if settings.demo_mode:
        logger.info("Demo mode — returning hardcoded response via SSE")
        stream = _demo_stream()
    else:
        stream = _hypothesis_stream(request)

    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
