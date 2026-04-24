import asyncio
import xml.etree.ElementTree as ET

import httpx

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

# PubMed allows 3 req/sec without an API key, 10/sec with one.
# This semaphore caps concurrent requests to avoid 429s.
_pubmed_sem = asyncio.Semaphore(2)


async def search_and_fetch(queries: list[str], max_per_query: int = 3) -> list[dict]:
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
    async with _pubmed_sem:
        params = {"db": "pubmed", "term": query, "retmax": retmax, "retmode": "json"}
        r = await _get_with_retry(client, ESEARCH_URL, params)
        return r.json()["esearchresult"]["idlist"]


async def _efetch(client: httpx.AsyncClient, pmids: list[str]) -> list[dict]:
    async with _pubmed_sem:
        params = {
            "db": "pubmed",
            "id": ",".join(pmids),
            "rettype": "xml",
            "retmode": "xml",
        }
        r = await _get_with_retry(client, EFETCH_URL, params)
        return _parse_xml(r.text)


async def _get_with_retry(
    client: httpx.AsyncClient,
    url: str,
    params: dict,
    max_retries: int = 3,
) -> httpx.Response:
    """GET with exponential backoff on 429."""
    for attempt in range(max_retries):
        r = await client.get(url, params=params)
        if r.status_code == 429:
            wait = 2 ** attempt  # 1s, 2s, 4s
            await asyncio.sleep(wait)
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
