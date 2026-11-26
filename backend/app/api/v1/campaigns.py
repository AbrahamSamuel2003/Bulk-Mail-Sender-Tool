import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.campaign import Campaign
from app.models.email_record import EmailRecord
from app.models.enums import CampaignStatus, JobStatus, LeadStage, LeadStatus
from app.models.lead import Lead
from app.models.sending import SendingJob

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])


class CampaignCreate(BaseModel):
    name: str
    description: str | None = None
    timezone: str = "America/New_York"


@router.get("")
def list_campaigns(
    status_filter: CampaignStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = select(Campaign)
    if status_filter:
        stmt = stmt.where(Campaign.status == status_filter)
    campaigns = db.execute(stmt.order_by(Campaign.created_at.desc())).scalars().all()
    return [
        {
            "id": str(c.id),
            "name": c.name,
            "description": c.description,
            "status": c.status.value,
            "timezone": c.timezone,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in campaigns
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_campaign(payload: CampaignCreate, db: Session = Depends(get_db)) -> dict:
    campaign = Campaign(
        name=payload.name.strip(),
        description=payload.description,
        timezone=payload.timezone,
        status=CampaignStatus.ACTIVE,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return {
        "id": str(campaign.id),
        "name": campaign.name,
        "description": campaign.description,
        "status": campaign.status.value,
        "timezone": campaign.timezone,
    }


@router.get("/{campaign_id}")
def get_campaign(campaign_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    campaign = db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    stage_rows = db.execute(
        select(Lead.current_stage, func.count(Lead.id))
        .where(Lead.campaign_id == campaign_id)
        .group_by(Lead.current_stage)
    ).all()
    status_rows = db.execute(
        select(Lead.status, func.count(Lead.id))
        .where(Lead.campaign_id == campaign_id)
        .group_by(Lead.status)
    ).all()

    stage_counts = {stage.value: 0 for stage in LeadStage}
    for stage, cnt in stage_rows:
        stage_counts[stage.value] = cnt

    status_counts = {st.value: 0 for st in LeadStatus}
    for st, cnt in status_rows:
        status_counts[st.value] = cnt

    return {
        "id": str(campaign.id),
        "name": campaign.name,
        "description": campaign.description,
        "status": campaign.status.value,
        "timezone": campaign.timezone,
        "created_at": campaign.created_at.isoformat() if campaign.created_at else None,
        "stage_counts": stage_counts,
        "status_counts": status_counts,
    }


@router.post("/{campaign_id}/pause")
def pause_campaign(campaign_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    """Pause campaign and cancel pending sending jobs while preserving all lead states."""
    campaign = db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    campaign.status = CampaignStatus.PAUSED
    record_ids = db.scalars(
        select(EmailRecord.id).where(EmailRecord.campaign_id == campaign_id)
    ).all()
    if record_ids:
        pending_jobs = db.scalars(
            select(SendingJob).where(
                SendingJob.email_record_id.in_(record_ids),
                SendingJob.status == JobStatus.PENDING,
            )
        ).all()
        for job in pending_jobs:
            job.status = JobStatus.CANCELLED

    db.commit()
    return {"id": str(campaign.id), "status": campaign.status.value}


@router.post("/{campaign_id}/resume")
def resume_campaign(campaign_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    """Resume a paused campaign."""
    campaign = db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    if campaign.status == CampaignStatus.ARCHIVED:
        raise HTTPException(status_code=400, detail="Archived campaigns cannot be resumed.")

    campaign.status = CampaignStatus.ACTIVE
    db.commit()
    return {"id": str(campaign.id), "status": campaign.status.value}


@router.post("/{campaign_id}/archive")
def archive_campaign(campaign_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    """Archive campaign while preserving all lead and email history."""
    campaign = db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    campaign.status = CampaignStatus.ARCHIVED
    db.commit()
    return {"id": str(campaign.id), "status": campaign.status.value}
