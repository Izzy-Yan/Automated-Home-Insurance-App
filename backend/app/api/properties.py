from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.property import Property
from app.schemas.property import PropertyCreate, PropertyResponse


router = APIRouter(
    prefix="/api/properties",
    tags=["properties"],
)


@router.post("/", response_model=PropertyResponse, status_code=201)
def create_property(
    property_data: PropertyCreate,
    db: Session = Depends(get_db),
):
    new_property = Property(
        address_line_1=property_data.address_line_1,
        address_line_2=property_data.address_line_2,
        city=property_data.city,
        state=property_data.state,
        postal_code=property_data.postal_code,
        county=property_data.county,
        latitude=property_data.latitude,
        longitude=property_data.longitude,
        year_built=property_data.year_built,
        notes=property_data.notes,
    )

    db.add(new_property)
    db.commit()
    db.refresh(new_property)

    return new_property


@router.get("/{property_id}", response_model=PropertyResponse)
def get_property(
    property_id: int,
    db: Session = Depends(get_db),
):
    property_record = (
        db.query(Property)
        .filter(Property.id == property_id)
        .first()
    )

    if property_record is None:
        raise HTTPException(
            status_code=404,
            detail="Property not found",
        )

    return property_record