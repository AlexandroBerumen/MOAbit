import asyncio

import httpx

UNIPROT_URL = "https://rest.uniprot.org/uniprotkb/search"


async def fetch_protein_data(gene_symbols: list[str]) -> list[dict]:
    """Fetch reviewed human UniProt entries for up to 3 gene symbols."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        tasks = [_fetch_one(client, sym) for sym in gene_symbols[:3]]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, dict) and r]


async def _fetch_one(client: httpx.AsyncClient, gene_symbol: str) -> dict:
    params = {
        "query": f"gene_exact:{gene_symbol} AND organism_id:9606 AND reviewed:true",
        "fields": "gene_names,protein_name,cc_function",
        "format": "json",
        "size": 1,
    }
    r = await client.get(UNIPROT_URL, params=params)
    r.raise_for_status()
    data = r.json()

    if not data.get("results"):
        return {}

    entry = data["results"][0]
    protein_name = (
        entry.get("proteinDescription", {})
        .get("recommendedName", {})
        .get("fullName", {})
        .get("value", "Unknown protein")
    )
    function_comments = entry.get("comments", [])
    function_text = next(
        (
            c.get("texts", [{}])[0].get("value", "")
            for c in function_comments
            if c.get("commentType") == "FUNCTION"
        ),
        "",
    )

    return {
        "gene": gene_symbol,
        "protein_name": protein_name,
        "function": function_text[:800],
    }
