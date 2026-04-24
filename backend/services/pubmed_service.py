import asyncio
import xml.etree.ElementTree as ET

import httpx

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


async def search_and_fetch(queries: list[str], max_per_query: int = 3) -> list[dict]:
    """ESearch each query for PMIDs, then EFetch all abstracts in one request."""
    async with httpx.AsyncClient(timeout=15.0) as client:
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
    params = {"db": "pubmed", "term": query, "retmax": retmax, "retmode": "json"}
    r = await client.get(ESEARCH_URL, params=params)
    r.raise_for_status()
    return r.json()["esearchresult"]["idlist"]


async def _efetch(client: httpx.AsyncClient, pmids: list[str]) -> list[dict]:
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "rettype": "xml",
        "retmode": "xml",
    }
    r = await client.get(EFETCH_URL, params=params)
    r.raise_for_status()
    return _parse_xml(r.text)


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
