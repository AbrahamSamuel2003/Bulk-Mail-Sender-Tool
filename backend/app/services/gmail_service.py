import base64
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.utils import make_msgid
import smtplib
import ssl
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decrypt_secret, encrypt_secret
from app.models.oauth import OAuthAccount

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]


def _build_client_config() -> dict[str, Any]:
    settings = get_settings()
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise ValueError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.")
    return {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
        }
    }


def create_oauth_flow(state: str | None = None) -> Flow:
    settings = get_settings()
    flow = Flow.from_client_config(
        _build_client_config(),
        scopes=GMAIL_SCOPES,
        state=state,
    )
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    return flow


def get_authorization_url() -> tuple[str, str]:
    flow = create_oauth_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url, state


def exchange_code_and_store(db: Session, code: str) -> OAuthAccount:
    flow = create_oauth_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    if not creds.refresh_token:
        existing = db.execute(
            select(OAuthAccount).where(OAuthAccount.provider == "gmail")
        ).scalar_one_or_none()
        if not existing:
            raise ValueError(
                "Google did not return a refresh token. Revoke app access and reconnect with consent."
            )
        encrypted_refresh = existing.encrypted_refresh_token
    else:
        encrypted_refresh = encrypt_secret(creds.refresh_token)

    gmail_service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    profile = gmail_service.users().getProfile(userId="me").execute()
    email_address = profile.get("emailAddress", "")
    history_id = profile.get("historyId")

    account = db.execute(
        select(OAuthAccount).where(OAuthAccount.provider == "gmail")
    ).scalar_one_or_none()

    encrypted_access = encrypt_secret(creds.token) if creds.token else None
    expiry = creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry and creds.expiry.tzinfo is None else creds.expiry

    if account:
        account.email = email_address
        account.encrypted_refresh_token = encrypted_refresh
        account.encrypted_access_token = encrypted_access
        account.token_expiry = expiry
        if history_id:
            account.gmail_history_id = str(history_id)
    else:
        account = OAuthAccount(
            provider="gmail",
            email=email_address,
            encrypted_refresh_token=encrypted_refresh,
            encrypted_access_token=encrypted_access,
            token_expiry=expiry,
            gmail_history_id=str(history_id) if history_id else None,
        )
        db.add(account)

    db.commit()
    db.refresh(account)
    return account


def store_smtp_account(db: Session, email_address: str, password: str) -> OAuthAccount:
    """Securely encrypt and store an SMTP/IMAP sender account in oauth_accounts."""
    normalized = email_address.strip().lower()
    encrypted_pw = encrypt_secret(password)
    account = db.execute(
        select(OAuthAccount).where(OAuthAccount.provider == "smtp")
    ).scalar_one_or_none()
    if account:
        account.email = normalized
        account.encrypted_refresh_token = encrypted_pw
    else:
        account = OAuthAccount(
            provider="smtp",
            email=normalized,
            encrypted_refresh_token=encrypted_pw,
        )
        db.add(account)
    db.commit()
    db.refresh(account)
    return account


def get_active_sender_account(db: Session) -> OAuthAccount | None:
    """Return connected Gmail OAuth account if present, otherwise SMTP account."""
    gmail = db.execute(
        select(OAuthAccount).where(OAuthAccount.provider == "gmail")
    ).scalar_one_or_none()
    if gmail:
        return gmail
    return db.execute(
        select(OAuthAccount).where(OAuthAccount.provider == "smtp")
    ).scalar_one_or_none()


def get_gmail_credentials(db: Session) -> tuple[Credentials, OAuthAccount]:
    settings = get_settings()
    account = db.execute(
        select(OAuthAccount).where(OAuthAccount.provider == "gmail")
    ).scalar_one_or_none()
    if not account:
        raise RuntimeError("Gmail OAuth account is not connected.")

    refresh_token = decrypt_secret(account.encrypted_refresh_token)
    access_token = (
        decrypt_secret(account.encrypted_access_token)
        if account.encrypted_access_token
        else None
    )

    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=GMAIL_SCOPES,
    )

    if not creds.valid or creds.expired:
        creds.refresh(Request())
        account.encrypted_access_token = encrypt_secret(creds.token) if creds.token else None
        if creds.expiry:
            account.token_expiry = (
                creds.expiry.replace(tzinfo=timezone.utc)
                if creds.expiry.tzinfo is None
                else creds.expiry
            )
        db.commit()

    return creds, account


def _send_via_smtp(
    account: OAuthAccount,
    to_email: str,
    subject: str,
    body: str,
    in_reply_to: str | None = None,
    references: str | None = None,
) -> dict[str, str]:
    settings = get_settings()
    password = decrypt_secret(account.encrypted_refresh_token)
    domain = account.email.split("@")[-1] if "@" in account.email else "localhost"
    msg_id = make_msgid(domain=domain)

    message = MIMEText(body, "plain", "utf-8")
    message["From"] = account.email
    message["To"] = to_email
    message["Subject"] = subject
    message["Message-ID"] = msg_id
    if in_reply_to:
        message["In-Reply-To"] = in_reply_to
    if references:
        message["References"] = references

    context = ssl.create_default_context()
    if settings.SMTP_PORT == 465:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=context, timeout=30) as server:
            server.login(account.email, password)
            server.send_message(message)
    else:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(account.email, password)
            server.send_message(message)

    return {
        "message_id": msg_id,
        "thread_id": references.split()[0] if references else msg_id,
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }


def send_email_message(
    db: Session,
    to_email: str,
    subject: str,
    body: str,
    thread_id: str | None = None,
    in_reply_to: str | None = None,
    references: str | None = None,
) -> dict[str, str]:
    """Send an individual email via connected Gmail OAuth or encrypted SMTP account."""
    account = get_active_sender_account(db)
    if not account:
        raise RuntimeError("No sending email account is connected.")

    if account.provider == "smtp":
        return _send_via_smtp(
            account=account,
            to_email=to_email,
            subject=subject,
            body=body,
            in_reply_to=in_reply_to or thread_id,
            references=references or thread_id,
        )

    creds, gmail_acc = get_gmail_credentials(db)
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)

    message = MIMEText(body, "plain", "utf-8")
    message["To"] = to_email
    message["From"] = gmail_acc.email
    message["Subject"] = subject

    if in_reply_to:
        message["In-Reply-To"] = in_reply_to
    if references:
        message["References"] = references

    raw_bytes = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    payload: dict[str, Any] = {"raw": raw_bytes}
    if thread_id:
        payload["threadId"] = thread_id

    sent = service.users().messages().send(userId="me", body=payload).execute()
    return {
        "message_id": sent["id"],
        "thread_id": sent.get("threadId", ""),
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }
