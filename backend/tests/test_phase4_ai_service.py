import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.ai_service import build_followup_prompt, parse_ai_email_json


class TestPhase4AIService(unittest.TestCase):
    def test_build_followup_prompt_includes_prior_history(self) -> None:
        prompt = build_followup_prompt(
            stage="follow_up_2",
            practice_name="ABC Dental",
            contact_name="Dr. John",
            campaign_name="Dental Clinics - Nov 2026",
            campaign_description="Website modernization outreach",
            prior_emails=[
                {"stage": "initial", "subject": "Website Opportunity", "body": "Initial body text"},
                {"stage": "follow_up_1", "subject": "Re: Website Opportunity", "body": "FU1 body text"},
            ],
            replies=[],
            ai_prompt_config={"tone": "polite", "signature_footer": 'Reply "no" to opt out.'},
        )
        self.assertIn("ABC Dental", prompt)
        self.assertIn("Initial body text", prompt)
        self.assertIn("FU1 body text", prompt)
        self.assertIn('Reply "no" to opt out.', prompt)

    def test_parse_ai_email_json_with_fences(self) -> None:
        raw = '```json\n{"subject": "Re: Website", "body": "Just checking in."}\n```'
        subject, body = parse_ai_email_json(raw, "Fallback")
        self.assertEqual(subject, "Re: Website")
        self.assertEqual(body, "Just checking in.")


if __name__ == "__main__":
    unittest.main()
