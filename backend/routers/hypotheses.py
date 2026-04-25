import asyncio
import json
import logging
import re
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

_GENERIC_EXPERIMENT_TOKENS = {
    "assay",
    "analysis",
    "cells",
    "cell",
    "treated",
    "treatment",
    "control",
    "controls",
    "using",
    "response",
    "effect",
    "effects",
    "protein",
    "signaling",
    "pathway",
    "vehicle",
    "study",
    "studies",
    "human",
    "primary",
    "model",
    "models",
    "expression",
    "activity",
    "biological",
    "technical",
    "replicates",
}

_METHOD_SYNONYMS: dict[str, tuple[str, ...]] = {
    "celltiter_glo": ("celltiter-glo", "celltiter glo", "cell titer glo"),
    "viability": ("cell viability", "viability assay", "viability", "cytotoxicity"),
    "flow_cytometry": ("flow cytometry", "flow-cytometric", "facs", "cytometry"),
    "annexin_v": ("annexin v", "annexin-v", "apoptosis assay"),
    "western_blot": ("western blot", "immunoblot", "blot analysis"),
    "densitometry": ("densitometry", "band intensity"),
    "cetsa": ("cellular thermal shift assay", "cetsa", "thermal shift assay"),
    "crispr": ("crispr", "sgrna", "knockout", "knock-out", "gene editing"),
    "kinomescan": ("kinomescan", "kinase panel", "kinome profiling"),
    "nanobret": ("nanobret", "target engagement"),
    "dose_response": ("dose-response", "dose response", "ic50", "ec50"),
    "phosphorylation": ("phosphorylation", "phospho", "phosphorylated"),
    "qpcr": ("qpcr", "quantitative pcr", "rt-pcr", "rt qpcr"),
    "elisa": ("elisa", "enzyme-linked immunosorbent assay"),
    "immunofluorescence": ("immunofluorescence", "if staining", "confocal microscopy"),
}


def _tokenize_experiment_text(text: str) -> list[str]:
    return [
        token
        for token in re.sub(r"[^a-z0-9\s-]", " ", text.lower()).split()
        if len(token) >= 4 and token not in _GENERIC_EXPERIMENT_TOKENS
    ]


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s-]", " ", text.lower())).strip()


def _method_groups_for_experiment(exp: dict) -> list[tuple[str, ...]]:
    assay_and_endpoint = _normalize_text(" ".join([
        exp.get("assay_type", ""),
        exp.get("primary_endpoint", ""),
    ]))
    groups: list[tuple[str, ...]] = []

    for key, synonyms in _METHOD_SYNONYMS.items():
        trigger = key.replace("_", " ")
        if trigger in assay_and_endpoint or any(term in assay_and_endpoint for term in synonyms):
            groups.append(synonyms)

    assay_tokens = [
        token for token in _tokenize_experiment_text(exp.get("assay_type", ""))
        if token not in {"quantitative", "qualitative"}
    ]
    if assay_tokens:
        groups.append(tuple(sorted(set(assay_tokens))))

    return groups


def _cell_line_tokens(exp: dict) -> list[str]:
    return [
        token
        for token in _tokenize_experiment_text(exp.get("cell_line", ""))
        if token not in {"derived", "stimulation", "parental", "endogenous", "expression", "confirmed"}
    ]


def _publication_supports_experiment(exp: dict, publication: dict) -> tuple[bool, int]:
    publication_text = _normalize_text(
        f"{publication.get('title', '')} {publication.get('abstract', '')}"
    )
    method_groups = _method_groups_for_experiment(exp)
    matched_method_groups = sum(
        1 for group in method_groups if any(term in publication_text for term in group)
    )

    if matched_method_groups == 0:
        return False, 0

    endpoint_overlap = sum(
        1 for token in _tokenize_experiment_text(exp.get("primary_endpoint", ""))
        if token in publication_text
    )
    rationale_overlap = sum(
        1 for token in _tokenize_experiment_text(exp.get("rationale", ""))
        if token in publication_text
    )
    control_overlap = sum(
        1 for token in _tokenize_experiment_text(" ".join(exp.get("controls", [])))
        if token in publication_text
    )
    cell_match = any(token in publication_text for token in _cell_line_tokens(exp))

    if not cell_match and (endpoint_overlap + rationale_overlap + control_overlap) < 2:
        return False, 0

    score = (
        matched_method_groups * 4
        + endpoint_overlap * 2
        + rationale_overlap
        + control_overlap
        + (2 if cell_match else 0)
    )
    return True, score


def _validated_experiment_pmids(experiments: list[dict], pubmed_data: list[dict]) -> list[dict]:
    by_pmid = {str(publication["pmid"]): publication for publication in pubmed_data}
    used_pmids: set[str] = set()
    validated: list[dict] = []

    for exp in experiments:
        raw_pmids = [str(pmid) for pmid in exp.get("supporting_pmids", [])]
        ranked_matches: list[tuple[int, str]] = []

        for pmid in raw_pmids:
            publication = by_pmid.get(pmid)
            if publication is None:
                continue
            supports_experiment, score = _publication_supports_experiment(exp, publication)
            if supports_experiment:
                ranked_matches.append((score, pmid))

        ranked_matches.sort(key=lambda item: (-item[0], item[1]))

        unique_pmids: list[str] = []
        for _, pmid in ranked_matches:
            if pmid in used_pmids:
                continue
            unique_pmids.append(pmid)
            used_pmids.add(pmid)
            if len(unique_pmids) == 2:
                break

        validated.append({**exp, "supporting_pmids": unique_pmids})

    return validated


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
        validated_experiments = _validated_experiment_pmids(
            synthesis.get("suggested_experiments", []),
            pubmed_data,
        )
        for exp in validated_experiments:
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
