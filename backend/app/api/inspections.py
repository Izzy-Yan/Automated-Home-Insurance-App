
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.answer import Answer
from app.models.evidence import Evidence
from app.models.extracted_field import ExtractedField
from app.models.inspection import Inspection
from app.models.property import Property
from app.schemas.inspection import (
    AnswerCreate,
    AnswerResponse,
    EvidenceCreate,
    EvidenceResponse,
    ExtractedFieldResponse,
    InspectionCreate,
    InspectionDetailResponse,
    InspectionResponse,
)


router = APIRouter(
    prefix="/api/inspections",
    tags=["inspections"],
)

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"

MAX_UPLOAD_SIZE = 250 * 1024 * 1024  # 250 MB

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "video/mp4",
    "video/quicktime",
    "application/pdf",
}


# --------------------------------------------------
# CREATE INSPECTION
# --------------------------------------------------

@router.post(
    "/",
    response_model=InspectionResponse,
    status_code=201,
)
def create_inspection(
    inspection_data: InspectionCreate,
    db: Session = Depends(get_db),
):
    property_record = (
        db.query(Property)
        .filter(Property.id == inspection_data.property_id)
        .first()
    )

    if property_record is None:
        raise HTTPException(
            status_code=404,
            detail="Property not found",
        )

    new_inspection = Inspection(
        property_id=inspection_data.property_id,
        status="draft",
    )

    db.add(new_inspection)
    db.commit()
    db.refresh(new_inspection)

    return new_inspection


# --------------------------------------------------
# GET INSPECTION DETAILS
# --------------------------------------------------

@router.get(
    "/{inspection_id}",
    response_model=InspectionDetailResponse,
)
def get_inspection(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    inspection = (
        db.query(Inspection)
        .filter(Inspection.id == inspection_id)
        .first()
    )

    if inspection is None:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found",
        )

    return inspection


# --------------------------------------------------
# CREATE OR UPDATE QUESTIONNAIRE ANSWER
# --------------------------------------------------

@router.post(
    "/{inspection_id}/answers",
    response_model=AnswerResponse,
    status_code=201,
)
def save_answer(
    inspection_id: int,
    answer_data: AnswerCreate,
    db: Session = Depends(get_db),
):
    inspection = (
        db.query(Inspection)
        .filter(Inspection.id == inspection_id)
        .first()
    )

    if inspection is None:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found",
        )

    # Check whether this question already has an answer.
    existing_answer = (
        db.query(Answer)
        .filter(
            Answer.inspection_id == inspection_id,
            Answer.question_key == answer_data.question_key,
        )
        .order_by(Answer.id.desc())
        .first()
    )

    if existing_answer is not None:
        # Update the existing answer.
        existing_answer.answer_value = answer_data.answer_value
        answer = existing_answer

    else:
        # Create a new answer only if none exists.
        answer = Answer(
            inspection_id=inspection_id,
            question_key=answer_data.question_key,
            answer_value=answer_data.answer_value,
        )

        db.add(answer)

    db.commit()
    db.refresh(answer)

    return answer


# --------------------------------------------------
# CREATE EVIDENCE RECORD
# --------------------------------------------------

@router.post(
    "/{inspection_id}/evidence",
    response_model=EvidenceResponse,
    status_code=201,
)
def create_evidence(
    inspection_id: int,
    evidence_data: EvidenceCreate,
    db: Session = Depends(get_db),
):
    inspection = (
        db.query(Inspection)
        .filter(Inspection.id == inspection_id)
        .first()
    )

    if inspection is None:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found",
        )

    evidence = Evidence(
        inspection_id=inspection_id,
        evidence_type=evidence_data.evidence_type,
        storage_key=evidence_data.storage_key,
        original_filename=evidence_data.original_filename,
        mime_type=evidence_data.mime_type,
        capture_location=evidence_data.capture_location,
        description=evidence_data.description,
    )

    db.add(evidence)
    db.commit()
    db.refresh(evidence)

    return evidence


# --------------------------------------------------
# GET EXTRACTED PROPERTY FIELDS
# --------------------------------------------------

@router.get(
    "/{inspection_id}/fields",
    response_model=list[ExtractedFieldResponse],
)
def get_extracted_fields(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    inspection = (
        db.query(Inspection)
        .filter(Inspection.id == inspection_id)
        .first()
    )

    if inspection is None:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found",
        )

    return (
        db.query(ExtractedField)
        .filter(ExtractedField.inspection_id == inspection_id)
        .all()
    )


# --------------------------------------------------
# UPLOAD PHOTO, VIDEO, OR DOCUMENT
# --------------------------------------------------

@router.post(
    "/{inspection_id}/uploads",
    status_code=201,
)
def upload_inspection_file(
    inspection_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    inspection = (
        db.query(Inspection)
        .filter(Inspection.id == inspection_id)
        .first()
    )

    if inspection is None:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found",
        )

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type",
        )

    UPLOAD_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    extension = Path(
        file.filename or ""
    ).suffix.lower()

    stored_name = f"{uuid.uuid4().hex}{extension}"

    destination = UPLOAD_DIR / stored_name

    size = 0

    try:
        with destination.open("wb") as output:
            while True:
                chunk = file.file.read(1024 * 1024)

                if not chunk:
                    break

                size += len(chunk)

                if size > MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="File exceeds the 250 MB limit",
                    )

                output.write(chunk)

        # Determine the type of evidence.
        if file.content_type.startswith("image/"):
            evidence_type = "photo"

        elif file.content_type.startswith("video/"):
            evidence_type = "video"

        else:
            evidence_type = "document"

        # Save the file information in PostgreSQL.
        evidence = Evidence(
            inspection_id=inspection_id,
            evidence_type=evidence_type,
            storage_key=f"uploads/{stored_name}",
            original_filename=Path(
                file.filename or "upload"
            ).name,
            mime_type=file.content_type,
        )

        db.add(evidence)
        db.commit()
        db.refresh(evidence)

        return {
            "id": evidence.id,
            "inspection_id": evidence.inspection_id,
            "evidence_type": evidence.evidence_type,
            "original_filename": evidence.original_filename,
            "mime_type": evidence.mime_type,
            "storage_key": evidence.storage_key,
            "size_bytes": size,
        }

    except Exception:
        db.rollback()

        if destination.exists():
            destination.unlink()

        raise

    finally:
        file.file.close()

# --------------------------------------------------
# GET UPLOADED FILES FOR AN INSPECTION
# --------------------------------------------------

@router.get("/{inspection_id}/uploads")
def get_inspection_uploads(
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
        .filter(Evidence.inspection_id == inspection_id)
        .order_by(Evidence.id.asc())
        .all()
    )

    return [
        {
            "id": evidence.id,
            "inspection_id": evidence.inspection_id,
            "evidence_type": evidence.evidence_type,
            "original_filename": evidence.original_filename,
            "mime_type": evidence.mime_type,
            "storage_key": evidence.storage_key,
        }
        for evidence in evidence_files
    ]
