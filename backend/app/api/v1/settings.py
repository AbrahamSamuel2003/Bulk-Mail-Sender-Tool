from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.settings import ApplicationSettings

router = APIRouter(prefix="/settings", tags=["Settings"])


class SettingsUpdate(BaseModel):
    fu1_interval_days: int | None = None
    fu2_interval_days: int | None = None
    fu3_interval_days: int | None = None
    use_business_days: bool | None = None
    batch_size: int | None = None
    delay_between_emails_sec: int | None = None
    delay_between_batches_sec: int | None = None
    daily_sending_limit: int | None = None
    sending_window_start: str | None = None
    sending_window_end: str | None = None
    default_timezone: str | None = None
    global_queue_paused: bool | None = None
    ai_prompt_config: dict | None = None


def _get_or_create_settings(db: Session) -> ApplicationSettings:
    row = db.execute(select(ApplicationSettings)).scalar_one_or_none()
    if not row:
        row = ApplicationSettings()
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("")
def get_application_settings(db: Session = Depends(get_db)) -> dict:
    s = _get_or_create_settings(db)
    return {
        "fu1_interval_days": s.fu1_interval_days,
        "fu2_interval_days": s.fu2_interval_days,
        "fu3_interval_days": s.fu3_interval_days,
        "use_business_days": s.use_business_days,
        "batch_size": s.batch_size,
        "delay_between_emails_sec": s.delay_between_emails_sec,
        "delay_between_batches_sec": s.delay_between_batches_sec,
        "daily_sending_limit": s.daily_sending_limit,
        "sending_window_start": s.sending_window_start,
        "sending_window_end": s.sending_window_end,
        "default_timezone": s.default_timezone,
        "global_queue_paused": s.global_queue_paused,
        "ai_prompt_config": s.ai_prompt_config,
    }


@router.patch("")
def update_application_settings(payload: SettingsUpdate, db: Session = Depends(get_db)) -> dict:
    s = _get_or_create_settings(db)
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(s, field, val)
    db.commit()
    db.refresh(s)
    return get_application_settings(db)


@router.post("/clear-ai-alert")
def clear_ai_quota_alert(db: Session = Depends(get_db)) -> dict:
    from sqlalchemy.orm.attributes import flag_modified

    s = _get_or_create_settings(db)
    cfg = dict(s.ai_prompt_config or {})
    cfg["ai_quota_exhausted"] = False
    cfg["ai_quota_error"] = None
    s.ai_prompt_config = cfg
    flag_modified(s, "ai_prompt_config")
    db.commit()
    return {"ai_quota_exhausted": False}

