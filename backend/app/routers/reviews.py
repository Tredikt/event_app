"""Reviews router."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.event import Event, EventParticipant, ParticipantStatus
from app.models.review import Review
from app.models.user import User
from app.schemas.review import ReviewCreate, ReviewOut

router = APIRouter(prefix="/events", tags=["reviews"])


@router.get("/{event_id}/reviews", response_model=list[ReviewOut])
async def get_reviews(event_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Review)
        .where(Review.event_id == event_id)
        .options(selectinload(Review.reviewer))
        .order_by(Review.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{event_id}/reviews", response_model=ReviewOut)
async def create_review(
    event_id: int,
    body: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")

    if event.organizer_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя оставить отзыв на своё мероприятие")

    if not event.date or event.date > datetime.utcnow():
        raise HTTPException(status_code=400, detail="Отзыв можно оставить только после окончания мероприятия")

    # Must have participated
    participant = await db.execute(
        select(EventParticipant).where(
            EventParticipant.event_id == event_id,
            EventParticipant.user_id == current_user.id,
            EventParticipant.status == ParticipantStatus.registered,
        )
    )
    if not participant.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Вы не участвовали в этом мероприятии")

    # Unique check
    existing = await db.execute(
        select(Review).where(Review.reviewer_id == current_user.id, Review.event_id == event_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Вы уже оставили отзыв на это мероприятие")

    review = Review(
        reviewer_id=current_user.id,
        organizer_id=event.organizer_id,
        event_id=event_id,
        rating=body.rating,
        text=body.text,
    )
    db.add(review)
    await db.flush()

    # Recalculate organizer rating
    avg = await db.execute(
        select(func.avg(Review.rating)).where(Review.organizer_id == event.organizer_id)
    )
    new_rating = avg.scalar() or 5.0
    organizer = await db.get(User, event.organizer_id)
    if organizer:
        organizer.rating = round(float(new_rating), 2)

    await db.commit()
    await db.refresh(review, ["reviewer"])
    return review


@router.delete("/{event_id}/reviews/{review_id}", status_code=204)
async def delete_review(
    event_id: int,
    review_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = await db.get(Review, review_id)
    if not review or review.event_id != event_id:
        raise HTTPException(status_code=404, detail="Отзыв не найден")
    if review.reviewer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа")

    await db.delete(review)
    await db.flush()

    # Recalculate organizer rating
    avg = await db.execute(
        select(func.avg(Review.rating)).where(Review.organizer_id == review.organizer_id)
    )
    new_rating = avg.scalar() or 5.0
    organizer = await db.get(User, review.organizer_id)
    if organizer:
        organizer.rating = round(float(new_rating), 2)

    await db.commit()
