import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.auth import get_current_user
from core.database import get_db
from models.db_models import SavedHypothesis, User
from models.schemas import Hypothesis, PatchNotesRequest, SavedHypothesisResponse, SaveRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/saved", tags=["saved"])


def _to_response(row: SavedHypothesis) -> SavedHypothesisResponse:
    return SavedHypothesisResponse(
        id=row.id,
        drug_name=row.drug_name,
        hypothesis=Hypothesis.model_validate_json(row.hypothesis_json),
        notes=row.notes,
        created_at=row.created_at,
    )


@router.post("", response_model=SavedHypothesisResponse, status_code=201)
def save_hypothesis(
    req: SaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedHypothesisResponse:
    row = SavedHypothesis(
        user_id=current_user.id,
        drug_name=req.drug_name,
        hypothesis_json=req.hypothesis.model_dump_json(),
        notes="",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.get("", response_model=list[SavedHypothesisResponse])
def list_saved(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SavedHypothesisResponse]:
    rows = (
        db.query(SavedHypothesis)
        .filter(SavedHypothesis.user_id == current_user.id)
        .order_by(SavedHypothesis.created_at.desc())
        .all()
    )
    return [_to_response(r) for r in rows]


@router.patch("/{saved_id}", response_model=SavedHypothesisResponse)
def update_notes(
    saved_id: int,
    req: PatchNotesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SavedHypothesisResponse:
    row = db.get(SavedHypothesis, saved_id)
    if row is None or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")
    row.notes = req.notes
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.delete("/{saved_id}", status_code=204)
def delete_saved(
    saved_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    row = db.get(SavedHypothesis, saved_id)
    if row is None or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
