from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.email_record import EmailRecord
from app.models.enums import JobStatus, SendStatus
from app.models.sending import SendingJob
from app.models.settings import ApplicationSettings
from app.services.scheduling_service import get_campaign_day_bounds_utc, get_campaign_today

router = APIRouter(prefix="/sending", tags=["Sending Queue"])


def _get_settings(db: Session) -> ApplicationSettings:
    s = db.execute(select(ApplicationSettings)).scalar_one_or_none()
    if not s:
        s = ApplicationSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("/status")
def get_queue_status(db: Session = Depends(get_db)) -> dict:
    s = _get_settings(db)
    now_utc = datetime.now(timezone.utc)
    today = get_campaign_today(s.default_timezone, now_utc)
    day_start, day_end = get_campaign_day_bounds_utc(today, s.default_timezone)

    sent_today = (
        db.scalar(
            select(func.count(EmailRecord.id)).where(
                EmailRecord.send_status == SendStatus.SENT,
                EmailRecord.sent_at >= day_start,
                EmailRecord.sent_at <= day_end,
            )
        )
        or 0
    )
    pending_jobs = (
        db.scalar(select(func.count(SendingJob.id)).where(SendingJob.status == JobStatus.PENDING))
        or 0
    )

    cfg = s.ai_prompt_config or {}
    return {
        "global_queue_paused": s.global_queue_paused,
        "pending_jobs": pending_jobs,
        "sent_today": sent_today,
        "daily_sending_limit": s.daily_sending_limit,
        "within_sending_window": True,
        "ai_quota_exhausted": bool(cfg.get("ai_quota_exhausted", False)),
        "ai_quota_error": cfg.get("ai_quota_error"),
    }


@router.post("/pause")
def pause_global_queue(db: Session = Depends(get_db)) -> dict:
    s = _get_settings(db)
    s.global_queue_paused = True
    db.commit()
    return {"global_queue_paused": True}


@router.post("/resume")
def resume_global_queue(db: Session = Depends(get_db)) -> dict:
    s = _get_settings(db)
    s.global_queue_paused = False
    db.commit()
    return {"global_queue_paused": False}

