"""User SQLAlchemy model."""

import enum
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Enum as SAEnum, Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class GenderEnum(str, enum.Enum):
    male = "male"
    female = "female"
    other = "other"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    gender: Mapped[GenderEnum] = mapped_column(SAEnum(GenderEnum))
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True)
    telegram_username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    rating: Mapped[float] = mapped_column(Float, default=5.0, server_default="5.0")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    organized_events: Mapped[list["Event"]] = relationship("Event", back_populates="organizer")
    participations: Mapped[list["EventParticipant"]] = relationship("EventParticipant", back_populates="user")
    subscriptions: Mapped[list["EventSubscription"]] = relationship("EventSubscription", back_populates="user")
    notification_settings: Mapped["NotificationSettings | None"] = relationship(
        "NotificationSettings", back_populates="user", uselist=False
    )
    category_subscriptions: Mapped[list["CategorySubscription"]] = relationship(
        "CategorySubscription", back_populates="user"
    )
    following: Mapped[list["OrganizerSubscription"]] = relationship(
        "OrganizerSubscription", foreign_keys="OrganizerSubscription.follower_id", back_populates="follower"
    )
    followers: Mapped[list["OrganizerSubscription"]] = relationship(
        "OrganizerSubscription", foreign_keys="OrganizerSubscription.organizer_id", back_populates="organizer"
    )
