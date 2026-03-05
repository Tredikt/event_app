"""Notification Pydantic schemas."""

from datetime import datetime

from pydantic import BaseModel

from app.schemas.event import CategoryOut
from app.schemas.user import UserPublic


class NotificationSettingsOut(BaseModel):
    id: int
    telegram_enabled: bool
    email_enabled: bool
    notify_new_events: bool
    notify_organizer_events: bool

    model_config = {"from_attributes": True}


class NotificationSettingsUpdate(BaseModel):
    telegram_enabled: bool | None = None
    email_enabled: bool | None = None
    notify_new_events: bool | None = None
    notify_organizer_events: bool | None = None


class CategorySubscriptionOut(BaseModel):
    id: int
    category: CategoryOut
    created_at: datetime

    model_config = {"from_attributes": True}


class OrganizerSubscriptionOut(BaseModel):
    id: int
    organizer: UserPublic
    created_at: datetime

    model_config = {"from_attributes": True}
