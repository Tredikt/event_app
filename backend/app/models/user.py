"""User SQLAlchemy model."""

import enum
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Enum as SAEnum, Float, String, Text, Integer, ForeignKey
from app.core.utils import moscow_now
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class GenderEnum(str, enum.Enum):
    male = "male"
    female = "female"
    other = "other"


class VerificationStatus(str, enum.Enum):
    none = "none"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class VerificationRequest(Base):
    __tablename__ = "verification_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    legal_type: Mapped[str] = mapped_column(String(50))   # ИП, ООО, АО, НКО, ...
    legal_name: Mapped[str] = mapped_column(String(500))
    inn: Mapped[str] = mapped_column(String(20))
    contact_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=moscow_now)

    user: Mapped["User"] = relationship("User", back_populates="verification_request")


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
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    verification_status: Mapped[VerificationStatus] = mapped_column(
        SAEnum(VerificationStatus, name="verificationstatus"),
        default=VerificationStatus.none,
        server_default="none",
    )
    rating: Mapped[float] = mapped_column(Float, default=5.0, server_default="5.0")
    created_at: Mapped[datetime] = mapped_column(default=moscow_now)

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
    verification_request: Mapped["VerificationRequest | None"] = relationship(
        "VerificationRequest", back_populates="user", uselist=False
    )
