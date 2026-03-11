"""Public user profiles and reviews."""

from datetime import datetime
from typing import Optional
from sqlalchemy import and_, func, select
from sqlalchemy.orm import selectinload
from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.event import Event, EventParticipant, EventStatus
from app.models.review import Review
from app.models.user import User
from app.schemas.event import EventListOut
from app.schemas.review import OrganizerProfile, ReviewCreate, ReviewOut
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}", response_model=OrganizerProfile)
async def get_organizer_profile(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    events_count = await db.scalar(select(func.count()).where(Event.organizer_id == user_id)) or 0
    reviews_count = await db.scalar(select(func.count()).where(Review.organizer_id == user_id)) or 0

    return OrganizerProfile(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        avatar_url=user.avatar_url,
        telegram_username=user.telegram_username,
        rating=user.rating,
        city=user.city,
        created_at=user.created_at,
        events_count=events_count,
        reviews_count=reviews_count,
    )


@router.get("/{user_id}/reviews", response_model=list[ReviewOut])
async def get_organizer_reviews(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Review)
        .where(Review.organizer_id == user_id)
        .options(selectinload(Review.reviewer), selectinload(Review.event))
        .order_by(Review.created_at.desc())
        .limit(50)
    )
    reviews = result.scalars().all()
    return [
        ReviewOut(
            id=r.id,
            reviewer=r.reviewer,
            event_id=r.event_id,
            event_title=r.event.title,
            rating=r.rating,
            text=r.text,
            created_at=r.created_at,
        )
        for r in reviews
    ]


@router.get("/{user_id}/eligible-events")
async def get_eligible_events(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Past events by this organizer where current user participated and hasn't reviewed yet."""
    result = await db.execute(
        select(Event)
        .join(EventParticipant, and_(
            EventParticipant.event_id == Event.id,
            EventParticipant.user_id == current_user.id,
            EventParticipant.status == "registered",
        ))
        .where(and_(
            Event.organizer_id == user_id,
            Event.date < datetime.utcnow(),
            Event.status != EventStatus.cancelled,
        ))
    )
    events = result.scalars().all()
    if not events:
        return []

    reviewed_result = await db.execute(
        select(Review.event_id).where(and_(
            Review.reviewer_id == current_user.id,
            Review.organizer_id == user_id,
        ))
    )
    reviewed_ids = set(reviewed_result.scalars().all())

    return [
        {"id": e.id, "title": e.title, "date": e.date.isoformat()}
        for e in events
        if e.id not in reviewed_ids
    ]


@router.get("/{user_id}/events", response_model=list[EventListOut])
async def get_organizer_events(
    user_id: int,
    tab: Optional[str] = "upcoming",
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()
    from app.models.event import EventCategory
    if tab == "past":
        q = (
            select(Event)
            .options(selectinload(Event.category), selectinload(Event.organizer))
            .where(and_(
                Event.organizer_id == user_id,
                Event.is_tour == False,
                Event.date < now,
                Event.status != EventStatus.cancelled,
            ))
            .order_by(Event.date.desc())
        )
    else:
        q = (
            select(Event)
            .options(selectinload(Event.category), selectinload(Event.organizer))
            .where(and_(
                Event.organizer_id == user_id,
                Event.is_tour == False,
                Event.date >= now,
                Event.status != EventStatus.cancelled,
            ))
            .order_by(Event.date.asc())
        )
    result = await db.execute(q)
    events = result.scalars().all()

    counts_q = await db.execute(
        select(Event.id, func.count(EventParticipant.id))
        .outerjoin(EventParticipant, and_(
            EventParticipant.event_id == Event.id,
            EventParticipant.status == "registered",
        ))
        .where(Event.organizer_id == user_id)
        .group_by(Event.id)
    )
    counts = {row[0]: row[1] for row in counts_q}

    out = []
    for e in events:
        pc = counts.get(e.id, 0)
        out.append(EventListOut(
            id=e.id,
            title=e.title,
            date=e.date,
            capacity=e.capacity,
            participants_count=pc,
            address=e.address,
            latitude=e.latitude,
            longitude=e.longitude,
            status=e.status,
            image_url=e.image_url,
            is_tour=e.is_tour,
            category=e.category,
            organizer=e.organizer,
            is_full=pc >= e.capacity,
        ))
    return out


@router.post("/{user_id}/reviews", response_model=ReviewOut)
async def create_review(
    user_id: int,
    data: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Нельзя оставить отзыв самому себе")

    event = await db.get(Event, data.event_id)
    if not event or event.organizer_id != user_id:
        raise HTTPException(status_code=400, detail="Мероприятие не принадлежит этому организатору")

    if event.date >= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Можно оставить отзыв только о прошедших мероприятиях")

    participation = await db.scalar(
        select(EventParticipant).where(and_(
            EventParticipant.event_id == data.event_id,
            EventParticipant.user_id == current_user.id,
            EventParticipant.status == "registered",
        ))
    )
    if not participation:
        raise HTTPException(status_code=403, detail="Вы не участвовали в этом мероприятии")

    existing = await db.scalar(
        select(Review).where(and_(
            Review.reviewer_id == current_user.id,
            Review.event_id == data.event_id,
        ))
    )
    if existing:
        raise HTTPException(status_code=400, detail="Вы уже оставили отзыв об этом мероприятии")

    review = Review(
        reviewer_id=current_user.id,
        organizer_id=user_id,
        event_id=data.event_id,
        rating=data.rating,
        text=data.text or None,
    )
    db.add(review)
    await db.flush()

    avg = await db.scalar(select(func.avg(Review.rating)).where(Review.organizer_id == user_id))
    organizer = await db.get(User, user_id)
    organizer.rating = round(float(avg), 2) if avg else 5.0

    await db.commit()

    result = await db.execute(
        select(Review)
        .where(Review.id == review.id)
        .options(selectinload(Review.reviewer), selectinload(Review.event))
    )
    review = result.scalar_one()

    return ReviewOut(
        id=review.id,
        reviewer=review.reviewer,
        event_id=review.event_id,
        event_title=review.event.title,
        rating=review.rating,
        text=review.text,
        created_at=review.created_at,
    )
