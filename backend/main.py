import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from routers.hypotheses import router as hypotheses_router

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="MOAbit API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)

if settings.demo_mode:
    logging.getLogger(__name__).warning("DEMO MODE — no Gemini API key. Using hardcoded responses.")

app.include_router(hypotheses_router, prefix="/api")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
