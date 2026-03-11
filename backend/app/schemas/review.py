from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator

from app.schemas.user import UserPublic


class ReviewCreate(BaseModel):
    rating: int
    text: Optional[str] = None

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v: int) -> int:
        if not 1 <= v <= 5:
            raise ValueError("Rating must be between 1 and 5")
        return v


class ReviewOut(BaseModel):
    id: int
    reviewer: UserPublic
    event_id: int
    rating: int
    text: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class OrganizerProfile(BaseModel):
    id: int
    first_name: str
    last_name: str
    avatar_url: Optional[str] = None
    telegram_username: Optional[str] = None
    rating: float
    city: Optional[str] = None
    created_at: datetime
    events_count: int
    reviews_count: int

    model_config = {"from_attributes": True}
