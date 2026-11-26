from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo


def parse_hhmm(value: str) -> time:
    parts = value.strip().split(":")
    return time(hour=int(parts[0]), minute=int(parts[1]))


def is_within_sending_window(
    now_utc: datetime,
    window_start: str,
    window_end: str,
    tz_name: str,
) -> bool:
    """Check whether now_utc falls inside [window_start, window_end] in tz_name."""
    tz = timezone.utc if tz_name.upper() == "UTC" else ZoneInfo(tz_name)
    local_time = now_utc.astimezone(tz).time().replace(tzinfo=None)
    start_t = parse_hhmm(window_start)
    end_t = parse_hhmm(window_end)
    if start_t <= end_t:
        return start_t <= local_time <= end_t
    # Overnight window (e.g. 22:00 - 06:00)
    return local_time >= start_t or local_time <= end_t

