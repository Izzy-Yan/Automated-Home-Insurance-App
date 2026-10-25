
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
FRAME_DIR = UPLOAD_DIR / "frames"
MAX_UPLOAD_SIZE = 250 * 1024 * 1024

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "video/mp4",
    "video/quicktime",
    "application/pdf",
}

# Initial extraction targets.
# These are internal field keys, NOT verified ACORD field numbers.
EXTRACTION_FIELDS = {
    "number_of_stories": "Number of stories",
    "exterior_wall_type": "Exterior wall material",
    "roof_type": "Roof material",
    "foundation_type": "Foundation type",
    "flooring_type": "Flooring material",
    "countertop_material": "Countertop material",
    "hvac_type": "HVAC equipment",
    "water_heater_type": "Water heater type",
    "electrical_service": "Electrical panel rating",
}


def require_inspection(db: Session, inspection_id: int):
    inspection = db.get(Inspection, inspection_id)
    if inspection is None:
        raise HTTPException(
            status_code=404,
            detail="Inspection not found",
        )
    return inspection


@router.post(
    "/",
    response_model=InspectionResponse,
    status_code=201,
)
def create_inspection(
    inspection_data: InspectionCreate,
    db: Session = Depends(get_db),
):
    if db.get(Property, inspection_data.property_id) is None:
        raise HTTPException(
            status_code=404,
            detail="Property not found",
        )

    inspection = Inspection(
        property_id=inspection_data.property_id,
        status="draft",
    )
    db.add(inspection)
    db.commit()
    db.refresh(inspection)
    return inspection


@router.get(
    "/{inspection_id}",
    response_model=InspectionDetailResponse,
)
def get_inspection(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    return require_inspection(db, inspection_id)


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
    require_inspection(db, inspection_id)

    answer = (
        db.query(Answer)
        .filter(
            Answer.inspection_id == inspection_id,
            Answer.question_key == answer_data.question_key,
        )
        .order_by(Answer.id.desc())
        .first()
    )

    if answer is None:
        answer = Answer(
            inspection_id=inspection_id,
            question_key=answer_data.question_key,
            answer_value=answer_data.answer_value,
        )
        db.add(answer)
    else:
        answer.answer_value = answer_data.answer_value

    db.commit()
    db.refresh(answer)
    return answer


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
    require_inspection(db, inspection_id)

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


@router.get(
    "/{inspection_id}/fields",
    response_model=list[ExtractedFieldResponse],
)
def get_extracted_fields(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    require_inspection(db, inspection_id)

    return (
        db.query(ExtractedField)
        .filter(
            ExtractedField.inspection_id == inspection_id
        )
        .order_by(ExtractedField.id.asc())
        .all()
    )


@router.get("/{inspection_id}/uploads")
def get_inspection_uploads(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    require_inspection(db, inspection_id)

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


@router.post("/{inspection_id}/uploads", status_code=201)
def upload_inspection_file(
    inspection_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    require_inspection(db, inspection_id)

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    extension = Path(file.filename or "").suffix.lower()
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

        if file.content_type.startswith("image/"):
            evidence_type = "photo"
        elif file.content_type.startswith("video/"):
            evidence_type = "video"
        else:
            evidence_type = "document"

        evidence = Evidence(
            inspection_id=inspection_id,
            evidence_type=evidence_type,
            storage_key=f"uploads/{stored_name}",
            original_filename=Path(file.filename or "upload").name,
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
        destination.unlink(missing_ok=True)
        raise
    finally:
        file.file.close()


# --------------------------------------------------
# VIDEO FRAME EXTRACTION
# --------------------------------------------------

def extract_video_frames(
    video_path: Path,
    inspection_id: int,
    evidence_id: int,
):
    import cv2

    FRAME_DIR.mkdir(parents=True, exist_ok=True)

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        capture.release()
        raise ValueError("Video could not be opened")

    fps = capture.get(cv2.CAP_PROP_FPS)
    frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT)

    if fps <= 0 or frame_count <= 0:
        capture.release()
        raise ValueError("Video has invalid frame metadata")

    duration = frame_count / fps

    # At most 8 frames per video, spread across its duration.
    sample_count = max(1, min(8, int(duration // 5) + 1))
    timestamps = [
        (i + 0.5) * duration / sample_count
        for i in range(sample_count)
    ]

    saved_frames = []

    try:
        for index, timestamp in enumerate(timestamps):
            capture.set(
                cv2.CAP_PROP_POS_MSEC,
                timestamp * 1000,
            )

            success, frame = capture.read()
            if not success:
                continue

            # Keep the longest dimension at 1280 pixels.
            height, width = frame.shape[:2]
            scale = min(1.0, 1280 / max(height, width))

            if scale < 1:
                frame = cv2.resize(
                    frame,
                    (
                        max(1, int(width * scale)),
                        max(1, int(height * scale)),
                    ),
                )

            filename = (
                f"inspection_{inspection_id}_"
                f"evidence_{evidence_id}_"
                f"frame_{index:02d}.jpg"
            )
            destination = FRAME_DIR / filename

            if not cv2.imwrite(str(destination), frame):
                raise ValueError("Could not write video frame")

            saved_frames.append({
                "timestamp_seconds": round(timestamp, 2),
                "storage_key": f"uploads/frames/{filename}",
            })
    finally:
        capture.release()

    return saved_frames


# --------------------------------------------------
# PREPARE EVIDENCE FOR FUTURE AI ANALYSIS
# --------------------------------------------------

@router.post("/{inspection_id}/analyze")
def analyze_inspection(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    require_inspection(db, inspection_id)

    evidence_files = (
        db.query(Evidence)
        .filter(Evidence.inspection_id == inspection_id)
        .order_by(Evidence.id.asc())
        .all()
    )

    photos = []
    videos = []
    skipped = []
    errors = []

    for evidence in evidence_files:
        if evidence.evidence_type not in ("photo", "video"):
            skipped.append(evidence.id)
            continue

        # Only access files stored in our managed upload directory.
        expected_prefix = "uploads/"
        key = evidence.storage_key or ""

        if not key.startswith(expected_prefix):
            errors.append({
                "evidence_id": evidence.id,
                "error": "Unsupported storage location",
            })
            continue

        relative_name = key[len(expected_prefix):]
        path = (UPLOAD_DIR / relative_name).resolve()

        if not path.is_relative_to(UPLOAD_DIR.resolve()):
            errors.append({
                "evidence_id": evidence.id,
                "error": "Invalid storage path",
            })
            continue

        if not path.is_file():
            errors.append({
                "evidence_id": evidence.id,
                "error": "File not found",
            })
            continue

        if evidence.evidence_type == "photo":
            photos.append({
                "evidence_id": evidence.id,
                "filename": evidence.original_filename,
                "storage_key": evidence.storage_key,
            })
        else:
            try:
                frames = extract_video_frames(
                    path,
                    inspection_id,
                    evidence.id,
                )
                videos.append({
                    "evidence_id": evidence.id,
                    "filename": evidence.original_filename,
                    "frames": frames,
                })
            except Exception as exc:
                errors.append({
                    "evidence_id": evidence.id,
                    "error": str(exc),
                })

    # MOCK MODE:
    # No visual identification is performed here.
    # Save only a review-required placeholder per target field.
    # Re-running analysis updates the existing mock placeholders.
    prepared_count = len(photos) + sum(
        len(video["frames"]) for video in videos
    )

    if prepared_count > 0:
        for field_key in EXTRACTION_FIELDS:
            existing = (
                db.query(ExtractedField)
                .filter(
                    ExtractedField.inspection_id == inspection_id,
                    ExtractedField.field_key == field_key,
                    ExtractedField.source_type == "mock",
                )
                .first()
            )

            if existing is None:
                existing = ExtractedField(
                    inspection_id=inspection_id,
                    field_key=field_key,
                    value="unknown",
                    source_type="mock",
                    confidence=0.0,
                    review_status="needs_review",
                )
                db.add(existing)
            else:
                existing.value = "unknown"
                existing.confidence = 0.0
                existing.review_status = "needs_review"

        db.commit()

    return {
        "inspection_id": inspection_id,
        "mode": "mock",
        "message": (
            "Evidence prepared. No AI visual recognition "
            "has been performed yet."
        ),
        "photo_count": len(photos),
        "video_count": len(videos),
        "frame_count": sum(
            len(video["frames"]) for video in videos
        ),
        "photos": photos,
        "videos": videos,
        "skipped_evidence_ids": skipped,
        "errors": errors,
        "fields": [
            {
                "field_key": key,
                "label": label,
                "value": "unknown",
                "confidence": 0.0,
                "source_type": "mock",
                "review_status": "needs_review",
            }
            for key, label in EXTRACTION_FIELDS.items()
        ] if prepared_count > 0 else [],
    }
