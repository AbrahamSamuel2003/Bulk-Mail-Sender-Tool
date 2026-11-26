import re

BOUNCE_SENDERS = ("mailer-daemon@", "postmaster@")
BOUNCE_SUBJECT_HINTS = (
    "delivery status notification",
    "undeliverable",
    "mail delivery failed",
    "returned mail",
    "failure notice",
)
PERMANENT_DSN_RE = re.compile(r"\b5\.\d+\.\d+\b|\b550\b|\b551\b|\b552\b|\b553\b|\b554\b")
TRANSIENT_DSN_RE = re.compile(r"\b4\.\d+\.\d+\b|\b421\b|\b450\b|\b451\b|\b452\b")

UNSUBSCRIBE_PHRASES = (
    "unsubscribe",
    "remove me",
    "take me off",
    "stop emailing",
    "stop contacting",
    "opt out",
    "opt-out",
    "do not contact",
    "don't email",
    "dont email",
)


def is_bounce_message(sender_email: str, subject: str | None, body: str | None) -> bool:
    sender_lower = (sender_email or "").lower()
    if any(token in sender_lower for token in BOUNCE_SENDERS):
        return True
    subj_lower = (subject or "").lower()
    if any(hint in subj_lower for hint in BOUNCE_SUBJECT_HINTS):
        return True
    return False


def is_permanent_bounce(body: str | None) -> bool:
    """Distinguish permanent 5.x.x / 550-554 bounces from temporary 4.x.x failures."""
    text = body or ""
    if PERMANENT_DSN_RE.search(text):
        return True
    if TRANSIENT_DSN_RE.search(text):
        return False
    return True


def is_unsubscribe_reply(body: str | None) -> bool:
    """Detect explicit opt-out phrases or standalone 'no' reply per CAN-SPAM footer."""
    if not body:
        return False
    lines = [line.strip().lower() for line in body.splitlines() if line.strip()]
    if not lines:
        return False
    # Check first non-empty line for standalone "no" or "no." or "no thanks"
    first_line = re.sub(r"[.!?,]+$", "", lines[0])
    if first_line in ("no", "no thanks", "no thank you", "stop"):
        return True

    full_lower = body.lower()
    return any(phrase in full_lower for phrase in UNSUBSCRIBE_PHRASES)

