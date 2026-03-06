"""Event-related SQLAlchemy models."""

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class EventStatus(str, enum.Enum):
    active = "active"
    cancelled = "cancelled"
    completed = "completed"


class ParticipantStatus(str, enum.Enum):
    registered = "registered"
    cancelled = "cancelled"


class EventCategory(Base):
    __tablename__ = "event_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    icon: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(20), default="#4A90E2")

    events: Mapped[list["Event"]] = relationship("Event", back_populates="category")
    subscribers: Mapped[list["CategorySubscription"]] = relationship(
        "CategorySubscription", back_populates="category"
    )


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    date: Mapped[datetime] = mapped_column(DateTime)
    capacity: Mapped[int] = mapped_column(Integer)
    participants_count: Mapped[int] = mapped_column(Integer, default=0)
    address: Mapped[str] = mapped_column(String(500))
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[EventStatus] = mapped_column(SAEnum(EventStatus), default=EventStatus.active)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_tour: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    attendance_notified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    organizer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("event_categories.id"))
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    organizer: Mapped["User"] = relationship("User", back_populates="organized_events")
    category: Mapped["EventCategory"] = relationship("EventCategory", back_populates="events")
    participants: Mapped[list["EventParticipant"]] = relationship("EventParticipant", back_populates="event")
    subscriptions: Mapped[list["EventSubscription"]] = relationship("EventSubscription", back_populates="event")
    attendance_records: Mapped[list["EventAttendance"]] = relationship("EventAttendance", back_populates="event")

    @property
    def is_full(self) -> bool:
        return self.participants_count >= self.capacity


class EventParticipant(Base):
    __tablename__ = "event_participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[ParticipantStatus] = mapped_column(
        SAEnum(ParticipantStatus), default=ParticipantStatus.registered
    )
    joined_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    event: Mapped["Event"] = relationship("Event", back_populates="participants")
    user: Mapped["User"] = relationship("User", back_populates="participations")


class EventSubscription(Base):
    __tablename__ = "event_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    notify_telegram: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_email: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    event: Mapped["Event"] = relationship("Event", back_populates="subscriptions")
    user: Mapped["User"] = relationship("User", back_populates="subscriptions")


class EventAttendance(Base):
    __tablename__ = "event_attendance"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    attended: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    marked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    event: Mapped["Event"] = relationship("Event", back_populates="attendance_records")
    user: Mapped["User"] = relationship("User")
