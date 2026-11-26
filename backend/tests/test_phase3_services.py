from datetime import date, datetime, timezone
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.scheduling_service import get_campaign_day_bounds_utc, get_campaign_today


class TestPhase3DateFiltering(unittest.TestCase):
    def test_campaign_day_bounds_utc(self) -> None:
        d = date(2026, 11, 25)
        start, end = get_campaign_day_bounds_utc(d, "UTC")
        self.assertEqual(start, datetime(2026, 11, 25, 0, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(end.hour, 23)
        self.assertEqual(end.minute, 59)

    def test_get_campaign_today_utc(self) -> None:
        ref = datetime(2026, 11, 25, 18, 30, tzinfo=timezone.utc)
        self.assertEqual(get_campaign_today("UTC", ref), date(2026, 11, 25))


if __name__ == "__main__":
    unittest.main()

