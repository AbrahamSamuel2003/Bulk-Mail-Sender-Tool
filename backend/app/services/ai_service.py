import json
import re
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from openai import OpenAI

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


class AIQuotaExhaustedError(RuntimeError):
    """Raised when all configured AI API keys/providers hit token or rate limits."""


FEW_SHOT_SYSTEM_PROMPT = """You write concise, human-written B2B follow-up emails for a Team Lead at SS40 NETWORK.

STRICT CONTEXT-LOCK & CONCISENESS RULES (MANDATORY):
1. NEVER go out of context. Every single business detail, location, service, website/listing issue, or offer (such as a free one-page PDF) MUST come strictly from the Lead Details or Previous Email History provided to you. Do NOT invent new facts, claims, pricing, case studies, or services.
2. Keep the email concise, calm, and natural — no marketing hype, no emojis, no bullet lists, no exclamation-mark spam.
3. Address the recipient naturally (e.g., "Hello Dr. Templeton," or "Hello,").
4. Respond ONLY with valid JSON: {"subject": "...", "body": "..."}.

REFERENCE EXAMPLES OF THE TEAM LEAD'S EXACT STYLE:

Example 1 (Follow-Up 1):
Initial context: Cyphers Daniel D DDS relies on third-party directory listings instead of a dedicated website; offered free 1-page PDF with 3 steps.
Ideal output body:
Hello Dr. Cyphers,

This is a follow-up to my email below.

Cyphers Daniel D DDS relies mainly on third-party directory listings rather than a dedicated practice website. The free one-page PDF shows the 3 steps to bring your services, practice details, and appointment requests together on one professional website — so patients can explore your dental services, learn about available treatments, find accurate office hours, and request appointments online, 24/7. It's yours to keep, free, with no obligation.

Would you like me to send it over? A simple "yes" is all I need.

Example 2 (Follow-Up 1):
Initial context: Thousand Hills Veterinary Clinic has no website; old listings under Thomas Animal Hospital say "might be permanently closed" with their phone number.
Ideal output body:
Hello Dr. Sneed,

This is a follow-up to my email below.

Thousand Hills Veterinary Clinic still has no website of its own, and old listings under the Thomas Animal Hospital name still appear online — one of them says that clinic "might be permanently closed," with your phone number beside it. The free one-page PDF shows the 3 easy steps to put your hours, services, and contact details on one page of your own, so a Mount Vernon pet owner who finds that page doesn't think you've shut down. It's yours to keep, free, with no obligation.

Would you like me to send it over? A simple "yes" is all I need.

Example 3 (Follow-Up 1):
Initial context: Note about drmarashi.com accessibility check (screen readers and keyboards) + free 1-page PDF.
Ideal output body:
Hello Dr. Marashi,

A quick follow-up on my note below. The one-page PDF covers the 3 steps to check how drmarashi.com works with screen readers and keyboards, and what to fix first, so patients who rely on those tools reach your consultation page. It's yours to keep, free, with no obligation.

Would you like it sent over?
"""


def get_ai_clients_for_provider(provider_override: str | None = None) -> list[tuple["OpenAI", str, str]]:
    """Return ordered list of (client, model, label) candidates including fallback keys."""
    from openai import OpenAI
    from app.core.config import get_settings

    settings = get_settings()
    provider = (provider_override or settings.AI_PROVIDER or "groq").lower().strip()
    candidates: list[tuple["OpenAI", str, str]] = []

    if provider == "groq":
        if settings.GROQ_API_KEY:
            candidates.append(
                (OpenAI(api_key=settings.GROQ_API_KEY, base_url=GROQ_BASE_URL, timeout=25.0), settings.GROQ_MODEL, "groq-primary")
            )
        if settings.GROQ_FALLBACK_API_KEY:
            candidates.append(
                (OpenAI(api_key=settings.GROQ_FALLBACK_API_KEY, base_url=GROQ_BASE_URL, timeout=25.0), settings.GROQ_MODEL, "groq-fallback")
            )
        if settings.GEMINI_API_KEY:
            candidates.append(
                (OpenAI(api_key=settings.GEMINI_API_KEY, base_url=GEMINI_BASE_URL, timeout=25.0), settings.GEMINI_MODEL, "gemini-fallback")
            )
        if not candidates:
            raise ValueError("GROQ_API_KEY is not configured.")
        return candidates

    if provider == "gemini":
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not configured.")
        return [(OpenAI(api_key=settings.GEMINI_API_KEY, base_url=GEMINI_BASE_URL, timeout=25.0), settings.GEMINI_MODEL, "gemini")]

    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is not configured.")
        return [(OpenAI(api_key=settings.OPENAI_API_KEY, timeout=25.0), settings.OPENAI_DEFAULT_MODEL, "openai")]

    raise ValueError(f"Unsupported AI provider: {provider}")


def get_ai_client_and_model(provider_override: str | None = None) -> tuple["OpenAI", str]:
    """Return primary (client, model) for backward-compatible callers."""
    client, model, _ = get_ai_clients_for_provider(provider_override)[0]
    return client, model


def build_followup_prompt(
    stage: Any,
    practice_name: str,
    contact_name: str | None,
    campaign_name: str,
    campaign_description: str | None,
    prior_emails: list[dict[str, str]],
    replies: list[dict[str, str]],
    ai_prompt_config: dict[str, Any],
) -> str:
    """Construct a context-locked, stage-specific prompt using full prior email & reply history."""
    stage_key = stage.value if hasattr(stage, "value") else str(stage)
    stage_guidance = {
        "follow_up_1": (
            "Write Follow-Up 1 (60–90 words before signature). "
            "Open with 'This is a follow-up to my email below.' or 'A quick follow-up on my note below.' "
            "Briefly restate ONLY the exact finding and offer from the Initial email and explain its practical impact. "
            "End with a soft question such as: 'Would you like me to send it over? A simple \"yes\" is all I need.'"
        ),
        "follow_up_2": (
            "Write Follow-Up 2 (45–65 words before signature). "
            "Do NOT repeat Follow-Up 1 word-for-word. Give a brief, polite nudge referencing the same core benefit "
            "from the Initial email in fewer words, with a low-pressure question to reply."
        ),
        "follow_up_3": (
            "Write Follow-Up 3 — the FINAL follow-up (30–50 words before signature). "
            "Keep it ultra-short, respectful, and zero-pressure (e.g., letting them know this is your final check-in "
            "and they can reply anytime if helpful). Do NOT repeat earlier paragraphs."
        ),
    }.get(stage_key, "Write a concise, polite follow-up email (50–80 words).")

    tone = ai_prompt_config.get("tone", "professional, polite, natural, human-written")
    restrictions = ai_prompt_config.get(
        "restrictions",
        "NEVER invent facts, locations, services, or claims not explicitly present in Previous Email History.",
    )
    signature_footer = ai_prompt_config.get(
        "signature_footer",
        'Reply "no" and you won\'t hear from me again.',
    )

    history_lines = []
    for item in prior_emails:
        history_lines.append(
            f"[{item['stage'].upper()}] Subject: {item['subject']}\nBody:\n{item['body']}"
        )
    history_block = "\n\n---\n\n".join(history_lines) if history_lines else "None"

    reply_block = (
        "\n\n".join(f"From {r['sender']}: {r['body']}" for r in replies)
        if replies
        else "None"
    )

    return (
        f"Task: {stage_guidance}\n\n"
        f"Lead Details:\n"
        f"- Practice Name: {practice_name}\n"
        f"- Contact Name: {contact_name or 'N/A'}\n"
        f"- Campaign: {campaign_name}\n"
        f"- Campaign Context: {campaign_description or 'General outreach'}\n\n"
        f"Rules:\n"
        f"- Tone: {tone}\n"
        f"- Strict Context-Lock: {restrictions}\n"
        f"- Include this opt-out line at the very bottom: {signature_footer}\n\n"
        f"Previous Email History (ONLY source of truth for facts):\n{history_block}\n\n"
        f"Reply History:\n{reply_block}\n\n"
        f'Respond ONLY with valid JSON: {{"subject": "...", "body": "..."}}.'
    )


def parse_ai_email_json(raw_text: str, fallback_subject: str) -> tuple[str, str]:
    """Parse JSON response from LLM, stripping markdown code fences if present."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()

    try:
        parsed = json.loads(cleaned)
        subject = str(parsed.get("subject") or fallback_subject).strip()
        body = str(parsed.get("body") or "").strip()
        if body:
            body = re.sub(r"\n{3,}", "\n\n", body)
            return subject, body
    except json.JSONDecodeError:
        pass

    return fallback_subject, cleaned


def _is_quota_or_rate_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(
        token in msg
        for token in ("429", "402", "401", "rate_limit", "rate limit", "quota", "insufficient", "tokens", "limit exceeded")
    )


def _call_chat_completion(client: "OpenAI", model: str, prompt: str) -> str:
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": FEW_SHOT_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.35,
        "max_tokens": 2048,
    }
    try:
        resp = client.chat.completions.create(**kwargs, response_format={"type": "json_object"})
    except Exception:
        resp = client.chat.completions.create(**kwargs)
    return (resp.choices[0].message.content or "").strip()


def generate_followup_email(
    stage: Any,
    practice_name: str,
    contact_name: str | None,
    campaign_name: str,
    campaign_description: str | None,
    prior_emails: list[dict[str, str]],
    replies: list[dict[str, str]],
    ai_prompt_config: dict[str, Any],
    provider_override: str | None = None,
) -> dict[str, str]:
    """Generate a non-empty, context-locked follow-up email with automatic Groq fallback."""
    candidates = get_ai_clients_for_provider(provider_override)
    prompt = build_followup_prompt(
        stage=stage,
        practice_name=practice_name,
        contact_name=contact_name,
        campaign_name=campaign_name,
        campaign_description=campaign_description,
        prior_emails=prior_emails,
        replies=replies,
        ai_prompt_config=ai_prompt_config,
    )

    original_subject = prior_emails[0]["subject"] if prior_emails else "Following up"
    fallback_subject = (
        original_subject if original_subject.lower().startswith("re:") else f"Re: {original_subject}"
    )

    last_quota_error: Exception | None = None
    last_error: Exception | None = None

    for client, model, _label in candidates:
        for _attempt in range(2):
            try:
                content = _call_chat_completion(client, model, prompt)
                subject, body = parse_ai_email_json(content, fallback_subject)
                if body.strip():
                    return {
                        "model": model,
                        "prompt_snapshot": prompt,
                        "subject": subject,
                        "body": body,
                    }
            except Exception as exc:
                last_error = exc
                if _is_quota_or_rate_error(exc):
                    last_quota_error = exc
                    break  # Try next fallback key

    if last_quota_error is not None:
        raise AIQuotaExhaustedError(
            f"All configured AI API keys exhausted or rate-limited: {last_quota_error}"
        ) from last_quota_error

    raise ValueError(f"AI failed to generate a non-empty email body: {last_error or 'Empty response'}")
