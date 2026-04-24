import asyncio

import httpx

REACTOME_SEARCH_URL = "https://reactome.org/ContentService/search/query"


async def fetch_pathways(search_terms: list[str]) -> list[dict]:
    """Search Reactome for human pathways matching the given terms."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        tasks = [_search_one(client, term) for term in search_terms]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    pathways: list[dict] = []
    for r in results:
        if isinstance(r, list):
            pathways.extend(r)

    seen: set[str] = set()
    unique: list[dict] = []
    for p in pathways:
        if p["id"] not in seen:
            seen.add(p["id"])
            unique.append(p)

    return unique[:5]


async def _search_one(client: httpx.AsyncClient, term: str) -> list[dict]:
    params = {
        "query": term,
        "species": "Homo sapiens",
        "types": "Pathway",
        "cluster": "true",
    }
    r = await client.get(REACTOME_SEARCH_URL, params=params)
    if r.status_code == 404:
        return []
    r.raise_for_status()

    data = r.json()
    pathways: list[dict] = []
    for group in data.get("results", []):
        for entry in group.get("entries", [])[:2]:
            st_id = entry.get("stId", "")
            name = entry.get("name", "")
            if st_id and name:
                pathways.append({"id": st_id, "name": name})
    return pathways
