from datetime import datetime, timezone
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.bounce_parser import (
    is_bounce_message,
    is_permanent_bounce,
    is_unsubscribe_reply,
)
from app.services.queue_service import is_within_sending_window


class TestPhase5And6Services(unittest.TestCase):
    def test_sending_window_utc(self) -> None:
        inside = datetime(2026, 11, 25, 14, 0, tzinfo=timezone.utc)
        outside = datetime(2026, 11, 25, 20, 0, tzinfo=timezone.utc)
        self.assertTrue(is_within_sending_window(inside, "09:00", "17:00", "UTC"))
        self.assertFalse(is_within_sending_window(outside, "09:00", "17:00", "UTC"))

    def test_bounce_detection_permanent_vs_transient(self) -> None:
        self.assertTrue(
            is_bounce_message(
                "mailer-daemon@googlemail.com",
                "Delivery Status Notification (Failure)",
                "550 5.1.1 The email account does not exist.",
            )
        )
        self.assertTrue(is_permanent_bounce("550 5.1.1 User unknown"))
        self.assertFalse(is_permanent_bounce("451 4.2.1 Mailbox temporarily busy"))

    def test_unsubscribe_detection(self) -> None:
        self.assertTrue(is_unsubscribe_reply("Please remove me from your email list."))
        self.assertTrue(is_unsubscribe_reply("No\n\nOn Nov 25, wrote:"))
        self.assertFalse(is_unsubscribe_reply("Sure, let's schedule a call next Tuesday!"))


if __name__ == "__main__":
    unittest.main()

