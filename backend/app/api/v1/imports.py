import json
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.campaign import Campaign, CampaignImport
from app.models.email_record import EmailRecord
from app.models.enums import EmailStage, LeadStage, LeadStatus, SendStatus
from app.models.lead import Lead
from app.models.suppression import SuppressionList
from app.services.excel_service import preview_spreadsheet, read_spreadsheet_rows, validate_and_map_rows

router = APIRouter(prefix="/campaigns/{campaign_id}/imports", tags=["Imports"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


def _get_campaign_or_404(db: Session, campaign_id: uuid.UUID) -> Campaign:
    campaign = db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return campaign


@router.post("/preview")
async def preview_import(
    campaign_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict:
    """Read uploaded .xlsx or .csv and return detected columns + sample rows."""
    _get_campaign_or_404(db, campaign_id)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")

    try:
        return preview_spreadsheet(contents, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/commit")
async def commit_import(
    campaign_id: uuid.UUID,
    file: UploadFile = File(...),
    column_mapping: str = Form(...),
    default_subject: str | None = Form(None),
    db: Session = Depends(get_db),
) -> dict:
    """Validate mapped rows and insert valid leads + initial draft email_records."""
    _get_campaign_or_404(db, campaign_id)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")

    try:
        mapping = json.loads(column_mapping)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid column_mapping JSON.") from exc

    clean_default_subject = (default_subject or "").strip()
    required_keys = {"practice_name", "email", "body"}
    if not clean_default_subject:
        required_keys.add("subject")
    missing_keys = [k for k in sorted(required_keys) if not mapping.get(k)]
    if missing_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required column mappings: {', '.join(missing_keys)}",
        )

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")

    try:
        _, rows = read_spreadsheet_rows(contents, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing_emails = set(
        db.scalars(select(Lead.email).where(Lead.campaign_id == campaign_id)).all()
    )
    suppressed_emails = set(db.scalars(select(SuppressionList.email)).all())

    valid_rows, invalid_rows = validate_and_map_rows(
        rows=rows,
        column_mapping=mapping,
        existing_campaign_emails=existing_emails,
        suppressed_emails=suppressed_emails,
        default_subject=clean_default_subject,
    )

    for row in valid_rows:
        lead = Lead(
            campaign_id=campaign_id,
            practice_name=row["practice_name"],
            contact_name=row["contact_name"],
            email=row["email"],
            current_stage=LeadStage.NEW,
            status=LeadStatus.ACTIVE,
        )
        db.add(lead)
        db.flush()

        draft = EmailRecord(
            lead_id=lead.id,
            campaign_id=campaign_id,
            stage=EmailStage.INITIAL,
            subject=row["subject"],
            body=row["body"],
            ai_generated=False,
            send_status=SendStatus.DRAFT,
        )
        db.add(draft)

    import_log = CampaignImport(
        campaign_id=campaign_id,
        filename=file.filename,
        total_rows=len(rows),
        imported_rows=len(valid_rows),
        invalid_rows=len(invalid_rows),
        column_mapping=mapping,
        error_report=invalid_rows,
    )
    db.add(import_log)
    db.commit()

    return {
        "total_rows": len(rows),
        "imported_count": len(valid_rows),
        "invalid_count": len(invalid_rows),
        "invalid_rows": invalid_rows,
    }

