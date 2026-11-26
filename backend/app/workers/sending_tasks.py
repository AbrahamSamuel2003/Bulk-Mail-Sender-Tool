from datetime import datetime, timezone
import uuid
from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.models.campaign import Campaign
from app.models.email_record import EmailRecord
from app.models.enums import CampaignStatus, EmailStage, JobStatus, LeadStage, LeadStatus, SendStatus
from app.models.lead import Lead
from app.models.sending import SendingEvent, SendingJob
from app.models.settings import ApplicationSettings
from app.models.suppression import SuppressionList
from app.services.gmail_service import send_email_message
from app.services.scheduling_service import (
    calculate_followup_due_date,
    get_campaign_day_bounds_utc,
    get_campaign_today,
)


def _next_stage_and_interval(
    current: EmailStage, app_settings: ApplicationSettings | None
) -> tuple[LeadStage, int | None]:
    if current == EmailStage.INITIAL:
        return LeadStage.FOLLOW_UP_1, app_settings.fu1_interval_days if app_settings else 3
    if current == EmailStage.FOLLOW_UP_1:
        return LeadStage.FOLLOW_UP_2, app_settings.fu2_interval_days if app_settings else 4
    if current == EmailStage.FOLLOW_UP_2:
        return LeadStage.FOLLOW_UP_3, app_settings.fu3_interval_days if app_settings else 5
    return LeadStage.COMPLETED, None


def send_single_email_task(job_id_str: str) -> dict:
    """Send a single queued email via Gmail API with strict idempotency and stage advancement."""
    db = SessionLocal()
    try:
        job = db.get(SendingJob, uuid.UUID(job_id_str))
        if not job or job.status != JobStatus.PROCESSING:
            return {"status": "skipped", "reason": "job_not_processing"}

        record = db.get(EmailRecord, job.email_record_id)
        if not record or record.send_status == SendStatus.SENT:
            job.status = JobStatus.COMPLETED
            db.commit()
            return {"status": "skipped", "reason": "already_sent"}

        lead = db.get(Lead, record.lead_id)
        campaign = db.get(Campaign, record.campaign_id)
        if not lead or not campaign or campaign.status != CampaignStatus.ACTIVE or lead.status != LeadStatus.ACTIVE:
            job.status = JobStatus.CANCELLED
            record.send_status = SendStatus.DRAFT
            db.commit()
            return {"status": "cancelled", "reason": "inactive_lead_or_campaign"}

        suppressed = db.execute(
            select(SuppressionList).where(SuppressionList.email == lead.email.lower())
        ).scalar_one_or_none()
        if suppressed:
            job.status = JobStatus.CANCELLED
            lead.status = LeadStatus.UNSUBSCRIBED
            db.commit()
            return {"status": "cancelled", "reason": "suppressed"}

        # For follow-ups, thread onto the initial Gmail thread_id
        thread_id = None
        if record.stage != EmailStage.INITIAL:
            initial_rec = db.execute(
                select(EmailRecord).where(
                    EmailRecord.lead_id == lead.id,
                    EmailRecord.stage == EmailStage.INITIAL,
                )
            ).scalar_one_or_none()
            if initial_rec and initial_rec.provider_thread_id:
                thread_id = initial_rec.provider_thread_id

        job.attempt_count += 1
        result = send_email_message(
            db=db,
            to_email=lead.email,
            subject=record.subject,
            body=record.body,
            thread_id=thread_id,
        )

        sent_at = datetime.now(timezone.utc)
        record.send_status = SendStatus.SENT
        record.sent_at = sent_at
        record.provider_message_id = result["message_id"]
        record.provider_thread_id = result["thread_id"]

        app_settings = db.execute(select(ApplicationSettings)).scalar_one_or_none()
        next_stage, interval_days = _next_stage_and_interval(record.stage, app_settings)
        use_business_days = app_settings.use_business_days if app_settings else True

        if record.stage == EmailStage.INITIAL:
            lead.initial_sent_at = sent_at
        lead.last_sent_at = sent_at
        lead.current_stage = next_stage

        if next_stage == LeadStage.COMPLETED:
            lead.status = LeadStatus.COMPLETED
            lead.next_followup_due_at = None
        elif interval_days is not None:
            lead.next_followup_due_at = calculate_followup_due_date(
                sent_at=sent_at,
                interval_days=interval_days,
                campaign_timezone=campaign.timezone,
                use_business_days=use_business_days,
            )

        job.status = JobStatus.COMPLETED
        db.add(SendingEvent(sending_job_id=job.id, event_type="sent", detail=result["message_id"]))
        db.commit()
        return {"status": "sent", "message_id": result["message_id"]}
    except Exception as exc:
        db.rollback()
        err_str = str(exc)
        err_lower = err_str.lower()
        if any(
            token in err_lower
            for token in ("421", "450", "5.4.5", "authentication", "rate limit", "too many", "quota")
        ):
            app_settings = db.execute(select(ApplicationSettings)).scalar_one_or_none()
            if app_settings:
                app_settings.global_queue_paused = True

        job = db.get(SendingJob, uuid.UUID(job_id_str))
        if job:
            job.status = JobStatus.FAILED
            job.last_error = err_str
            record = db.get(EmailRecord, job.email_record_id)
            if record and record.send_status != SendStatus.SENT:
                record.send_status = SendStatus.FAILED
            db.add(SendingEvent(sending_job_id=job.id, event_type="failed", detail=err_str))
            db.commit()
        return {"status": "failed", "error": err_str}
    finally:
        db.close()


def dispatch_due_jobs() -> dict:
    """Periodic dispatcher enforcing global pause and daily sending limit (date-based, 24/7)."""
    db = SessionLocal()
    dispatched = 0
    try:
        app_settings = db.execute(select(ApplicationSettings)).scalar_one_or_none()
        if app_settings and app_settings.global_queue_paused:
            return {"status": "paused", "dispatched": 0}

        now = datetime.now(timezone.utc)
        tz_name = app_settings.default_timezone if app_settings else "Asia/Kolkata"

        daily_limit = app_settings.daily_sending_limit if app_settings else 100
        today = get_campaign_today(tz_name, now)
        day_start, day_end = get_campaign_day_bounds_utc(today, tz_name)
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
        remaining_quota = max(0, daily_limit - sent_today)
        if remaining_quota == 0:
            return {"status": "daily_limit_reached", "dispatched": 0}

        due_jobs = db.scalars(
            select(SendingJob)
            .where(SendingJob.status == JobStatus.PENDING, SendingJob.scheduled_at <= now)
            .order_by(SendingJob.scheduled_at.asc())
            .limit(min(10, remaining_quota))
        ).all()

        for job in due_jobs:
            job.status = JobStatus.PROCESSING
            db.commit()
            send_single_email_task(str(job.id))
            dispatched += 1

        return {"status": "ok", "dispatched": dispatched}
    finally:
        db.close()
