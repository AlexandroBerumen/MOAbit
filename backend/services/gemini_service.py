import asyncio
import json
import re
from typing import Optional

from google import genai
from google.genai import types

from core.config import settings
from core.rate_limiter import gemini_limiter

# Client is initialized lazily so demo mode never touches it
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


_GENERATE_CONFIG = types.GenerateContentConfig(
    temperature=0.3,
    max_output_tokens=4096,
)

_HYPOTHESIS_SYSTEM = (
    "You are a pharmacologist expert in drug mechanisms of action (MOA). "
    "You generate testable mechanistic hypotheses grounded in known molecular biology. "
    "You never fabricate literature — instead you describe mechanisms expressible as "
    "real PubMed search queries. Respond ONLY with valid JSON. No markdown, no prose outside JSON."
)

_SYNTHESIS_SYSTEM = (
    "You are a critical scientific reviewer evaluating mechanistic hypotheses against "
    "retrieved experimental evidence. You design rigorous experiments that prioritize "
    "functional rescue over descriptive assays, and quantitative over qualitative readouts. "
    "Respond ONLY with valid JSON. No markdown, no prose outside JSON."
)

TIER_ORDER = {"functional_rescue": 0, "reproducibility": 1, "mechanistic": 2}


def _build_hypothesis_prompt(
    drug_name: str,
    target: Optional[str],
    context: Optional[str],
    observations: Optional[str],
) -> str:
    target_line = f"Known or suspected target: {target}" if target else "Target: unknown"
    context_line = f"Experimental context: {context}" if context else ""
    obs_line = f"Observed phenotype / assay result: {observations}" if observations else ""
    extra = "\n".join(filter(None, [context_line, obs_line]))

    return f"""Generate 3 to 5 mechanistic hypotheses to explain how the following compound
produces its observed effects. Focus on characterizing drug function — how the compound
works mechanistically — not on drug discovery.

Drug / compound: {drug_name}
{target_line}
{extra}

Each hypothesis must be testable: it should imply a phenotype that can be rescued or
replicated by manipulating the proposed target.

Return a JSON array. Each element must have EXACTLY these fields:
[
  {{
    "mechanism": "2-4 sentence plain-language description of the proposed MOA",
    "pubmed_search_queries": ["specific query 1", "specific query 2", "specific query 3"],
    "uniprot_gene_symbols": ["GENE1", "GENE2"],
    "reactome_search_terms": ["pathway term 1", "pathway term 2"]
  }}
]

Rules:
- pubmed_search_queries must be real queries a scientist would run (MeSH-style terms preferred)
- uniprot_gene_symbols must be valid HGNC symbols for human proteins
- reactome_search_terms must match known human pathway names in Reactome
- rank hypotheses from most to least plausible
- Return ONLY the JSON array, starting with [ and ending with ]"""


def _build_synthesis_prompt(
    mechanism: str,
    drug_name: str,
    target: Optional[str],
    context: Optional[str],
    pubmed_data: list[dict],
    pathway_data: list[dict],
) -> str:
    target_line = target or "unknown"
    context_line = context or "not specified"

    pubmed_block = "\n\n".join(
        f"PMID {p['pmid']}: {p['title']}\n{p['abstract'][:600]}"
        for p in pubmed_data
    ) or "No PubMed abstracts retrieved."

    pathway_block = "\n".join(f"- {pw['name']}" for pw in pathway_data) or "No Reactome data."

    return f"""Evaluate this mechanistic hypothesis using the retrieved evidence below.

HYPOTHESIS:
{mechanism}

Drug: {drug_name}
Target: {target_line}
Context: {context_line}

RETRIEVED PUBMED EVIDENCE:
{pubmed_block}

RETRIEVED REACTOME PATHWAYS:
{pathway_block}

Confidence scale:
1-3 = speculative, minimal or conflicting evidence
4-6 = plausible, partial evidence
7-9 = well-supported, multiple independent lines of evidence
10 = mechanistically proven

Design exactly 4 experiments in this order:
1. functional_rescue — can manipulating the proposed target rescue the observed phenotype?
   Use genetic (CRISPR KO, overexpression, rescue construct) or pharmacological rescue.
2. reproducibility — an orthogonal assay or independent method to confirm the primary finding
3. mechanistic — deeper molecular characterization (e.g. binding, phosphorylation, complex)
4. mechanistic — a second mechanistic layer (e.g. downstream pathway, selectivity panel)

Experiment design rules:
- Prefer quantitative assays (specify unit: IC50 in µM, fold-change, MFI, % rescue)
- Be specific about cell lines (not "cancer cells" — use "HEK293T" or "K562" etc.)
- Each experiment needs a positive control AND a negative control
- State replicate plan (biological and technical)

Return ONLY this JSON object:
{{
  "confidence_score": <integer 1-10>,
  "reasoning": "<2-3 sentences citing specific findings from the evidence above>",
  "supporting_pmids": [<only PMIDs present in the evidence above, as strings>],
  "suggested_experiments": [
    {{
      "tier": "<functional_rescue | reproducibility | mechanistic>",
      "measurement_type": "<quantitative | qualitative>",
      "assay_type": "<specific assay name>",
      "primary_endpoint": "<exact metric with units>",
      "cell_line": "<specific cell line or primary cell type>",
      "controls": ["<positive control>", "<negative control>"],
      "replicates": "<e.g. n=3 biological replicates, 3 technical each>",
      "rationale": "<one sentence linking this experiment to the hypothesis>"
    }}
  ]
}}"""


async def _call_gemini(system: str, prompt: str) -> str:
    await gemini_limiter.acquire()

    def _sync() -> str:
        response = _get_client().models.generate_content(
            model="gemini-2.5-flash",
            contents=[system, prompt],
            config=_GENERATE_CONFIG,
        )
        return response.text

    return await asyncio.to_thread(_sync)


def _parse_json(text: str) -> object:
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


async def generate_hypotheses(
    drug_name: str,
    target: Optional[str],
    context: Optional[str],
    observations: Optional[str],
) -> list[dict]:
    prompt = _build_hypothesis_prompt(drug_name, target, context, observations)
    text = await _call_gemini(_HYPOTHESIS_SYSTEM, prompt)
    result = _parse_json(text)
    if not isinstance(result, list):
        raise ValueError(f"Gemini returned non-list for hypotheses: {text[:200]}")
    return result


async def synthesize_evidence(
    mechanism: str,
    drug_name: str,
    target: Optional[str],
    context: Optional[str],
    pubmed_data: list[dict],
    pathway_data: list[dict],
) -> dict:
    prompt = _build_synthesis_prompt(
        mechanism, drug_name, target, context, pubmed_data, pathway_data
    )
    text = await _call_gemini(_SYNTHESIS_SYSTEM, prompt)
    result = _parse_json(text)
    if not isinstance(result, dict):
        raise ValueError(f"Gemini returned non-dict for synthesis: {text[:200]}")

    if "suggested_experiments" in result:
        result["suggested_experiments"].sort(
            key=lambda e: TIER_ORDER.get(e.get("tier", "mechanistic"), 2)
        )

    return result
