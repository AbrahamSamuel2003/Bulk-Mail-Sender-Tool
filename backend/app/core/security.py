import base64
import hashlib
import hmac
from cryptography.fernet import Fernet, InvalidToken
from fastapi import Header, HTTPException, status

from app.core.config import get_settings


def _get_fernet() -> Fernet:
    settings = get_settings()
    if settings.TOKEN_ENCRYPTION_KEY:
        key = settings.TOKEN_ENCRYPTION_KEY.encode("utf-8")
    else:
        # Deterministic fallback for local dev only when key is unset
        digest = hashlib.sha256(b"dev-insecure-fallback-key").digest()
        key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt sensitive tokens (e.g. Gmail OAuth refresh tokens) at rest."""
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt stored secret tokens."""
    try:
        return _get_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Unable to decrypt stored secret token.") from exc


def verify_app_access(x_app_password: str | None = Header(default=None)) -> None:
    """Optional simple access-password check when APP_ACCESS_PASSWORD is configured."""
    settings = get_settings()
    if settings.APP_ACCESS_PASSWORD:
        provided = x_app_password or ""
        if not hmac.compare_digest(provided, settings.APP_ACCESS_PASSWORD):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing application access password.",
            )

