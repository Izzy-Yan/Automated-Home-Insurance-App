from pydantic import BaseModel, ConfigDict


class PropertyCreate(BaseModel):
    address_line_1: str
    address_line_2: str | None = None
    city: str
    state: str
    postal_code: str
    county: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    year_built: int | None = None
    notes: str | None = None


class PropertyResponse(PropertyCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)