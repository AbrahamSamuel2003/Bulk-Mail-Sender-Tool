from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import random
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.database import get_db
from app.models.campaign import Campaign
from app.models.email_record import AIGenerationLog, EmailRecord
from app.models.enums import (
    CampaignStatus,
    EmailStage,
    JobStatus,
    LeadStage,
    LeadStatus,
    SendStatus,
)
from app.models.lead import Lead
from app.models.reply import Reply
from app.models.sending import SendingJob
from app.models.settings import ApplicationSettings
from app.models.suppression import SuppressionList
from app.services.ai_service import AIQuotaExhaustedError, generate_followup_email
from app.workers.sending_tasks import dispatch_due_jobs

router = APIRouter(tags=["Emails"])


class EmailRecordUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None


class SendCampaignEmailsRequest(BaseModel):
    stage: EmailStage = EmailStage.INITIAL
    lead_ids: list[uuid.UUID] | None = None
    send_all_eligible: bool = False
    auto_generate: bool = True
    ignore_due_date: bool = False


class GenerateFollowupsRequest(BaseModel):
    stage: EmailStage
    lead_ids: list[uuid.UUID] | None = None
    generate_all: bool = False
    provider: str | None = None


def _set_ai_quota_flag(db: Session, app_settings: ApplicationSettings | None, exhausted: bool, error_msg: str | None = None) -> None:
    if not app_settings:
        app_settings = ApplicationSettings()
        db.add(app_settings)
        db.flush()
    cfg = dict(app_settings.ai_prompt_config or {})
    if cfg.get("ai_quota_exhausted") != exhausted or cfg.get("ai_quota_error") != error_msg:
        cfg["ai_quota_exhausted"] = exhausted
        cfg["ai_quota_error"] = error_msg
        app_settings.ai_prompt_config = cfg
        flag_modified(app_settings, "ai_prompt_config")


def _generate_and_save_followup(
    db: Session,
    campaign: Campaign,
    lead: Lead,
    stage: EmailStage,
    app_settings: ApplicationSettings | None,
    provider: str | None = None,
) -> EmailRecord | None:
    existing_target = db.execute(
        select(EmailRecord).where(
            EmailRecord.lead_id == lead.id,
            EmailRecord.stage == stage,
        )
    ).scalar_one_or_none()

    if existing_target and existing_target.send_status == SendStatus.SENT:
        return existing_target

    prior_records = db.scalars(
        select(EmailRecord)
        .where(EmailRecord.lead_id == lead.id, EmailRecord.stage != stage)
        .order_by(EmailRecord.created_at.asc())
    ).all()
    prior_emails = [
        {"stage": r.stage.value, "subject": r.subject, "body": r.body}
        for r in prior_records
    ]
    reply_rows = db.scalars(
        select(Reply).where(Reply.lead_id == lead.id).order_by(Reply.received_at.asc())
    ).all()
    replies = [{"sender": r.sender_email, "body": r.body or ""} for r in reply_rows]

    ai_config = (app_settings.ai_prompt_config if app_settings else {}) or {}
    effective_provider = provider or ai_config.get("provider")

    ai_result = generate_followup_email(
        stage=stage,
        practice_name=lead.practice_name,
        contact_name=lead.contact_name,
        campaign_name=campaign.name,
        campaign_description=campaign.description,
        prior_emails=prior_emails,
        replies=replies,
        ai_prompt_config=ai_config,
        provider_override=effective_provider,
    )

    _set_ai_quota_flag(db, app_settings, False, None)

    if existing_target:
        existing_target.subject = ai_result["subject"]
        existing_target.body = ai_result["body"]
        existing_target.ai_generated = True
        existing_target.ai_generated_subject = ai_result["subject"]
        existing_target.ai_generated_body = ai_result["body"]
        existing_target.send_status = SendStatus.DRAFT
        record = existing_target
    else:
        record = EmailRecord(
            lead_id=lead.id,
            campaign_id=campaign.id,
            stage=stage,
            subject=ai_result["subject"],
            body=ai_result["body"],
            ai_generated=True,
            ai_generated_subject=ai_result["subject"],
            ai_generated_body=ai_result["body"],
            send_status=SendStatus.DRAFT,
        )
        db.add(record)
        db.flush()

    db.add(
        AIGenerationLog(
            email_record_id=record.id,
            model=ai_result["model"],
            prompt_snapshot=ai_result["prompt_snapshot"],
            generated_subject=ai_result["subject"],
            generated_body=ai_result["body"],
        )
    )
    return record


def _generate_batch_concurrently(
    db: Session,
    campaign: Campaign,
    leads: list[Lead],
    stage: EmailStage,
    app_settings: ApplicationSettings | None,
    provider: str | None = None,
) -> tuple[dict[uuid.UUID, EmailRecord], list[dict], bool]:
    """Generate AI follow-ups concurrently in threads while keeping SQLAlchemy writes on the main thread."""
    ai_config = (app_settings.ai_prompt_config if app_settings else {}) or {}
    effective_provider = provider or ai_config.get("provider")

    tasks_input: list[dict] = []
    existing_map: dict[uuid.UUID, EmailRecord] = {}

    for lead in leads:
        existing_target = db.execute(
            select(EmailRecord).where(
                EmailRecord.lead_id == lead.id,
                EmailRecord.stage == stage,
            )
        ).scalar_one_or_none()

        if existing_target and existing_target.send_status == SendStatus.SENT:
            existing_map[lead.id] = existing_target
            continue

        prior_records = db.scalars(
            select(EmailRecord)
            .where(EmailRecord.lead_id == lead.id, EmailRecord.stage != stage)
            .order_by(EmailRecord.created_at.asc())
        ).all()
        reply_rows = db.scalars(
            select(Reply).where(Reply.lead_id == lead.id).order_by(Reply.received_at.asc())
        ).all()

        tasks_input.append(
            {
                "lead": lead,
                "existing_target": existing_target,
                "prior_emails": [
                    {"stage": r.stage.value, "subject": r.subject, "body": r.body}
                    for r in prior_records
                ],
                "replies": [
                    {"sender": r.sender_email, "body": r.body or ""}
                    for r in reply_rows
                ],
            }
        )

    results_map: dict[uuid.UUID, EmailRecord] = dict(existing_map)
    errors: list[dict] = []
    ai_quota_exhausted = False

    if not tasks_input:
        return results_map, errors, ai_quota_exhausted

    def _worker(item: dict) -> dict:
        lead_obj: Lead = item["lead"]
        return generate_followup_email(
            stage=stage,
            practice_name=lead_obj.practice_name,
            contact_name=lead_obj.contact_name,
            campaign_name=campaign.name,
            campaign_description=campaign.description,
            prior_emails=item["prior_emails"],
            replies=item["replies"],
            ai_prompt_config=ai_config,
            provider_override=effective_provider,
        )

    with ThreadPoolExecutor(max_workers=min(3, len(tasks_input))) as pool:
        future_to_item = {pool.submit(_worker, item): item for item in tasks_input}
        for future in as_completed(future_to_item):
            item = future_to_item[future]
            lead_obj: Lead = item["lead"]
            existing_target = item["existing_target"]
            try:
                ai_result = future.result()
                _set_ai_quota_flag(db, app_settings, False, None)
                if existing_target:
                    existing_target.subject = ai_result["subject"]
                    existing_target.body = ai_result["body"]
                    existing_target.ai_generated = True
                    existing_target.ai_generated_subject = ai_result["subject"]
                    existing_target.ai_generated_body = ai_result["body"]
                    existing_target.send_status = SendStatus.DRAFT
                    record = existing_target
                else:
                    record = EmailRecord(
                        lead_id=lead_obj.id,
                        campaign_id=campaign.id,
                        stage=stage,
                        subject=ai_result["subject"],
                        body=ai_result["body"],
                        ai_generated=True,
                        ai_generated_subject=ai_result["subject"],
                        ai_generated_body=ai_result["body"],
                        send_status=SendStatus.DRAFT,
                    )
                    db.add(record)
                    db.flush()

                db.add(
                    AIGenerationLog(
                        email_record_id=record.id,
                        model=ai_result["model"],
                        prompt_snapshot=ai_result["prompt_snapshot"],
                        generated_subject=ai_result["subject"],
                        generated_body=ai_result["body"],
                    )
                )
                results_map[lead_obj.id] = record
            except AIQuotaExhaustedError as exc:
                ai_quota_exhausted = True
                _set_ai_quota_flag(db, app_settings, True, str(exc))
                errors.append({"lead_id": str(lead_obj.id), "email": lead_obj.email, "error": str(exc)})
            except Exception as exc:
                errors.append({"lead_id": str(lead_obj.id), "email": lead_obj.email, "error": str(exc)})

    return results_map, errors, ai_quota_exhausted


@router.post("/campaigns/{campaign_id}/followups/generate")
def generate_campaign_followups(
    campaign_id: uuid.UUID,
    payload: GenerateFollowupsRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Generate AI follow-up drafts (FU1, FU2, or FU3) for selected or all leads in that stage."""
    if payload.stage == EmailStage.INITIAL:
        raise HTTPException(status_code=400, detail="AI generation is only for follow-up stages.")

    campaign = db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    target_stage = LeadStage(payload.stage.value)
    stmt = select(Lead).where(
        Lead.campaign_id == campaign_id,
        Lead.current_stage == target_stage,
        Lead.status == LeadStatus.ACTIVE,
    )
    if not payload.generate_all:
        if not payload.lead_ids:
            raise HTTPException(status_code=400, detail="Select leads or choose generate_all.")
        stmt = stmt.where(Lead.id.in_(payload.lead_ids))

    leads = db.scalars(stmt).all()
    app_settings = db.execute(select(ApplicationSettings)).scalar_one_or_none()
    results_map, errors, ai_quota_exhausted = _generate_batch_concurrently(
        db=db,
        campaign=campaign,
        leads=list(leads),
        stage=payload.stage,
        app_settings=app_settings,
        provider=payload.provider,
    )
    generated_count = sum(1 for rec in results_map.values() if rec.send_status != SendStatus.SENT)
    db.commit()
    return {
        "generated_count": generated_count,
        "errors": errors,
        "ai_quota_exhausted": ai_quota_exhausted,
    }


@router.patch("/email-records/{record_id}")
def update_email_record(
    record_id: uuid.UUID,
    payload: EmailRecordUpdate,
    db: Session = Depends(get_db),
) -> dict:
    """Edit subject or body of an unsent email draft."""
    record = db.get(EmailRecord, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Email record not found.")
    if record.send_status == SendStatus.SENT:
        raise HTTPException(status_code=400, detail="Cannot edit an already sent email.")

    if payload.subject is not None:
        record.subject = payload.subject.strip()
    if payload.body is not None:
        record.body = payload.body
    db.commit()
    db.refresh(record)
    return {
        "id": str(record.id),
        "subject": record.subject,
        "body": record.body,
        "send_status": record.send_status.value,
    }


@router.post("/campaigns/{campaign_id}/send")
def enqueue_campaign_emails(
    campaign_id: uuid.UUID,
    payload: SendCampaignEmailsRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    """
    Validate eligibility & suppression, auto-generate missing follow-up drafts if enabled,
    then enqueue staggered SendingJobs.
    """
    campaign = db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    if campaign.status != CampaignStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Campaign must be active to send emails.")

    target_lead_stage = (
        LeadStage.NEW
        if payload.stage == EmailStage.INITIAL
        else LeadStage(payload.stage.value)
    )

    stmt = select(Lead).where(
        Lead.campaign_id == campaign_id,
        Lead.current_stage == target_lead_stage,
        Lead.status == LeadStatus.ACTIVE,
    )
    if not payload.send_all_eligible:
        if not payload.lead_ids:
            raise HTTPException(status_code=400, detail="Select leads or choose send_all_eligible.")
        stmt = stmt.where(Lead.id.in_(payload.lead_ids))

    leads = db.scalars(stmt).all()
    suppressed = set(db.scalars(select(SuppressionList.email)).all())
    app_settings = db.execute(select(ApplicationSettings)).scalar_one_or_none()
    delay_email_sec = app_settings.delay_between_emails_sec if app_settings else 30
    batch_size = app_settings.batch_size if app_settings else 10
    delay_batch_sec = app_settings.delay_between_batches_sec if app_settings else 300

    now = datetime.now(timezone.utc)
    generated_count = 0
    queued_count = 0
    skipped_not_due = 0
    skipped_suppressed = 0
    skipped_other = 0
    ai_quota_exhausted = False
    errors: list[dict] = []

    eligible_leads: list[Lead] = []
    for lead in leads:
        if lead.email.lower() in suppressed:
            skipped_suppressed += 1
            continue
        if payload.stage != EmailStage.INITIAL and not payload.ignore_due_date:
            if not lead.next_followup_due_at or now < lead.next_followup_due_at:
                skipped_not_due += 1
                continue
        eligible_leads.append(lead)

    # Pre-generate any missing follow-up drafts concurrently
    if payload.stage != EmailStage.INITIAL and payload.auto_generate and eligible_leads:
        need_gen: list[Lead] = []
        for lead in eligible_leads:
            rec = db.execute(
                select(EmailRecord).where(
                    EmailRecord.lead_id == lead.id,
                    EmailRecord.stage == payload.stage,
                )
            ).scalar_one_or_none()
            if not rec or not rec.body.strip():
                need_gen.append(lead)
        if need_gen:
            gen_map, gen_errors, ai_quota_exhausted = _generate_batch_concurrently(
                db=db,
                campaign=campaign,
                leads=need_gen,
                stage=payload.stage,
                app_settings=app_settings,
            )
            generated_count = len(gen_map)
            errors.extend(gen_errors)

    for lead in eligible_leads:
        record = db.execute(
            select(EmailRecord).where(
                EmailRecord.lead_id == lead.id,
                EmailRecord.stage == payload.stage,
            )
        ).scalar_one_or_none()

        if not record or record.send_status == SendStatus.SENT or not record.body.strip():
            skipped_other += 1
            continue

        existing_job = db.execute(
            select(SendingJob).where(SendingJob.email_record_id == record.id)
        ).scalar_one_or_none()
        if existing_job and existing_job.status in (JobStatus.PENDING, JobStatus.PROCESSING, JobStatus.COMPLETED):
            skipped_other += 1
            continue

        batch_index = queued_count // max(1, batch_size)
        jitter = random.randint(0, 5) if queued_count > 0 else 0
        offset_seconds = (queued_count * delay_email_sec) + (batch_index * delay_batch_sec) + jitter
        scheduled_at = now + timedelta(seconds=offset_seconds)

        record.send_status = SendStatus.QUEUED
        if existing_job:
            existing_job.status = JobStatus.PENDING
            existing_job.scheduled_at = scheduled_at
            existing_job.last_error = None
        else:
            db.add(
                SendingJob(
                    email_record_id=record.id,
                    scheduled_at=scheduled_at,
                    status=JobStatus.PENDING,
                )
            )
        queued_count += 1

    db.commit()
    if queued_count > 0:
        background_tasks.add_task(dispatch_due_jobs)

    return {
        "generated_count": generated_count,
        "queued_count": queued_count,
        "skipped_ineligible": skipped_not_due + skipped_suppressed + skipped_other,
        "skipped_not_due": skipped_not_due,
        "skipped_suppressed": skipped_suppressed,
        "skipped_other": skipped_other,
        "errors": errors,
        "ai_quota_exhausted": ai_quota_exhausted,
    }
