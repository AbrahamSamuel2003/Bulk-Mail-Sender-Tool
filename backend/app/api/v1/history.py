from datetime import date, datetime, timezone
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.campaign import Campaign
from app.models.email_record import EmailRecord
from app.models.enums import EmailStage, LeadStatus, SendStatus
from app.models.lead import Lead
from app.models.settings import ApplicationSettings
from app.services.scheduling_service import get_campaign_day_bounds_utc

router = APIRouter(prefix="/history", tags=["History"])


@router.get("")
def get_email_history(
    campaign_id: uuid.UUID | None = Query(default=None),
    stage: EmailStage | None = Query(default=None),
    date_filter: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> dict:
    """Return global outreach summary counts and searchable, date-filterable email history."""
    app_settings = db.execute(select(ApplicationSettings)).scalar_one_or_none()
    tz_name = app_settings.default_timezone if app_settings else "Asia/Kolkata"

    base_sent = select(EmailRecord.stage, func.count(EmailRecord.id)).where(
        EmailRecord.send_status == SendStatus.SENT
    )
    if campaign_id:
        base_sent = base_sent.where(EmailRecord.campaign_id == campaign_id)
    sent_rows = db.execute(base_sent.group_by(EmailRecord.stage)).all()
    sent_by_stage = {st.value: cnt for st, cnt in sent_rows}

    failed_stmt = select(func.count(EmailRecord.id)).where(
        EmailRecord.send_status == SendStatus.FAILED
    )
    if campaign_id:
        failed_stmt = failed_stmt.where(EmailRecord.campaign_id == campaign_id)
    failed_count = db.scalar(failed_stmt) or 0

    replies_stmt = select(func.count(Lead.id)).where(Lead.status == LeadStatus.REPLIED)
    if campaign_id:
        replies_stmt = replies_stmt.where(Lead.campaign_id == campaign_id)
    replies_count = db.scalar(replies_stmt) or 0

    summary = {
        "total_sent": sum(sent_by_stage.values()),
        "initial_sent": sent_by_stage.get("initial", 0),
        "fu1_sent": sent_by_stage.get("follow_up_1", 0),
        "fu2_sent": sent_by_stage.get("follow_up_2", 0),
        "fu3_sent": sent_by_stage.get("follow_up_3", 0),
        "failed_count": failed_count,
        "replies_count": replies_count,
    }

    stmt = (
        select(EmailRecord, Lead, Campaign)
        .join(Lead, EmailRecord.lead_id == Lead.id)
        .join(Campaign, EmailRecord.campaign_id == Campaign.id)
        .where(EmailRecord.send_status.in_([SendStatus.SENT, SendStatus.FAILED, SendStatus.QUEUED]))
    )
    if campaign_id:
        stmt = stmt.where(EmailRecord.campaign_id == campaign_id)
    if stage:
        stmt = stmt.where(EmailRecord.stage == stage)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            Lead.practice_name.ilike(pattern)
            | Lead.contact_name.ilike(pattern)
            | Lead.email.ilike(pattern)
            | EmailRecord.subject.ilike(pattern)
        )

    if date_filter == "sent_date" and start_date:
        s_start, s_end = get_campaign_day_bounds_utc(start_date, tz_name)
        stmt = stmt.where(EmailRecord.sent_at >= s_start, EmailRecord.sent_at <= s_end)
    elif date_filter == "custom_range" and start_date and end_date:
        r_start, _ = get_campaign_day_bounds_utc(start_date, tz_name)
        _, r_end = get_campaign_day_bounds_utc(end_date, tz_name)
        stmt = stmt.where(EmailRecord.sent_at >= r_start, EmailRecord.sent_at <= r_end)

    stmt = stmt.order_by(
        func.coalesce(EmailRecord.sent_at, EmailRecord.updated_at).desc()
    )
    all_rows = db.execute(stmt).all()
    total = len(all_rows)
    offset = (page - 1) * page_size
    page_rows = all_rows[offset : offset + page_size]

    items = [
        {
            "id": str(rec.id),
            "lead_id": str(lead.id),
            "campaign_id": str(campaign.id),
            "campaign_name": campaign.name,
            "practice_name": lead.practice_name,
            "contact_name": lead.contact_name,
            "email": lead.email,
            "stage": rec.stage.value,
            "subject": rec.subject,
            "send_status": rec.send_status.value,
            "ai_generated": rec.ai_generated,
            "sent_at": rec.sent_at.isoformat() if rec.sent_at else None,
            "provider_message_id": rec.provider_message_id,
        }
        for rec, lead, campaign in page_rows
    ]

    return {
        "summary": summary,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }

