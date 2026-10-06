from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.property import Property
    from app.models.evidence import Evidence
    from app.models.answer import Answer
    from app.models.extracted_field import ExtractedField


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    property_id: Mapped[int] = mapped_column(
        ForeignKey("properties.id"),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="draft",
        nullable=False,
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    reviewer_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    property: Mapped["Property"] = relationship(
        "Property",
        back_populates="inspections",
    )

    evidence: Mapped[list["Evidence"]] = relationship(
        "Evidence",
        back_populates="inspection",
        cascade="all, delete-orphan",
    )

    answers: Mapped[list["Answer"]] = relationship(
        "Answer",
        back_populates="inspection",
        cascade="all, delete-orphan",
    )

    extracted_fields: Mapped[list["ExtractedField"]] = relationship(
        "ExtractedField",
        back_populates="inspection",
        cascade="all, delete-orphan",
    )
    