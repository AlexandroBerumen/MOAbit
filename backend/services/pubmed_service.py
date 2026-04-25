import asyncio
import xml.etree.ElementTree as ET

import httpx

from core.config import settings

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

# 3 req/s without API key, 10 req/s with one (NCBI policy).
_pubmed_sem: asyncio.Semaphore | None = None


def _sem() -> asyncio.Semaphore:
    global _pubmed_sem
    if _pubmed_sem is None:
        limit = 8 if settings.ncbi_api_key else 3
        _pubmed_sem = asyncio.Semaphore(limit)
    return _pubmed_sem


def _add_key(params: dict) -> dict:
    if settings.ncbi_api_key:
        params = {**params, "api_key": settings.ncbi_api_key}
    return params


async def search_and_fetch(queries: list[str], max_per_query: int = 2) -> list[dict]:
    """ESearch each query for PMIDs, then EFetch all abstracts in one request."""
    async with httpx.AsyncClient(timeout=20.0) as client:
        search_tasks = [_esearch(client, q, max_per_query) for q in queries]
        results = await asyncio.gather(*search_tasks, return_exceptions=True)

        all_pmids: list[str] = list({
            pmid
            for result in results
            if isinstance(result, list)
            for pmid in result
        })

        if not all_pmids:
            return []

        return await _efetch(client, all_pmids)


async def _esearch(client: httpx.AsyncClient, query: str, retmax: int) -> list[str]:
    async with _sem():
        params = _add_key({"db": "pubmed", "term": query, "retmax": retmax, "retmode": "json"})
        r = await _get_with_retry(client, ESEARCH_URL, params)
        return r.json()["esearchresult"]["idlist"]


async def _efetch(client: httpx.AsyncClient, pmids: list[str]) -> list[dict]:
    async with _sem():
        params = _add_key({
            "db": "pubmed",
            "id": ",".join(pmids),
            "rettype": "xml",
            "retmode": "xml",
        })
        r = await _get_with_retry(client, EFETCH_URL, params)
        return _parse_xml(r.text)


async def _get_with_retry(
    client: httpx.AsyncClient,
    url: str,
    params: dict,
    max_retries: int = 3,
) -> httpx.Response:
    for attempt in range(max_retries):
        r = await client.get(url, params=params)
        if r.status_code == 429:
            await asyncio.sleep(2 ** attempt)
            continue
        r.raise_for_status()
        return r
    r.raise_for_status()
    return r


def _parse_xml(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    results = []
    for article in root.findall(".//PubmedArticle"):
        pmid_el = article.find(".//PMID")
        title_el = article.find(".//ArticleTitle")
        abstract_els = article.findall(".//AbstractText")

        if pmid_el is None:
            continue

        abstract = " ".join(
            (el.text or "") for el in abstract_els if el.text
        ).strip() or "No abstract available."

        results.append({
            "pmid": pmid_el.text,
            "title": title_el.text if title_el is not None else "No title",
            "abstract": abstract,
        })
    return results
