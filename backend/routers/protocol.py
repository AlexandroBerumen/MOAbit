import logging

from fastapi import APIRouter, HTTPException

from models.schemas import ProtocolRequest, ProtocolResponse, Protocol
from services import gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/protocol", response_model=ProtocolResponse)
async def generate_protocol(request: ProtocolRequest) -> ProtocolResponse:
    try:
        raw, provider = await gemini_service.generate_protocol(
            drug_name=request.drug_name,
            mechanism=request.mechanism,
            experiment=request.experiment.model_dump(),
            observations=request.observations,
            prior_literature=request.prior_literature,
        )
    except Exception as exc:
        logger.error("Protocol generation failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Protocol generation failed: {exc}")

    try:
        protocol = Protocol(**raw)
    except Exception as exc:
        logger.error("Protocol schema validation failed: %s | raw: %s", exc, raw)
        raise HTTPException(status_code=502, detail="Protocol response was malformed.")

    return ProtocolResponse(protocol=protocol, llm_provider=provider)
