
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.evidence import Evidence
from app.models.extracted_field import ExtractedField
from app.models.inspection import Inspection

router = APIRouter(
    prefix="/api/inspections",
    tags=["broker-review"],
)


class ReviewDecision(BaseModel):
    decision: Literal["approved", "corrected", "rejected"]
    reviewer_value: str | None = Field(
        default=None,
        max_length=2000,
    )
    reviewer_notes: str | None = Field(
        default=None,
        max_length=5000,
    )


def require_inspection(db: Session, inspection_id: int):
    inspection = db.get(Inspection, inspection_id)
    if inspection is None:
        raise HTTPException(404, "Inspection not found")
    return inspection


def serialize_field(field: ExtractedField, evidence: Evidence | None):
    return {
        "id": field.id,
        "inspection_id": field.inspection_id,
        "field_key": field.field_key,
        "value": field.value,
        "source_type": field.source_type,
        "source_id": field.source_id,
        "confidence": field.confidence,
        "review_status": field.review_status,
        "reviewer_value": field.reviewer_value,
        "reviewer_notes": field.reviewer_notes,
        "alternatives": field.alternatives,
        "evidence": (
            {
                "id": evidence.id,
                "filename": evidence.original_filename,
                "evidence_type": evidence.evidence_type,
            }
            if evidence is not None
            else None
        ),
    }


@router.get("/{inspection_id}/review")
def get_review_queue(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    require_inspection(db, inspection_id)

    fields = (
        db.query(ExtractedField)
        .filter(ExtractedField.inspection_id == inspection_id)
        .order_by(ExtractedField.id.asc())
        .all()
    )

    evidence_ids = {
        field.source_id
        for field in fields
        if field.source_id is not None
    }

    evidence_lookup = {}

    if evidence_ids:
        evidence_lookup = {
            item.id: item
            for item in db.query(Evidence)
            .filter(
                Evidence.inspection_id == inspection_id,
                Evidence.id.in_(evidence_ids),
            )
            .all()
        }

    return {
        "inspection_id": inspection_id,
        "fields": [
            serialize_field(
                field,
                evidence_lookup.get(field.source_id),
            )
            for field in fields
        ],
    }


@router.patch("/{inspection_id}/fields/{field_id}/review")
def review_field(
    inspection_id: int,
    field_id: int,
    decision: ReviewDecision,
    db: Session = Depends(get_db),
):
    require_inspection(db, inspection_id)

    field = (
        db.query(ExtractedField)
        .filter(
            ExtractedField.id == field_id,
            ExtractedField.inspection_id == inspection_id,
        )
        .first()
    )

    if field is None:
        raise HTTPException(404, "Extracted field not found")

    if field.source_type == "mock":
        raise HTTPException(
            400,
            "Mock placeholders cannot be approved",
        )

    if decision.decision == "approved" and not (
        field.value and field.value.strip()
    ):
        raise HTTPException(
            400,
            "Cannot approve an empty AI value",
        )

    if decision.decision == "corrected" and not (
        decision.reviewer_value
        and decision.reviewer_value.strip()
    ):
        raise HTTPException(
            422,
            "A corrected value is required",
        )

    field.review_status = decision.decision

    if decision.decision == "corrected":
        field.reviewer_value = decision.reviewer_value.strip()
    else:
        field.reviewer_value = None

    field.reviewer_notes = decision.reviewer_notes

    db.commit()
    db.refresh(field)

    return serialize_field(field, None)


@router.get("/{inspection_id}/approved-fields")
def get_approved_fields(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    require_inspection(db, inspection_id)

    fields = (
        db.query(ExtractedField)
        .filter(
            ExtractedField.inspection_id == inspection_id,
            ExtractedField.review_status.in_(
                ["approved", "corrected"]
            ),
            ExtractedField.source_type != "mock",
        )
        .order_by(ExtractedField.id.asc())
        .all()
    )

    # Keep all approved candidates. Conflicting values should
    # not be silently resolved before ACORD mapping.
    return {
        "inspection_id": inspection_id,
        "status": "reviewed_candidates",
        "fields": [
            {
                "field_id": field.id,
                "field_key": field.field_key,
                "approved_value": (
                    field.reviewer_value
                    if field.review_status == "corrected"
                    else field.value
                ),
                "original_ai_value": field.value,
                "review_status": field.review_status,
                "source_evidence_id": field.source_id,
            }
            for field in fields
        ],
    }

