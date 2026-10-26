
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.evidence import Evidence
from app.models.extracted_field import ExtractedField
from app.models.inspection import Inspection

router = APIRouter(
    prefix="/api/inspections",
    tags=["development-demo"],
)

SAMPLE_FINDINGS = [
    ("roof_type", "Asphalt shingles", 0.91),
    ("exterior_wall_type", "Stucco", 0.87),
    ("number_of_stories", "2", 0.94),
    ("foundation_type", "Concrete slab", 0.72),
]


@router.post("/{inspection_id}/demo-findings")
def create_demo_findings(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    if os.getenv("ENABLE_DEMO_DATA") != "true":
        raise HTTPException(
            status_code=404,
            detail="Demo mode is disabled",
        )

    inspection = db.get(Inspection, inspection_id)
    if inspection is None:
        raise HTTPException(404, "Inspection not found")

    evidence = (
        db.query(Evidence)
        .filter(
            Evidence.inspection_id == inspection_id,
            Evidence.evidence_type.in_(["photo", "video"]),
        )
        .order_by(Evidence.id.asc())
        .first()
    )

    if evidence is None:
        raise HTTPException(
            400,
            "Upload a test photo or video first",
        )

    # Recreate only pending demo records.
    # Keep previously reviewed demo records for testing.
    db.query(ExtractedField).filter(
        ExtractedField.inspection_id == inspection_id,
        ExtractedField.source_type == "demo",
        ExtractedField.review_status == "pending",
    ).delete(synchronize_session=False)

    for key, value, confidence in SAMPLE_FINDINGS:
        db.add(
            ExtractedField(
                inspection_id=inspection_id,
                field_key=key,
                value=value,
                source_type="demo",
                source_id=evidence.id,
                confidence=confidence,
                review_status="pending",
                reviewer_notes=(
                    "SIMULATED TEST DATA — "
                    "not derived from the uploaded evidence."
                ),
            )
        )

    db.commit()

    return {
        "inspection_id": inspection_id,
        "mode": "demo",
        "message": (
            "Simulated findings created for testing only. "
            "These are not AI observations."
        ),
        "count": len(SAMPLE_FINDINGS),
        "source_evidence_id": evidence.id,
    }

