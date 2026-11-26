from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.campaign import Campaign
from app.models.email_record import EmailRecord
from app.models.enums import EmailStage, LeadStage, LeadStatus, SendStatus
from app.models.lead import Lead
from app.models.reply import Reply
from app.models.suppression import SuppressionList

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)) -> dict:
    """Return high-level outreach metrics for the main dashboard."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    total_campaigns = db.scalar(select(func.count(Campaign.id))) or 0
    total_leads = db.scalar(select(func.count(Lead.id))) or 0
    initial_sent = (
        db.scalar(
            select(func.count(EmailRecord.id)).where(
                EmailRecord.stage == EmailStage.INITIAL,
                EmailRecord.send_status == SendStatus.SENT,
            )
        )
        or 0
    )
    followups_sent = (
        db.scalar(
            select(func.count(EmailRecord.id)).where(
                EmailRecord.stage != EmailStage.INITIAL,
                EmailRecord.send_status == SendStatus.SENT,
            )
        )
        or 0
    )
    due_today = (
        db.scalar(
            select(func.count(Lead.id)).where(
                Lead.status == LeadStatus.ACTIVE,
                Lead.current_stage.in_(
                    [LeadStage.FOLLOW_UP_1, LeadStage.FOLLOW_UP_2, LeadStage.FOLLOW_UP_3]
                ),
                Lead.next_followup_due_at >= today_start,
                Lead.next_followup_due_at < today_end,
            )
        )
        or 0
    )
    overdue = (
        db.scalar(
            select(func.count(Lead.id)).where(
                Lead.status == LeadStatus.ACTIVE,
                Lead.current_stage.in_(
                    [LeadStage.FOLLOW_UP_1, LeadStage.FOLLOW_UP_2, LeadStage.FOLLOW_UP_3]
                ),
                Lead.next_followup_due_at < today_start,
            )
        )
        or 0
    )
    awaiting_approval = (
        db.scalar(
            select(func.count(EmailRecord.id)).where(EmailRecord.send_status == SendStatus.DRAFT)
        )
        or 0
    )
    failed_emails = (
        db.scalar(
            select(func.count(EmailRecord.id)).where(EmailRecord.send_status == SendStatus.FAILED)
        )
        or 0
    )
    replies_received = (
        db.scalar(select(func.count(Lead.id)).where(Lead.status == LeadStatus.REPLIED)) or 0
    )
    unsubscribed = db.scalar(select(func.count(SuppressionList.id))) or 0

    return {
        "total_campaigns": total_campaigns,
        "total_leads": total_leads,
        "initial_sent": initial_sent,
        "followups_sent": followups_sent,
        "due_today": due_today,
        "overdue": overdue,
        "awaiting_approval": awaiting_approval,
        "successful_deliveries": initial_sent + followups_sent,
        "failed_emails": failed_emails,
        "replies_received": replies_received,
        "unsubscribed": unsubscribed,
    }


@router.get("/activity")
def get_dashboard_activity(db: Session = Depends(get_db)) -> dict:
    """Return recent campaigns, sends, upcoming follow-ups, replies, and failures."""
    recent_campaigns = db.scalars(
        select(Campaign).order_by(Campaign.created_at.desc()).limit(5)
    ).all()
    recent_sends = db.scalars(
        select(EmailRecord)
        .where(EmailRecord.send_status == SendStatus.SENT)
        .order_by(EmailRecord.sent_at.desc())
        .limit(5)
    ).all()
    upcoming_followups = db.scalars(
        select(Lead)
        .where(
            Lead.status == LeadStatus.ACTIVE,
            Lead.next_followup_due_at.is_not(None),
        )
        .order_by(Lead.next_followup_due_at.asc())
        .limit(5)
    ).all()
    recent_replies = db.scalars(
        select(Reply).order_by(Reply.received_at.desc()).limit(5)
    ).all()
    recent_failures = db.scalars(
        select(EmailRecord)
        .where(EmailRecord.send_status == SendStatus.FAILED)
        .order_by(EmailRecord.updated_at.desc())
        .limit(5)
    ).all()

    return {
        "recent_campaigns": [
            {"id": str(c.id), "name": c.name, "status": c.status.value}
            for c in recent_campaigns
        ],
        "recent_sends": [
            {
                "id": str(r.id),
                "lead_id": str(r.lead_id),
                "stage": r.stage.value,
                "subject": r.subject,
                "sent_at": r.sent_at.isoformat() if r.sent_at else None,
            }
            for r in recent_sends
        ],
        "upcoming_followups": [
            {
                "id": str(l.id),
                "practice_name": l.practice_name,
                "email": l.email,
                "stage": l.current_stage.value,
                "due_at": l.next_followup_due_at.isoformat() if l.next_followup_due_at else None,
            }
            for l in upcoming_followups
        ],
        "recent_replies": [
            {
                "id": str(rep.id),
                "lead_id": str(rep.lead_id),
                "sender_email": rep.sender_email,
                "subject": rep.subject,
                "received_at": rep.received_at.isoformat(),
            }
            for rep in recent_replies
        ],
        "recent_failures": [
            {
                "id": str(f.id),
                "lead_id": str(f.lead_id),
                "stage": f.stage.value,
                "subject": f.subject,
            }
            for f in recent_failures
        ],
    }


@router.get("/charts")
def get_dashboard_charts(days: int = 14, db: Session = Depends(get_db)) -> dict:
    """Return 14-day daily outreach time series and lead pipeline breakdown for dashboard graphs."""
    now = datetime.now(timezone.utc)
    today_date = now.date()
    start_date = today_date - timedelta(days=days - 1)
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)

    sent_records = db.execute(
        select(EmailRecord.stage, EmailRecord.sent_at).where(
            EmailRecord.send_status == SendStatus.SENT,
            EmailRecord.sent_at >= start_dt,
        )
    ).all()

    reply_rows = db.scalars(
        select(Reply.received_at).where(Reply.received_at >= start_dt)
    ).all()

    series_map: dict[str, dict] = {}
    for offset in range(days):
        d = start_date + timedelta(days=offset)
        key = d.isoformat()
        series_map[key] = {
            "date": key,
            "label": d.strftime("%b %d"),
            "initial_sent": 0,
            "followups_sent": 0,
            "replies": 0,
        }

    for stage, sent_at in sent_records:
        if not sent_at:
            continue
        key = sent_at.astimezone(timezone.utc).date().isoformat()
        if key in series_map:
            if stage == EmailStage.INITIAL:
                series_map[key]["initial_sent"] += 1
            else:
                series_map[key]["followups_sent"] += 1

    for received_at in reply_rows:
        if not received_at:
            continue
        key = received_at.astimezone(timezone.utc).date().isoformat()
        if key in series_map:
            series_map[key]["replies"] += 1

    stage_counts_raw = db.execute(
        select(Lead.current_stage, func.count(Lead.id))
        .where(Lead.status == LeadStatus.ACTIVE)
        .group_by(Lead.current_stage)
    ).all()
    stage_map = {st.value: cnt for st, cnt in stage_counts_raw}

    replied_count = db.scalar(select(func.count(Lead.id)).where(Lead.status == LeadStatus.REPLIED)) or 0
    completed_count = db.scalar(select(func.count(Lead.id)).where(Lead.status == LeadStatus.COMPLETED)) or 0
    suppressed_count = db.scalar(select(func.count(SuppressionList.id))) or 0

    pipeline = [
        {"key": "new", "label": "NEW", "count": stage_map.get("new", 0), "color": "#0078D4"},
        {"key": "follow_up_1", "label": "FOLLOW-UP 1", "count": stage_map.get("follow_up_1", 0), "color": "#2B88D8"},
        {"key": "follow_up_2", "label": "FOLLOW-UP 2", "count": stage_map.get("follow_up_2", 0), "color": "#71AFE5"},
        {"key": "follow_up_3", "label": "FOLLOW-UP 3", "count": stage_map.get("follow_up_3", 0), "color": "#005A9E"},
        {"key": "completed", "label": "COMPLETED", "count": completed_count, "color": "#605E5C"},
        {"key": "replied", "label": "REPLIED", "count": replied_count, "color": "#107C10"},
        {"key": "suppressed", "label": "SUPPRESSED", "count": suppressed_count, "color": "#A4262C"},
    ]

    return {
        "daily_activity": list(series_map.values()),
        "pipeline_breakdown": pipeline,
    }
