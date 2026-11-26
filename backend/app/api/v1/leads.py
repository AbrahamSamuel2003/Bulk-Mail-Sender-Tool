from datetime import date, datetime, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.campaign import Campaign
from app.models.email_record import EmailRecord
from app.models.enums import JobStatus, LeadStage, LeadStatus, SuppressionReason
from app.models.lead import Lead
from app.models.reply import Reply
from app.models.sending import SendingJob
from app.models.suppression import SuppressionList
from app.services.scheduling_service import get_campaign_day_bounds_utc, get_campaign_today

router = APIRouter(tags=["Leads"])


class BulkDeleteLeadsRequest(BaseModel):
    lead_ids: list[uuid.UUID]


@router.get("/campaigns/{campaign_id}/leads")
def list_campaign_leads(
    campaign_id: uuid.UUID,
    stage: LeadStage | None = Query(default=None),
    status: LeadStatus | None = Query(default=None),
    date_filter: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    search: str | None = Query(default=None),
    sort_by: str = Query(default="created_at"),
    sort_dir: str = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    """List leads with timezone-aware date filtering, search, sorting, and pagination."""
    campaign = db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    stmt = select(Lead).where(Lead.campaign_id == campaign_id)
    if stage:
        stmt = stmt.where(Lead.current_stage == stage)
    if status:
        stmt = stmt.where(Lead.status == status)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            Lead.practice_name.ilike(pattern)
            | Lead.contact_name.ilike(pattern)
            | Lead.email.ilike(pattern)
        )

    now_utc = datetime.now(timezone.utc)
    today = get_campaign_today(campaign.timezone, now_utc)
    today_start, today_end = get_campaign_day_bounds_utc(today, campaign.timezone)

    if date_filter == "due_today":
        stmt = stmt.where(
            Lead.next_followup_due_at >= today_start,
            Lead.next_followup_due_at <= today_end,
        )
    elif date_filter == "overdue":
        stmt = stmt.where(Lead.next_followup_due_at < today_start)
    elif date_filter == "upcoming":
        stmt = stmt.where(Lead.next_followup_due_at > today_end)
    elif date_filter == "sent_date" and start_date:
        s_start, s_end = get_campaign_day_bounds_utc(start_date, campaign.timezone)
        stmt = stmt.where(Lead.last_sent_at >= s_start, Lead.last_sent_at <= s_end)
    elif date_filter == "due_date" and start_date:
        d_start, d_end = get_campaign_day_bounds_utc(start_date, campaign.timezone)
        stmt = stmt.where(Lead.next_followup_due_at >= d_start, Lead.next_followup_due_at <= d_end)
    elif date_filter == "custom_range" and start_date and end_date:
        r_start, _ = get_campaign_day_bounds_utc(start_date, campaign.timezone)
        _, r_end = get_campaign_day_bounds_utc(end_date, campaign.timezone)
        stmt = stmt.where(Lead.next_followup_due_at >= r_start, Lead.next_followup_due_at <= r_end)

    sort_col_map = {
        "practice_name": Lead.practice_name,
        "email": Lead.email,
        "last_sent_at": Lead.last_sent_at,
        "next_followup_due_at": Lead.next_followup_due_at,
        "created_at": Lead.created_at,
    }
    sort_col = sort_col_map.get(sort_by, Lead.created_at)
    stmt = stmt.order_by(sort_col.asc() if sort_dir == "asc" else sort_col.desc())

    all_matching = db.scalars(stmt).all()
    total = len(all_matching)
    offset = (page - 1) * page_size
    leads = all_matching[offset : offset + page_size]

    if not leads:
        return {"items": [], "total": total, "page": page, "page_size": page_size}

    lead_ids = [lead.id for lead in leads]
    records = db.scalars(
        select(EmailRecord).where(EmailRecord.lead_id.in_(lead_ids))
    ).all()
    records_by_key = {(r.lead_id, r.stage.value): r for r in records}

    record_ids = [r.id for r in records]
    jobs = (
        db.scalars(select(SendingJob).where(SendingJob.email_record_id.in_(record_ids))).all()
        if record_ids
        else []
    )
    jobs_by_record = {j.email_record_id: j for j in jobs}

    items = []
    for lead in leads:
        stage_key = "initial" if lead.current_stage == LeadStage.NEW else lead.current_stage.value
        rec = records_by_key.get((lead.id, stage_key))
        job = jobs_by_record.get(rec.id) if rec else None
        is_eligible = (
            lead.status == LeadStatus.ACTIVE
            and (
                lead.current_stage == LeadStage.NEW
                or (lead.next_followup_due_at is not None and now_utc >= lead.next_followup_due_at)
            )
        )
        items.append(
            {
                "id": str(lead.id),
                "campaign_id": str(lead.campaign_id),
                "practice_name": lead.practice_name,
                "contact_name": lead.contact_name,
                "email": lead.email,
                "current_stage": lead.current_stage.value,
                "status": lead.status.value,
                "is_eligible": is_eligible,
                "initial_sent_at": lead.initial_sent_at.isoformat() if lead.initial_sent_at else None,
                "last_sent_at": lead.last_sent_at.isoformat() if lead.last_sent_at else None,
                "next_followup_due_at": (
                    lead.next_followup_due_at.isoformat() if lead.next_followup_due_at else None
                ),
                "email_record": (
                    {
                        "id": str(rec.id),
                        "subject": rec.subject,
                        "body": rec.body,
                        "ai_generated": rec.ai_generated,
                        "send_status": rec.send_status.value,
                        "sent_at": rec.sent_at.isoformat() if rec.sent_at else None,
                        "job_status": job.status.value if job else None,
                        "scheduled_at": job.scheduled_at.isoformat() if job and job.scheduled_at else None,
                        "last_error": job.last_error if job else None,
                    }
                    if rec
                    else None
                ),
            }
        )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/leads/{lead_id}/history")
def get_lead_history(lead_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    """Return complete email & reply history for an individual lead (preserved even if archived)."""
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    campaign = db.get(Campaign, lead.campaign_id)

    records = db.scalars(
        select(EmailRecord)
        .where(EmailRecord.lead_id == lead_id)
        .order_by(EmailRecord.created_at.asc())
    ).all()
    replies = db.scalars(
        select(Reply)
        .where(Reply.lead_id == lead_id)
        .order_by(Reply.received_at.asc())
    ).all()

    return {
        "lead": {
            "id": str(lead.id),
            "campaign_id": str(lead.campaign_id),
            "campaign_name": campaign.name if campaign else None,
            "campaign_status": campaign.status.value if campaign else None,
            "practice_name": lead.practice_name,
            "contact_name": lead.contact_name,
            "email": lead.email,
            "current_stage": lead.current_stage.value,
            "status": lead.status.value,
            "initial_sent_at": lead.initial_sent_at.isoformat() if lead.initial_sent_at else None,
            "next_followup_due_at": (
                lead.next_followup_due_at.isoformat() if lead.next_followup_due_at else None
            ),
        },
        "email_records": [
            {
                "id": str(r.id),
                "stage": r.stage.value,
                "subject": r.subject,
                "body": r.body,
                "ai_generated": r.ai_generated,
                "ai_generated_subject": r.ai_generated_subject,
                "ai_generated_body": r.ai_generated_body,
                "send_status": r.send_status.value,
                "sent_at": r.sent_at.isoformat() if r.sent_at else None,
                "provider_message_id": r.provider_message_id,
                "provider_thread_id": r.provider_thread_id,
            }
            for r in records
        ],
        "replies": [
            {
                "id": str(rep.id),
                "sender_email": rep.sender_email,
                "subject": rep.subject,
                "body": rep.body,
                "received_at": rep.received_at.isoformat(),
                "provider_message_id": rep.provider_message_id,
            }
            for rep in replies
        ],
    }


@router.delete("/campaigns/{campaign_id}/leads/bulk")
def bulk_delete_leads(
    campaign_id: uuid.UUID,
    payload: BulkDeleteLeadsRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Remove selected leads (e.g. from NEW stage before sending)."""
    leads = db.scalars(
        select(Lead).where(Lead.campaign_id == campaign_id, Lead.id.in_(payload.lead_ids))
    ).all()
    deleted = 0
    for lead in leads:
        db.delete(lead)
        deleted += 1
    db.commit()
    return {"deleted": deleted}


def _cancel_pending_jobs(db: Session, lead_id: uuid.UUID) -> None:
    record_ids = db.scalars(select(EmailRecord.id).where(EmailRecord.lead_id == lead_id)).all()
    if not record_ids:
        return
    jobs = db.scalars(
        select(SendingJob).where(
            SendingJob.email_record_id.in_(record_ids),
            SendingJob.status == JobStatus.PENDING,
        )
    ).all()
    for job in jobs:
        job.status = JobStatus.CANCELLED


@router.post("/leads/{lead_id}/stop")
def stop_lead(lead_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    lead.status = LeadStatus.MANUALLY_STOPPED
    _cancel_pending_jobs(db, lead_id)
    db.commit()
    return {"id": str(lead.id), "status": lead.status.value}


@router.post("/leads/{lead_id}/unsubscribe")
def unsubscribe_lead(lead_id: uuid.UUID, db: Session = Depends(get_db)) -> dict:
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    lead.status = LeadStatus.UNSUBSCRIBED
    _cancel_pending_jobs(db, lead_id)

    existing = db.execute(
        select(SuppressionList).where(SuppressionList.email == lead.email.lower())
    ).scalar_one_or_none()
    if not existing:
        db.add(
            SuppressionList(
                email=lead.email.lower(),
                reason=SuppressionReason.UNSUBSCRIBED,
                notes="Manual unsubscribe by Team Lead",
            )
        )
    db.commit()
    return {"id": str(lead.id), "status": lead.status.value}
