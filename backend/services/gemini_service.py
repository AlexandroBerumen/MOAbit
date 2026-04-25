import asyncio
import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

from groq import AsyncGroq
from google import genai
from google.genai import types

from core.config import settings
from core.rate_limiter import gemini_limiter

# Lazy clients — never instantiated in demo mode
_groq_client: AsyncGroq | None = None
_gemini_client: genai.Client | None = None


def _get_groq() -> AsyncGroq:
    global _groq_client
    if _groq_client is None:
        _groq_client = AsyncGroq(api_key=settings.groq_api_key)
    return _groq_client


def _get_gemini() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=settings.gemini_api_key)
    return _gemini_client


_GEMINI_CONFIG = types.GenerateContentConfig(
    temperature=0.3,
    max_output_tokens=8192,
    response_mime_type="application/json",
)

_HYPOTHESIS_SYSTEM = (
    "You are an expert in mechanisms of action (MOA) across all therapeutic modalities: "
    "small molecules, biologics (antibodies, cytokines, fusion proteins), gene therapies "
    "(AAV vectors, lentiviral vectors, mRNA), cell therapies (CAR-T, stem cells), "
    "oligonucleotides (ASO, siRNA), and clinical-stage investigational agents. "
    "You generate testable mechanistic hypotheses grounded in known molecular and cell biology. "
    "You never fabricate literature — instead you describe mechanisms expressible as "
    "real PubMed search queries. Respond ONLY with valid JSON. No markdown, no prose outside JSON."
)

_SYNTHESIS_SYSTEM = (
    "You are a critical scientific reviewer evaluating mechanistic hypotheses against "
    "retrieved experimental evidence. You cover all therapeutic modalities including small "
    "molecules, gene therapy vectors (AAV, lentiviral), biologics, cell therapies, and "
    "clinical-stage agents. You design rigorous experiments that prioritize functional rescue "
    "over descriptive assays, and quantitative over qualitative readouts. "
    "Respond ONLY with valid JSON. No markdown, no prose outside JSON."
)

TIER_ORDER = {"functional_rescue": 0, "reproducibility": 1, "mechanistic": 2}


def _build_hypothesis_prompt(
    drug_name: str,
    target: Optional[str],
    context: Optional[str],
    observations: Optional[str],
    background: Optional[str],
) -> str:
    target_line = f"Known or suspected target: {target}" if target else "Target: unknown"
    context_line = f"Experimental context: {context}" if context else ""
    obs_line = f"Observed phenotype / assay result: {observations}" if observations else ""
    extra = "\n".join(filter(None, [context_line, obs_line]))

    background_block = (
        f"\nSCIENTIST-PROVIDED BACKGROUND (treat as high-confidence prior knowledge):\n{background}\n"
        if background else ""
    )

    return f"""Therapeutic agent: {drug_name}
{target_line}
{extra}
{background_block}
This agent may be a small molecule, biologic, AAV or viral vector, mRNA therapy, cell therapy, \
oligonucleotide, or clinical-stage investigational drug. Analyze it accordingly.

Return a JSON object with two keys: "drug_overview" and "hypotheses".

"drug_overview":
  "summary": 2-4 sentences on what this agent does, its modality, target(s), and key downstream effects.
  "mermaid_diagram": a flowchart TD showing agent→target(s)→affected pathways→biological effects. Use ONLY ASCII letters, numbers, and underscores for node IDs. Put all display text inside square-bracket labels. Do not use markdown fences, parentheses-style nodes, or edge labels.

"hypotheses": array of 3-5 testable mechanistic hypotheses, ranked most-to-least plausible. Each:
  "mechanism": 2-4 sentences describing the proposed MOA appropriate to the modality (e.g. transduction, transgene expression, capsid tropism for AAV; receptor binding and internalization for biologics; target engagement for small molecules).
  "pubmed_search_queries": 3 MeSH-style queries a scientist would actually run.
  "uniprot_gene_symbols": valid HGNC symbols for human proteins involved.
  "reactome_search_terms": known human Reactome pathway names.

Return ONLY the JSON object."""


def _build_synthesis_prompt(
    hypotheses: list[dict],  # each: {"mechanism", "pubmed_data", "pathway_data"}
    drug_name: str,
    target: Optional[str],
    context: Optional[str],
    background: Optional[str],
) -> str:
    target_line = target or "unknown"
    context_line = context or "not specified"

    background_block = (
        f"\nSCIENTIST-PROVIDED BACKGROUND (high-confidence prior knowledge — weight above retrieved evidence):\n{background}\n"
        if background else ""
    )

    hyp_blocks = []
    for i, h in enumerate(hypotheses):
        pubmed_block = "\n\n".join(
            f"  PMID {p['pmid']}: {p['title']}\n  {p['abstract'][:250]}"
            for p in h["pubmed_data"]
        ) or "  No PubMed abstracts retrieved."

        pathway_block = "\n".join(
            f"  - {pw['name']}" for pw in h["pathway_data"]
        ) or "  No Reactome data."

        hyp_blocks.append(
            f"HYPOTHESIS {i + 1}:\n{h['mechanism']}\n\n"
            f"Retrieved PubMed evidence:\n{pubmed_block}\n\n"
            f"Retrieved Reactome pathways:\n{pathway_block}"
        )

    hypotheses_block = "\n\n---\n\n".join(hyp_blocks)

    return f"""Evaluate each mechanistic hypothesis below using its retrieved evidence.

Drug: {drug_name}
Target: {target_line}
Context: {context_line}
{background_block}
Confidence scale:
1-3 = speculative, minimal or conflicting evidence
4-6 = plausible, partial evidence
7-9 = well-supported, multiple independent lines of evidence
10 = mechanistically proven

For each hypothesis design exactly 4 experiments in this order:
1. functional_rescue — manipulate the proposed target to rescue or replicate the phenotype
2. reproducibility — orthogonal assay or independent method
3. mechanistic — deeper molecular characterization
4. mechanistic — second mechanistic layer

Experiment design rules:
- Prefer quantitative assays; specify the unit (IC50 in µM, fold-change, MFI, % rescue)
- Be specific about cell lines (not "cancer cells" — use "HEK293T", "K562", etc.)
- Each experiment needs a positive AND a negative control
- State the replicate plan

---

{hypotheses_block}

---

Return ONLY a JSON array with {len(hypotheses)} objects, one per hypothesis, in the same order:
[
  {{
    "confidence_score": <integer 1-10>,
    "reasoning": "<2-3 sentences citing specific findings from the evidence above>",
    "supporting_pmids": ["<only PMID strings present in the evidence above>"],
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
  }}
]"""


async def _call_gemini(system: str, prompt: str) -> str:
    def _sync() -> str:
        response = _get_gemini().models.generate_content(
            model="gemini-2.5-flash",
            contents=[system, prompt],
            config=_GEMINI_CONFIG,
        )
        return response.text

    return await asyncio.to_thread(_sync)


_GROQ_MODELS = [
    "llama-3.3-70b-versatile",                    # best quality
    "qwen/qwen3-32b",                              # strong reasoning, independent quota
    "meta-llama/llama-4-scout-17b-16e-instruct",  # Llama 4, good balance
    "llama-3.1-8b-instant",                        # last resort
]


async def _call_groq(system: str, prompt: str) -> str:
    last_exc: Exception | None = None
    for model in _GROQ_MODELS:
        try:
            response = await _get_groq().chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=8192,
                response_format={"type": "json_object"},
            )
            if model != _GROQ_MODELS[0]:
                logger.info("Using Groq fallback model: %s", model)
            return response.choices[0].message.content
        except Exception as exc:
            err = str(exc)
            if "rate_limit_exceeded" in err or "429" in err or "413" in err or "decommissioned" in err:
                logger.warning("Groq model %s quota/size error, trying next: %s", model, exc)
                last_exc = exc
                continue
            # Some models don't support response_format — retry without it
            if "response_format" in err or "json_object" in err:
                logger.warning("Groq model %s doesn't support json_object, retrying without: %s", model, exc)
                try:
                    response = await _get_groq().chat.completions.create(
                        model=model,
                        messages=[
                            {"role": "system", "content": system},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.3,
                        max_tokens=8192,
                    )
                    return response.choices[0].message.content
                except Exception as exc2:
                    last_exc = exc2
                    continue
            raise
    raise last_exc or RuntimeError("All Groq models exhausted")


async def _call_llm(system: str, prompt: str) -> tuple[str, str]:
    """Try Gemini first; fall back to Groq on any error. Returns (text, provider)."""
    await gemini_limiter.acquire()

    gemini_available = bool(settings.gemini_api_key and settings.gemini_api_key != "demo")
    groq_available = bool(settings.groq_api_key)

    if gemini_available:
        try:
            text = await _call_gemini(system, prompt)
            return text, "gemini"
        except Exception as exc:
            logger.warning("Gemini unavailable (%s), falling back to Groq", exc)

    if groq_available:
        text = await _call_groq(system, prompt)
        return text, "groq"

    raise RuntimeError("No LLM provider available — set GEMINI_API_KEY or GROQ_API_KEY")


def _fix_string_literals(text: str) -> str:
    """Escape literal control chars (newline, tab, CR) inside JSON string values."""
    result: list[str] = []
    in_string = False
    escape_next = False
    for ch in text:
        if escape_next:
            escape_next = False
            result.append(ch)
            continue
        if ch == "\\" and in_string:
            escape_next = True
            result.append(ch)
            continue
        if ch == '"':
            in_string = not in_string
            result.append(ch)
            continue
        if in_string:
            if ch == "\n":
                result.append("\\n")
                continue
            if ch == "\r":
                result.append("\\r")
                continue
            if ch == "\t":
                result.append("\\t")
                continue
        result.append(ch)
    return "".join(result)


def _extract_outermost_json(text: str) -> str:
    """Scan for the outermost { } or [ ] block, handling nesting and strings."""
    for open_c, close_c in [('{', '}'), ('[', ']')]:
        start = text.find(open_c)
        if start == -1:
            continue
        depth = 0
        in_string = False
        escape = False
        for i, c in enumerate(text[start:], start):
            if escape:
                escape = False
                continue
            if c == '\\' and in_string:
                escape = True
                continue
            if c == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if c == open_c:
                depth += 1
            elif c == close_c:
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
    return text


def _parse_json(text: str) -> object:
    # Strip Qwen3 thinking blocks and markdown fences
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    # Pass 1: direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Pass 2: escape literal control chars that LLMs embed in strings (e.g. raw newlines in mermaid diagrams)
    fixed = _fix_string_literals(cleaned)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Pass 3: extract outermost { } or [ ] and retry
    extracted = _extract_outermost_json(fixed)
    try:
        return json.loads(extracted)
    except json.JSONDecodeError as exc:
        logger.error("JSON parse failed after all passes. Raw (first 500): %s", cleaned[:500])
        raise exc


async def generate_hypotheses(
    drug_name: str,
    target: Optional[str],
    context: Optional[str],
    observations: Optional[str],
    background: Optional[str],
) -> tuple[list[dict], dict, str]:
    """Returns (hypotheses, drug_overview, provider)."""
    prompt = _build_hypothesis_prompt(drug_name, target, context, observations, background)
    text, provider = await _call_llm(_HYPOTHESIS_SYSTEM, prompt)
    result = _parse_json(text)
    if not isinstance(result, dict):
        raise ValueError(f"LLM returned unexpected shape for hypothesis generation: {text[:200]}")
    hypotheses = result.get("hypotheses", [])
    drug_overview = result.get("drug_overview", {})
    if not isinstance(hypotheses, list):
        raise ValueError(f"LLM returned non-list for hypotheses field: {text[:200]}")
    return hypotheses, drug_overview, provider


_PROTOCOL_SYSTEM = (
    "You are a senior cell biologist writing detailed experimental protocols. "
    "Your protocols are precise, reproducible, and written for a trained researcher. "
    "Include exact concentrations, incubation times, instrument settings, and data analysis steps. "
    "Respond ONLY with valid JSON. No markdown, no prose outside JSON."
)


def _build_protocol_prompt(
    drug_name: str,
    mechanism: str,
    experiment: dict,
    observations: str = "",
    prior_literature: str = "",
) -> str:
    exp_str = "\n".join(f"  {k}: {v}" for k, v in experiment.items())

    context_block = ""
    if observations.strip() or prior_literature.strip():
        parts = []
        if observations.strip():
            parts.append(f"Scientist's existing observations:\n{observations.strip()}")
        if prior_literature.strip():
            parts.append(f"Background & prior literature:\n{prior_literature.strip()}")
        context_block = (
            "\n\n" + "\n\n".join(parts) +
            "\n\nUse the above to inform concentrations, timepoints, and expected results. "
            "If observations suggest resistance or an unexpected phenotype, address it in troubleshooting."
        )

    return f"""Write a detailed experimental protocol for the following assay.

Therapeutic agent (small molecule, biologic, AAV vector, mRNA, cell therapy, or other): {drug_name}
Hypothesis mechanism: {mechanism}

Experiment details:
{exp_str}{context_block}

Return a single JSON object with EXACTLY this structure:
{{
  "title": "Short descriptive protocol title",
  "overview": "2-3 sentence summary of what this experiment measures and why",
  "duration": "Total estimated time (e.g. '3 days', '6 hours')",
  "materials": [
    "Reagent or equipment — include catalog number or specification where relevant"
  ],
  "steps": [
    {{
      "step_number": 1,
      "title": "Brief step title",
      "description": "Detailed instructions including volumes, concentrations, times, temperatures, instrument settings"
    }}
  ],
  "expected_results": "What a positive result looks like; quantitative thresholds if applicable",
  "troubleshooting": [
    "Common failure mode and how to fix it"
  ],
  "safety_notes": "Relevant biosafety level, hazardous reagents, or PPE requirements"
}}

Rules:
- steps should be granular enough that a trained researcher can follow without guessing
- Include specific concentrations (e.g. '10 µM', not 'appropriate concentration')
- Reference the controls and replicates specified in the experiment details
- Return ONLY the JSON object"""


async def generate_protocol(
    drug_name: str,
    mechanism: str,
    experiment: dict,
    observations: str = "",
    prior_literature: str = "",
) -> tuple[dict, str]:
    prompt = _build_protocol_prompt(drug_name, mechanism, experiment, observations, prior_literature)
    text, provider = await _call_llm(_PROTOCOL_SYSTEM, prompt)
    result = _parse_json(text)
    if not isinstance(result, dict):
        raise ValueError(f"LLM returned non-dict for protocol: {text[:200]}")
    return result, provider


async def synthesize_all(
    hypotheses: list[dict],  # each: {"mechanism", "pubmed_data", "pathway_data"}
    drug_name: str,
    target: Optional[str],
    context: Optional[str],
    background: Optional[str],
) -> tuple[list[dict], str]:
    """Score all hypotheses in a single LLM call instead of one call per hypothesis."""
    prompt = _build_synthesis_prompt(hypotheses, drug_name, target, context, background)
    text, provider = await _call_llm(_SYNTHESIS_SYSTEM, prompt)
    result = _parse_json(text)
    if not isinstance(result, list):
        raise ValueError(f"LLM returned non-list for batch synthesis: {text[:200]}")

    for item in result:
        if "suggested_experiments" in item:
            item["suggested_experiments"].sort(
                key=lambda e: TIER_ORDER.get(e.get("tier", "mechanistic"), 2)
            )

    return result, provider


def _build_synthesize_one_prompt(
    hypothesis: dict,
    drug_name: str,
    target: Optional[str],
    context: Optional[str],
) -> str:
    target_line = target or "unknown"
    context_line = context or "not specified"

    pubmed_block = "\n\n".join(
        f"  PMID {p['pmid']}: {p['title']}\n  {p['abstract'][:250]}"
        for p in hypothesis["pubmed_data"]
    ) or "  No PubMed abstracts retrieved."

    pathway_block = "\n".join(
        f"  - {pw['name']}" for pw in hypothesis["pathway_data"]
    ) or "  No Reactome data."

    return f"""Evaluate the following mechanistic hypothesis against retrieved evidence.

Drug: {drug_name}
Target: {target_line}
Context: {context_line}

HYPOTHESIS:
{hypothesis['mechanism']}

Retrieved PubMed evidence:
{pubmed_block}

Retrieved Reactome pathways:
{pathway_block}

Confidence scale:
1-3 = speculative  4-6 = plausible  7-9 = well-supported  10 = mechanistically proven

Design exactly 4 experiments in this order:
1. functional_rescue — manipulate the target to rescue or replicate the phenotype
2. reproducibility — orthogonal assay or independent method
3. mechanistic — deeper molecular characterization
4. mechanistic — second mechanistic layer

Rules:
- Prefer quantitative assays with units; specific cell lines; positive AND negative controls; replicate plan

Return ONLY a JSON object:
{{
  "confidence_score": <integer 1-10>,
  "reasoning": "<2-3 sentences citing specific findings from the evidence above>",
  "supporting_pmids": ["<only PMID strings present in the evidence above>"],
  "suggested_experiments": [
    {{
      "tier": "<functional_rescue | reproducibility | mechanistic>",
      "measurement_type": "<quantitative | qualitative>",
      "assay_type": "<specific assay name>",
      "primary_endpoint": "<exact metric with units>",
      "cell_line": "<specific cell line or primary cell type>",
      "controls": ["<positive control>", "<negative control>"],
      "replicates": "<e.g. n=3 biological replicates, 3 technical each>",
      "rationale": "<one sentence linking experiment to hypothesis>"
    }}
  ]
}}"""


async def synthesize_one(
    hypothesis: dict,
    drug_name: str,
    target: Optional[str],
    context: Optional[str],
) -> tuple[dict, str]:
    """Score and design experiments for a single hypothesis."""
    prompt = _build_synthesize_one_prompt(hypothesis, drug_name, target, context)
    text, provider = await _call_llm(_SYNTHESIS_SYSTEM, prompt)
    result = _parse_json(text)
    if not isinstance(result, dict):
        raise ValueError(f"LLM returned non-dict for synthesis: {text[:200]}")
    if "suggested_experiments" in result:
        result["suggested_experiments"].sort(
            key=lambda e: TIER_ORDER.get(e.get("tier", "mechanistic"), 2)
        )
    return result, provider
