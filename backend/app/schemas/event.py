"""Event Pydantic schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.event import EventStatus, ParticipantStatus
from app.schemas.user import UserPublic
from app.core.utils import MOSCOW_TZ


class CategoryOut(BaseModel):
    id: int
    name: str
    icon: str
    color: str

    model_config = {"from_attributes": True}


def _to_naive_moscow(v: Optional[datetime]) -> Optional[datetime]:
    """Convert to Moscow time and strip timezone info."""
    if v is None:
        return None
    if v.tzinfo is not None:
        v = v.astimezone(MOSCOW_TZ).replace(tzinfo=None)
    return v


class EventCreate(BaseModel):
    title: str
    description: str
    date: Optional[datetime] = None  # None для каталожных позиций (is_tour=True)
    end_time: Optional[datetime] = None
    capacity: int
    min_participants: Optional[int] = None
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    category_id: int
    is_tour: bool = False
    price: Optional[float] = None
    payment_details: Optional[str] = None

    @field_validator('date', 'end_time', mode='after')
    @classmethod
    def normalize_date(cls, v: Optional[datetime]) -> Optional[datetime]:
        return _to_naive_moscow(v)


class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[datetime] = None
    end_time: Optional[datetime] = None
    capacity: Optional[int] = None
    min_participants: Optional[int] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    category_id: Optional[int] = None
    status: Optional[EventStatus] = None
    is_tour: Optional[bool] = None
    price: Optional[float] = None
    payment_details: Optional[str] = None

    @field_validator('date', 'end_time', mode='after')
    @classmethod
    def normalize_date(cls, v: Optional[datetime]) -> Optional[datetime]:
        return _to_naive_moscow(v)


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
    end_time: Optional[datetime] = None
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
    price: Optional[float] = None
    payment_details: Optional[str] = None

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
    price: Optional[float] = None
    payment_details: Optional[str] = None

    model_config = {"from_attributes": True}


class ParticipantOut(BaseModel):
    id: int
    user: UserPublic
    status: ParticipantStatus
    payment_status: Optional[str] = None
    joined_at: datetime
    total_registrations: int = 0
    total_attended: int = 0

    model_config = {"from_attributes": True}

    @classmethod
    def from_participant(
        cls,
        p: object,
        total_registrations: int = 0,
        total_attended: int = 0,
    ) -> "ParticipantOut":
        status = p.status  # type: ignore[attr-defined]
        return cls(
            id=p.id,  # type: ignore[attr-defined]
            user=p.user,  # type: ignore[attr-defined]
            status=status,
            payment_status=status.value,
            joined_at=p.joined_at,  # type: ignore[attr-defined]
            total_registrations=total_registrations,
            total_attended=total_attended,
        )


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
