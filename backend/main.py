import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.database import Base, engine
from routers.auth import router as auth_router
from routers.hypotheses import router as hypotheses_router
from routers.protocol import router as protocol_router
from routers.saved import router as saved_router

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="MOAbit API", version="0.1.0")

_dev_origins = [
    settings.frontend_origin,
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_dev_origins,
    allow_methods=["POST", "GET", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

if settings.demo_mode:
    logging.getLogger(__name__).warning("DEMO MODE — no API key. Using hardcoded responses.")

app.include_router(hypotheses_router, prefix="/api")
app.include_router(protocol_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(saved_router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    import models.db_models  # noqa: F401 — registers ORM models with Base
    Base.metadata.create_all(bind=engine)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
