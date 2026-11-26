from datetime import datetime, timezone
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.excel_service import read_spreadsheet_rows, validate_and_map_rows
from app.services.scheduling_service import calculate_followup_due_date


class TestExcelAndSchedulingServices(unittest.TestCase):
    def test_csv_parsing_and_validation(self) -> None:
        csv_bytes = (
            b"Practice,Contact,Email Address,Subject,Body\n"
            b"ABC Dental,Dr. John,john@abcdental.com,Website,Hello Dr. John\n"
            b"Dup Dental,Dr. Jane,john@abcdental.com,Website,Duplicate in file\n"
            b"Bad Email,Dr. Bob,not-an-email,Website,Invalid email\n"
            b"Suppressed,Dr. Sue,optedout@example.com,Website,Should be suppressed\n"
            b",Dr. NoName,noname@example.com,Website,Missing practice\n"
        )
        headers, rows = read_spreadsheet_rows(csv_bytes, "leads.csv")
        self.assertEqual(headers, ["Practice", "Contact", "Email Address", "Subject", "Body"])
        self.assertEqual(len(rows), 5)

        mapping = {
            "practice_name": "Practice",
            "contact_name": "Contact",
            "email": "Email Address",
            "subject": "Subject",
            "body": "Body",
        }
        valid, invalid = validate_and_map_rows(
            rows=rows,
            column_mapping=mapping,
            existing_campaign_emails={"existing@clinic.com"},
            suppressed_emails={"optedout@example.com"},
        )

        self.assertEqual(len(valid), 1)
        self.assertEqual(valid[0]["email"], "john@abcdental.com")
        self.assertEqual(len(invalid), 4)

    def test_business_day_calculation_skips_weekend(self) -> None:
        # Friday Nov 13, 2026 at 15:00 UTC + 1 business day -> Monday Nov 16, 2026
        friday = datetime(2026, 11, 13, 15, 0, tzinfo=timezone.utc)
        due = calculate_followup_due_date(
            sent_at=friday,
            interval_days=1,
            campaign_timezone="UTC",
            use_business_days=True,
        )
        self.assertEqual(due.year, 2026)
        self.assertEqual(due.month, 11)
        self.assertEqual(due.day, 16)

    def test_calendar_day_calculation_includes_weekend(self) -> None:
        friday = datetime(2026, 11, 13, 15, 0, tzinfo=timezone.utc)
        due = calculate_followup_due_date(
            sent_at=friday,
            interval_days=3,
            campaign_timezone="UTC",
            use_business_days=False,
        )
        self.assertEqual(due.day, 16)


if __name__ == "__main__":
    unittest.main()
