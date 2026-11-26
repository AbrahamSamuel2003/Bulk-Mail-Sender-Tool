from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models.oauth import OAuthAccount
from app.services.gmail_service import (
    exchange_code_and_store,
    get_active_sender_account,
    get_authorization_url,
    send_email_message,
    store_smtp_account,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


class SmtpConnectRequest(BaseModel):
    email: str
    password: str


class TestEmailRequest(BaseModel):
    to_email: str


@router.get("/gmail/status")
def gmail_status(db: Session = Depends(get_db)) -> dict:
    """Return active sending email account (Gmail OAuth or encrypted SMTP)."""
    account = get_active_sender_account(db)
    if not account:
        return {"connected": False, "email": None, "mode": None}
    settings = get_settings()
    return {
        "connected": True,
        "email": account.email,
        "mode": account.provider,
        "smtp_host": settings.SMTP_HOST if account.provider == "smtp" else None,
        "smtp_port": settings.SMTP_PORT if account.provider == "smtp" else None,
    }


@router.post("/smtp/connect")
def connect_smtp(payload: SmtpConnectRequest, db: Session = Depends(get_db)) -> dict:
    """Encrypt and store SMTP/IMAP sender credentials."""
    account = store_smtp_account(db, payload.email, payload.password)
    return {"connected": True, "email": account.email, "mode": "smtp"}


@router.post("/smtp/disconnect")
def disconnect_smtp(db: Session = Depends(get_db)) -> dict:
    account = db.execute(
        select(OAuthAccount).where(OAuthAccount.provider == "smtp")
    ).scalar_one_or_none()
    if account:
        db.delete(account)
        db.commit()
    return {"connected": False}


@router.post("/test-email")
def send_test_email(payload: TestEmailRequest, db: Session = Depends(get_db)) -> dict:
    """Send a single test email using the active sender account."""
    try:
        res = send_email_message(
            db=db,
            to_email=payload.to_email.strip(),
            subject="SS40 Email Outreach — Test Email",
            body="This is a test email confirming your sending account is configured properly.",
        )
        return {"sent": True, "message_id": res["message_id"]}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/gmail/url")
def gmail_auth_url() -> dict:
    """Generate Google OAuth 2.0 consent URL."""
    try:
        url, state = get_authorization_url()
        return {"auth_url": url, "state": state}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/gmail/callback")
def gmail_auth_callback(
    code: str = Query(...),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Handle Google OAuth callback, encrypt refresh token, and redirect to Settings."""
    try:
        exchange_code_and_store(db, code)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Gmail OAuth failed: {exc}") from exc
    return RedirectResponse(url="/settings?gmail=connected")


@router.post("/gmail/disconnect")
def gmail_disconnect(db: Session = Depends(get_db)) -> dict:
    """Remove stored Gmail OAuth credentials."""
    account = db.execute(
        select(OAuthAccount).where(OAuthAccount.provider == "gmail")
    ).scalar_one_or_none()
    if account:
        db.delete(account)
        db.commit()
    return {"connected": False}
