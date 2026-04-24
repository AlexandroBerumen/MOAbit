# MOAbit

A mechanism-of-action (MOA) hypothesis generator for characterizing drug function. Input a compound and optionally a target, experimental context, and observed phenotype — get back ranked mechanistic hypotheses with supporting literature, pathway context, and a prioritized experiment plan.

## What it does

For each query, MOAbit:

1. Uses **Gemini 2.5 Flash** to generate 3–5 testable MOA hypotheses
2. Fetches real evidence in parallel from **PubMed**, **UniProt**, and **Reactome**
3. Has Gemini score each hypothesis against the retrieved evidence (1–10 confidence)
4. Returns ranked hypotheses with cited PMIDs, pathway links, and suggested experiments

Experiments are ordered by priority: **functional rescue first**, then reproducibility, then deeper mechanistic characterization. Quantitative readouts (IC50, fold-change, MFI) are preferred over qualitative ones.

Citations are never hallucinated — Gemini only cites PMIDs that were fetched from PubMed and passed into its context.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript (Vite) |
| Backend | FastAPI (Python 3.12) |
| LLM | Google Gemini 2.5 Flash |
| Literature | PubMed E-utilities (ESearch + EFetch) |
| Protein data | UniProt REST API |
| Pathway data | Reactome Content Service |

All external APIs are free with no authentication required except Gemini (free tier API key).

## Project structure

```
MOAbit/
├── backend/
│   ├── main.py                   # FastAPI app
│   ├── core/
│   │   ├── config.py             # Settings (reads .env)
│   │   └── rate_limiter.py       # Token bucket for Gemini RPM limit
│   ├── models/
│   │   └── schemas.py            # Pydantic v2 request/response models
│   ├── routers/
│   │   └── hypotheses.py         # POST /api/hypotheses endpoint
│   └── services/
│       ├── gemini_service.py     # Hypothesis generation + evidence synthesis
│       ├── pubmed_service.py     # ESearch + EFetch
│       ├── uniprot_service.py    # UniProt REST
│       ├── reactome_service.py   # Reactome pathway search
│       └── demo_data.py          # Hardcoded response for demo mode
└── frontend/
    └── src/
        ├── App.tsx
        ├── hooks/useHypotheses.ts
        ├── api/client.ts
        ├── types/index.ts
        └── components/
            ├── InputForm.tsx
            ├── HypothesisCard.tsx
            ├── HypothesisList.tsx
            ├── ConfidenceBadge.tsx
            ├── EvidenceSection.tsx
            ├── ExperimentList.tsx
            └── StatusBanner.tsx
```

## Setup

### 1. Get a Gemini API key

Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) → **Create API key in new project**.

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your_key_here
```

If no key is provided, the app runs in **demo mode** with hardcoded imatinib/BCR-ABL1 example data so you can explore the UI immediately.

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## How it works

### Anti-hallucination architecture

The two-stage Gemini design prevents fabricated citations:

- **Stage 1** — Gemini generates *search strategies* (PubMed queries, UniProt gene symbols, Reactome terms), not citations
- **Stage 2** — The backend fetches real records from each API, then passes the actual abstracts and pathway names to Gemini for scoring
- Gemini is instructed: *"supporting_pmids MUST only contain PMIDs from the evidence provided above"*

Because Gemini never sees PMIDs until they come from a real API call, it cannot invent them.

### Parallel fetching

For each hypothesis, PubMed, UniProt, and Reactome are queried concurrently using `asyncio.gather`. Multiple hypotheses are also enriched concurrently. `return_exceptions=True` ensures a single API timeout doesn't discard all results.

### Experiment priority

The `SuggestedExperiment` schema includes a `tier` field (`functional_rescue` | `reproducibility` | `mechanistic`). Gemini is explicitly instructed to generate functional rescue experiments first. The Pydantic model enforces this as a typed enum so the frontend and any downstream consumers always receive structured, sortable data.

## Disclaimer

MOAbit generates AI-assisted hypotheses for research purposes only. Outputs have not undergone regulatory review and must not be used as the sole basis for clinical or regulatory decisions.

For internal biotech deployment, note that compound names submitted to MOAbit are processed by the Gemini API (Google infrastructure). Do not submit NDA-stage or proprietary compound identifiers without IP counsel review.
