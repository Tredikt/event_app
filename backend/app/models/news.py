"""NewsPost SQLAlchemy model."""

from datetime import datetime
from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.utils import moscow_now


class NewsPost(Base):
    __tablename__ = "news_posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    content: Mapped[str] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=moscow_now)

    author: Mapped["User | None"] = relationship("User")
    event: Mapped["Event | None"] = relationship("Event", foreign_keys=[event_id])
    images: Mapped[list["NewsPostImage"]] = relationship(
        "NewsPostImage", back_populates="post", order_by="NewsPostImage.order", cascade="all, delete-orphan"
    )


class NewsPostImage(Base):
    __tablename__ = "news_post_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("news_posts.id", ondelete="CASCADE"))
    image_url: Mapped[str] = mapped_column(String(500))
    order: Mapped[int] = mapped_column(Integer, default=0)

    post: Mapped["NewsPost"] = relationship("NewsPost", back_populates="images")
