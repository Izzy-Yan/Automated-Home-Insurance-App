from datetime import datetime

from pydantic import BaseModel, ConfigDict


class InspectionCreate(BaseModel):
    property_id: int


class InspectionResponse(BaseModel):
    id: int
    property_id: int
    status: str
    started_at: datetime
    submitted_at: datetime | None
    completed_at: datetime | None
    reviewer_notes: str | None

    model_config = ConfigDict(from_attributes=True)


class AnswerCreate(BaseModel):
    question_key: str
    answer_value: str


class AnswerResponse(BaseModel):
    id: int
    inspection_id: int
    question_key: str
    answer_value: str

    model_config = ConfigDict(from_attributes=True)


class EvidenceCreate(BaseModel):
    evidence_type: str
    storage_key: str
    original_filename: str | None = None
    mime_type: str | None = None
    capture_location: str | None = None
    description: str | None = None


class EvidenceResponse(BaseModel):
    id: int
    inspection_id: int
    evidence_type: str
    storage_key: str
    original_filename: str | None
    mime_type: str | None
    capture_location: str | None
    description: str | None
    captured_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ExtractedFieldResponse(BaseModel):
    id: int
    inspection_id: int
    field_key: str
    value: str | None
    source_type: str
    source_id: int | None
    confidence: float | None
    review_status: str
    reviewer_value: str | None
    reviewer_notes: str | None
    alternatives: str | None

    model_config = ConfigDict(from_attributes=True)


class InspectionDetailResponse(InspectionResponse):
    answers: list[AnswerResponse] = []
    evidence: list[EvidenceResponse] = []
    extracted_fields: list[ExtractedFieldResponse] = []
    