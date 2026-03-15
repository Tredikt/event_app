"""Notification preference and subscription models."""

from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.utils import moscow_now


class NotificationSettings(Base):
    """Global notification preferences per user."""
    __tablename__ = "notification_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    telegram_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Notify about new events in subscribed categories
    notify_new_events: Mapped[bool] = mapped_column(Boolean, default=True)
    # Notify about new events from followed organizers
    notify_organizer_events: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(default=moscow_now)
    updated_at: Mapped[datetime] = mapped_column(default=moscow_now, onupdate=moscow_now)

    user: Mapped["User"] = relationship("User", back_populates="notification_settings")


class CategorySubscription(Base):
    """User subscribes to a category — gets notified on new events."""
    __tablename__ = "category_subscriptions"
    __table_args__ = (UniqueConstraint("user_id", "category_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("event_categories.id"))
    created_at: Mapped[datetime] = mapped_column(default=moscow_now)

    user: Mapped["User"] = relationship("User", back_populates="category_subscriptions")
    category: Mapped["EventCategory"] = relationship("EventCategory", back_populates="subscribers")


class OrganizerSubscription(Base):
    """User follows an organizer — gets notified when they create events."""
    __tablename__ = "organizer_subscriptions"
    __table_args__ = (UniqueConstraint("follower_id", "organizer_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    follower_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    organizer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(default=moscow_now)

    follower: Mapped["User"] = relationship("User", foreign_keys=[follower_id], back_populates="following")
    organizer: Mapped["User"] = relationship("User", foreign_keys=[organizer_id], back_populates="followers")
