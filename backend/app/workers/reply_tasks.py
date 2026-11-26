import base64
from datetime import datetime, timezone
import email as email_stdlib
from email.utils import parseaddr, parsedate_to_datetime
import imaplib
from typing import Any

from googleapiclient.discovery import build
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.security import decrypt_secret
from app.models.email_record import EmailRecord
from app.models.enums import JobStatus, LeadStatus, SuppressionReason
from app.models.lead import Lead
from app.models.reply import Reply
from app.models.sending import SendingJob
from app.models.suppression import SuppressionList
from app.services.bounce_parser import is_bounce_message, is_permanent_bounce
from app.services.gmail_service import get_active_sender_account, get_gmail_credentials


def _extract_plain_body(payload: dict[str, Any]) -> str:
    if payload.get("mimeType") == "text/plain" and payload.get("body", {}).get("data"):
        return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="replace")
    for part in payload.get("parts", []) or []:
        text = _extract_plain_body(part)
        if text:
            return text
    return ""


def _extract_imap_body(msg: email_stdlib.message.Message) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and not part.get("Content-Disposition"):
                raw = part.get_payload(decode=True)
                if raw:
                    return raw.decode(part.get_content_charset() or "utf-8", errors="replace")
        return ""
    raw = msg.get_payload(decode=True)
    return raw.decode(msg.get_content_charset() or "utf-8", errors="replace") if raw else ""


def _cancel_pending_jobs(db, lead_id) -> None:
    rec_ids = db.scalars(select(EmailRecord.id).where(EmailRecord.lead_id == lead_id)).all()
    if not rec_ids:
        return
    jobs = db.scalars(
        select(SendingJob).where(
            SendingJob.email_record_id.in_(rec_ids),
            SendingJob.status == JobStatus.PENDING,
        )
    ).all()
    for job in jobs:
        job.status = JobStatus.CANCELLED


def _record_reply_or_bounce(
    db,
    lead: Lead,
    msg_id: str,
    thread_id: str | None,
    received_at: datetime,
    sender_email: str,
    subject: str,
    body: str,
) -> None:
    db.add(
        Reply(
            lead_id=lead.id,
            provider_message_id=msg_id,
            provider_thread_id=thread_id,
            received_at=received_at,
            sender_email=sender_email,
            subject=subject,
            body=body,
        )
    )
    if is_bounce_message(sender_email, subject, body):
        if is_permanent_bounce(body):
            lead.status = LeadStatus.BOUNCED
            _cancel_pending_jobs(db, lead.id)
            if not db.execute(
                select(SuppressionList).where(SuppressionList.email == lead.email.lower())
            ).scalar_one_or_none():
                db.add(
                    SuppressionList(
                        email=lead.email.lower(),
                        reason=SuppressionReason.BOUNCED,
                        notes=f"Permanent bounce detected: {subject}",
                    )
                )
    else:
        lead.status = LeadStatus.REPLIED
        _cancel_pending_jobs(db, lead.id)


def _poll_imap_inbox(db, account) -> dict:
    settings = get_settings()
    password = decrypt_secret(account.encrypted_refresh_token)
    processed = 0

    with imaplib.IMAP4_SSL(settings.IMAP_HOST, settings.IMAP_PORT) as mail:
        mail.login(account.email, password)
        mail.select("INBOX")
        status, data = mail.search(None, "ALL")
        if status != "OK" or not data or not data[0]:
            return {"status": "ok", "processed": 0}

        uid_list = data[0].split()[-25:]
        for uid in uid_list:
            res_status, msg_data = mail.fetch(uid, "(RFC822)")
            if res_status != "OK" or not msg_data or not msg_data[0]:
                continue
            raw_bytes = msg_data[0][1]
            if not isinstance(raw_bytes, (bytes, bytearray)):
                continue
            parsed = email_stdlib.message_from_bytes(raw_bytes)
            msg_id = (parsed.get("Message-ID") or f"imap-{uid.decode()}").strip()
            if db.execute(select(Reply).where(Reply.provider_message_id == msg_id)).scalar_one_or_none():
                continue

            _, sender_email = parseaddr(parsed.get("From", ""))
            sender_email = sender_email.lower()
            if not sender_email or sender_email == account.email.lower():
                continue

            in_reply_to = (parsed.get("In-Reply-To") or "").strip()
            matched_record = None
            if in_reply_to:
                matched_record = db.execute(
                    select(EmailRecord).where(EmailRecord.provider_message_id == in_reply_to)
                ).scalar_one_or_none()

            lead = db.get(Lead, matched_record.lead_id) if matched_record else None
            if not lead:
                lead = db.execute(
                    select(Lead).where(Lead.email == sender_email).order_by(Lead.created_at.desc())
                ).scalar_one_or_none()
            if not lead:
                continue

            try:
                received_at = parsedate_to_datetime(parsed.get("Date", ""))
                if received_at.tzinfo is None:
                    received_at = received_at.replace(tzinfo=timezone.utc)
            except Exception:
                received_at = datetime.now(timezone.utc)

            _record_reply_or_bounce(
                db=db,
                lead=lead,
                msg_id=msg_id,
                thread_id=in_reply_to or None,
                received_at=received_at,
                sender_email=sender_email,
                subject=parsed.get("Subject", "") or "",
                body=_extract_imap_body(parsed),
            )
            processed += 1

    db.commit()
    return {"status": "ok", "processed": processed}


def poll_gmail_inbox() -> dict:
    """Poll connected inbox (Gmail OAuth or IMAP) for replies and bounces."""
    db = SessionLocal()
    processed = 0
    try:
        account = get_active_sender_account(db)
        if not account:
            return {"status": "skipped", "reason": "email_not_connected"}

        if account.provider == "smtp":
            return _poll_imap_inbox(db, account)

        creds, gmail_acc = get_gmail_credentials(db)
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        msg_list = service.users().messages().list(userId="me", q="in:inbox", maxResults=25).execute()
        messages = msg_list.get("messages", []) or []

        for item in messages:
            msg_id = item["id"]
            if db.execute(select(Reply).where(Reply.provider_message_id == msg_id)).scalar_one_or_none():
                continue

            full_msg = service.users().messages().get(userId="me", id=msg_id, format="full").execute()
            thread_id = full_msg.get("threadId")
            headers = {
                h["name"].lower(): h["value"]
                for h in full_msg.get("payload", {}).get("headers", [])
            }
            _, sender_email = parseaddr(headers.get("from", ""))
            sender_email = sender_email.lower()
            if not sender_email or sender_email == gmail_acc.email.lower():
                continue

            matched_record = (
                db.execute(
                    select(EmailRecord).where(EmailRecord.provider_thread_id == thread_id)
                ).scalar_one_or_none()
                if thread_id
                else None
            )
            if not matched_record:
                continue

            lead = db.get(Lead, matched_record.lead_id)
            if not lead:
                continue

            internal_ms = int(full_msg.get("internalDate", 0))
            received_at = (
                datetime.fromtimestamp(internal_ms / 1000.0, tz=timezone.utc)
                if internal_ms
                else datetime.now(timezone.utc)
            )

            _record_reply_or_bounce(
                db=db,
                lead=lead,
                msg_id=msg_id,
                thread_id=thread_id,
                received_at=received_at,
                sender_email=sender_email,
                subject=headers.get("subject", ""),
                body=_extract_plain_body(full_msg.get("payload", {})),
            )
            processed += 1

        db.commit()
        return {"status": "ok", "processed": processed}
    finally:
        db.close()
