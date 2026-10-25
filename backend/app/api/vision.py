
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.evidence import Evidence
from app.models.extracted_field import ExtractedField
from app.models.inspection import Inspection
from app.services.property_vision import (
    FIELDS,
    analyze_images,
    get_evidence_images,
)

router = APIRouter(
    prefix="/api/inspections",
    tags=["property-vision"],
)


@router.post("/{inspection_id}/analyze")
def analyze_property_evidence(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    inspection = db.get(Inspection, inspection_id)

    if inspection is None:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found",
        )

    evidence_files = (
        db.query(Evidence)
        .filter(
            Evidence.inspection_id == inspection_id,
            Evidence.evidence_type.in_(["photo", "video"]),
        )
        .order_by(Evidence.id.asc())
        .all()
    )

    if not evidence_files:
        raise HTTPException(
            status_code=400,
            detail="Upload at least one photo or video first",
        )

    live_mode = bool(os.getenv("OPENAI_API_KEY"))
    prepared = []
    errors = []
    findings_to_save = []

    photo_count = 0
    video_count = 0
    frame_count = 0

    for evidence in evidence_files:
        try:
            images = get_evidence_images(
                evidence.storage_key,
                evidence.evidence_type,
            )

            if not images:
                continue

            prepared.append({
                "evidence_id": evidence.id,
                "filename": evidence.original_filename,
                "image_count": len(images),
            })

            if evidence.evidence_type == "photo":
                photo_count += 1
            else:
                video_count += 1
                frame_count += len(images)

            if not live_mode:
                continue

            # Analyze each uploaded file independently so every
            # finding can reference its source evidence ID.
            findings = analyze_images(images)

            for finding in findings:
                findings_to_save.append({
                    **finding,
                    "source_id": evidence.id,
                })

        except Exception as exc:
            errors.append({
                "evidence_id": evidence.id,
                "error": str(exc)[:500],
            })

    if live_mode:
        if errors:
            # Do not replace prior results with partial analysis.
            raise HTTPException(
                status_code=502,
                detail={
                    "message": (
                        "One or more evidence files could not "
                        "be analyzed. Existing findings were preserved."
                    ),
                    "errors": errors,
                },
            )

        try:
            # Preserve manually reviewed records and old mock
            # records. Replace only unreviewed AI candidates.
            db.query(ExtractedField).filter(
                ExtractedField.inspection_id == inspection_id,
                ExtractedField.source_type == "ai_vision",
                ExtractedField.review_status == "pending",
            ).delete(synchronize_session=False)

            for finding in findings_to_save:
                db.add(
                    ExtractedField(
                        inspection_id=inspection_id,
                        field_key=finding["field_key"],
                        value=finding["value"],
                        source_type="ai_vision",
                        source_id=finding["source_id"],
                        confidence=finding["confidence"],
                        review_status="pending",
                        alternatives=None,
                        reviewer_notes=finding["explanation"],
                    )
                )

            db.commit()
        except Exception:
            db.rollback()
            raise

    return {
        "inspection_id": inspection_id,
        "mode": "live" if live_mode else "mock",
        "message": (
            "AI analysis completed. Findings require review."
            if live_mode
            else "Evidence prepared. Waiting for OpenAI API key."
        ),
        "photo_count": photo_count,
        "video_count": video_count,
        "frame_count": frame_count,
        "prepared_evidence": prepared,
        "errors": errors,
        "fields": [
            {
                "field_key": finding["field_key"],
                "label": FIELDS[finding["field_key"]],
                "value": finding["value"],
                "confidence": finding["confidence"],
                "source_type": "ai_vision",
                "source_id": finding["source_id"],
                "review_status": "pending",
            }
            for finding in findings_to_save
        ],
    }
