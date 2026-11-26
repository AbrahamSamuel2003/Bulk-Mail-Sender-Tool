from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


def get_campaign_day_bounds_utc(target_date: date, campaign_timezone: str) -> tuple[datetime, datetime]:
    """Return UTC (start_of_day, end_of_day) for a calendar date in the campaign's timezone."""
    tz = timezone.utc if campaign_timezone.upper() == "UTC" else ZoneInfo(campaign_timezone)
    start_local = datetime.combine(target_date, time.min, tzinfo=tz)
    end_local = datetime.combine(target_date, time.max, tzinfo=tz)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def get_campaign_today(campaign_timezone: str, now_utc: datetime | None = None) -> date:
    tz = timezone.utc if campaign_timezone.upper() == "UTC" else ZoneInfo(campaign_timezone)
    ref = now_utc or datetime.now(timezone.utc)
    return ref.astimezone(tz).date()


def calculate_followup_due_date(
    sent_at: datetime,
    interval_days: int,
    campaign_timezone: str,
    use_business_days: bool = True,
) -> datetime:
    """
    Calculate follow-up due date from the actual successful sent_at timestamp.
    In business-day mode, Saturdays (5) and Sundays (6) are excluded.
    """
    tz = timezone.utc if campaign_timezone.upper() == "UTC" else ZoneInfo(campaign_timezone)
    local_dt = sent_at.astimezone(tz)

    if not use_business_days:
        due_local = local_dt + timedelta(days=interval_days)
        return due_local.astimezone(timezone.utc)

    remaining = max(0, interval_days)
    current = local_dt
    while remaining > 0:
        current += timedelta(days=1)
        if current.weekday() < 5:  # Monday=0 .. Friday=4
            remaining -= 1

    return current.astimezone(timezone.utc)
