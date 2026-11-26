import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import SuppressionReason
from app.models.suppression import SuppressionList

router = APIRouter(prefix="/suppression", tags=["Suppression"])


class SuppressionCreate(BaseModel):
    email: str
    reason: SuppressionReason = SuppressionReason.MANUAL
    notes: str | None = None


@router.get("")
def list_suppressed(
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = select(SuppressionList)
    if search:
        stmt = stmt.where(SuppressionList.email.ilike(f"%{search.strip()}%"))
    rows = db.scalars(stmt.order_by(SuppressionList.created_at.desc())).all()
    return [
        {
            "id": str(r.id),
            "email": r.email,
            "reason": r.reason.value,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
def add_suppressed(payload: SuppressionCreate, db: Session = Depends(get_db)) -> dict:
    normalized = payload.email.strip().lower()
    existing = db.execute(
        select(SuppressionList).where(SuppressionList.email == normalized)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email is already in suppression list.")

    item = SuppressionList(
        email=normalized,
        reason=payload.reason,
        notes=payload.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "id": str(item.id),
        "email": item.email,
        "reason": item.reason.value,
        "notes": item.notes,
    }


@router.delete("/{suppression_id}")
def remove_suppressed(suppression_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    item = db.get(SuppressionList, suppression_id)
    if not item:
        raise HTTPException(status_code=404, detail="Suppression entry not found.")
    db.delete(item)
    db.commit()
    return {"deleted": True}

