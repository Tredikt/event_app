"""Event Pydantic schemas."""

from datetime import datetime
from typing import Optional

from datetime import timezone
from pydantic import BaseModel, field_validator

from app.models.event import EventStatus, ParticipantStatus
from app.schemas.user import UserPublic


class CategoryOut(BaseModel):
    id: int
    name: str
    icon: str
    color: str

    model_config = {"from_attributes": True}


def _to_naive_utc(v: Optional[datetime]) -> Optional[datetime]:
    """Strip timezone info, converting to UTC first if necessary."""
    if v is None:
        return None
    if v.tzinfo is not None:
        v = v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


class EventCreate(BaseModel):
    title: str
    description: str
    date: Optional[datetime] = None  # None для каталожных позиций (is_tour=True)
    capacity: int
    min_participants: Optional[int] = None
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    category_id: int
    is_tour: bool = False

    @field_validator('date', mode='after')
    @classmethod
    def normalize_date(cls, v: Optional[datetime]) -> Optional[datetime]:
        return _to_naive_utc(v)


class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[datetime] = None
    capacity: Optional[int] = None
    min_participants: Optional[int] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    category_id: Optional[int] = None
    status: Optional[EventStatus] = None
    is_tour: Optional[bool] = None

    @field_validator('date', mode='after')
    @classmethod
    def normalize_date(cls, v: Optional[datetime]) -> Optional[datetime]:
        return _to_naive_utc(v)


class EventImageOut(BaseModel):
    id: int
    image_url: str
    order: int

    model_config = {"from_attributes": True}


class EventOut(BaseModel):
    id: int
    title: str
    description: str
    date: Optional[datetime] = None
    capacity: int
    min_participants: Optional[int] = None
    participants_count: int
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: EventStatus
    image_url: Optional[str] = None
    images: list[EventImageOut] = []
    subscriptions_count: int = 0
    is_tour: bool
    category: CategoryOut
    organizer: UserPublic
    created_at: datetime
    is_full: bool

    model_config = {"from_attributes": True}


class EventListOut(BaseModel):
    id: int
    title: str
    date: Optional[datetime] = None
    capacity: int
    min_participants: Optional[int] = None
    participants_count: int
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: EventStatus
    image_url: Optional[str] = None
    is_tour: bool
    category: CategoryOut
    organizer: UserPublic
    is_full: bool

    model_config = {"from_attributes": True}


class ParticipantOut(BaseModel):
    id: int
    user: UserPublic
    status: ParticipantStatus
    joined_at: datetime

    model_config = {"from_attributes": True}


class SubscriptionCreate(BaseModel):
    notify_telegram: bool = True
    notify_email: bool = False


class SubscriptionOut(BaseModel):
    id: int
    event_id: int
    notify_telegram: bool
    notify_email: bool

    model_config = {"from_attributes": True}


class AttendanceItemIn(BaseModel):
    user_id: int
    attended: bool


class AttendanceIn(BaseModel):
    items: list[AttendanceItemIn]


class AttendanceParticipantOut(BaseModel):
    user_id: int
    user: UserPublic
    attended: Optional[bool] = None

    model_config = {"from_attributes": True}


class EventFilters(BaseModel):
    category_id: Optional[int] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_km: Optional[float] = None
    only_available: bool = False
    search: Optional[str] = None
