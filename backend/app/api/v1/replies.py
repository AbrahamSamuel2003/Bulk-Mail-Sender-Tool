import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.campaign import Campaign
from app.models.lead import Lead
from app.models.reply import Reply

router = APIRouter(prefix="/replies", tags=["Replies"])


@router.get("")
def list_replies(
    campaign_id: uuid.UUID | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Return all incoming lead replies ordered newest-first for manual Team Lead review."""
    stmt = (
        select(Reply, Lead, Campaign)
        .join(Lead, Reply.lead_id == Lead.id)
        .join(Campaign, Lead.campaign_id == Campaign.id)
    )
    if campaign_id:
        stmt = stmt.where(Lead.campaign_id == campaign_id)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            Lead.practice_name.ilike(pattern)
            | Reply.sender_email.ilike(pattern)
            | Reply.subject.ilike(pattern)
            | Reply.body.ilike(pattern)
        )

    rows = db.execute(stmt.order_by(Reply.received_at.desc())).all()
    return [
        {
            "id": str(reply.id),
            "lead_id": str(lead.id),
            "campaign_id": str(campaign.id),
            "campaign_name": campaign.name,
            "practice_name": lead.practice_name,
            "contact_name": lead.contact_name,
            "lead_email": lead.email,
            "lead_status": lead.status.value,
            "current_stage": lead.current_stage.value,
            "sender_email": reply.sender_email,
            "subject": reply.subject,
            "body": reply.body,
            "received_at": reply.received_at.isoformat(),
        }
        for reply, lead, campaign in rows
    ]

