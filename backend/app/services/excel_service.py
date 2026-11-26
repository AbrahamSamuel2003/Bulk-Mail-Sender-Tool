import csv
import io
import re
from typing import Any

from openpyxl import load_workbook

EMAIL_REGEX = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def _clean_cell(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()


def read_spreadsheet_rows(file_bytes: bytes, filename: str) -> tuple[list[str], list[dict[str, str]]]:
    """Parse .xlsx or .csv bytes into (headers, row_dicts)."""
    lower = filename.lower()
    if lower.endswith(".csv"):
        text = file_bytes.decode("utf-8-sig", errors="replace")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        if not rows:
            return [], []
        headers = [_clean_cell(h) for h in rows[0]]
        data_rows: list[dict[str, str]] = []
        for raw_row in rows[1:]:
            if not any(_clean_cell(c) for c in raw_row):
                continue
            row_dict = {
                headers[idx]: _clean_cell(raw_row[idx]) if idx < len(raw_row) else ""
                for idx in range(len(headers))
                if headers[idx]
            }
            data_rows.append(row_dict)
        return [h for h in headers if h], data_rows

    if lower.endswith(".xlsx"):
        wb = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
        ws = wb.active
        row_iter = ws.iter_rows(values_only=True)
        try:
            raw_headers = next(row_iter)
        except StopIteration:
            return [], []
        headers = [_clean_cell(h) for h in raw_headers]
        data_rows = []
        for raw_row in row_iter:
            if not any(_clean_cell(c) for c in raw_row):
                continue
            row_dict = {
                headers[idx]: _clean_cell(raw_row[idx]) if idx < len(raw_row) else ""
                for idx in range(len(headers))
                if headers[idx]
            }
            data_rows.append(row_dict)
        wb.close()
        return [h for h in headers if h], data_rows

    raise ValueError("Unsupported file format. Please upload a .xlsx or .csv file.")


def preview_spreadsheet(file_bytes: bytes, filename: str, limit: int = 5) -> dict[str, Any]:
    headers, rows = read_spreadsheet_rows(file_bytes, filename)
    return {
        "filename": filename,
        "headers": headers,
        "total_rows": len(rows),
        "sample_rows": rows[:limit],
    }


def validate_and_map_rows(
    rows: list[dict[str, str]],
    column_mapping: dict[str, str],
    existing_campaign_emails: set[str],
    suppressed_emails: set[str],
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    """
    Validate mapped spreadsheet rows with technical checks only:
    - Missing required fields (practice_name, email, subject, body)
    - Basic email format
    - Duplicate emails (in-file or already in campaign)
    - Global suppression list check
    """
    valid_rows: list[dict[str, str]] = []
    invalid_rows: list[dict[str, Any]] = []
    seen_in_file: set[str] = set()

    practice_col = column_mapping.get("practice_name", "")
    contact_col = column_mapping.get("contact_name", "")
    email_col = column_mapping.get("email", "")
    subject_col = column_mapping.get("subject", "")
    body_col = column_mapping.get("body", "")

    for idx, row in enumerate(rows, start=2):  # Row 1 is header
        practice_name = _clean_cell(row.get(practice_col, ""))
        contact_name = _clean_cell(row.get(contact_col, "")) if contact_col else ""
        email = _clean_cell(row.get(email_col, "")).lower()
        subject = _clean_cell(row.get(subject_col, ""))
        body = _clean_cell(row.get(body_col, ""))

        errors: list[str] = []
        if not practice_name:
            errors.append("Missing practice name")
        if not email:
            errors.append("Missing email address")
        elif not EMAIL_REGEX.match(email):
            errors.append("Invalid email format")
        if not subject:
            errors.append("Missing email subject")
        if not body:
            errors.append("Missing email body")

        if email:
            if email in seen_in_file:
                errors.append("Duplicate email in uploaded file")
            elif email in existing_campaign_emails:
                errors.append("Email already exists in this campaign")
            elif email in suppressed_emails:
                errors.append("Email is on global suppression list")

        if errors:
            invalid_rows.append(
                {
                    "row_number": idx,
                    "email": email or None,
                    "practice_name": practice_name or None,
                    "reasons": errors,
                }
            )
        else:
            seen_in_file.add(email)
            valid_rows.append(
                {
                    "practice_name": practice_name,
                    "contact_name": contact_name or None,
                    "email": email,
                    "subject": subject,
                    "body": body,
                }
            )

    return valid_rows, invalid_rows

