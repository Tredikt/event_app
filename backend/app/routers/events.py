"""Event CRUD, participation, and subscription endpoints."""

import asyncio
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db, AsyncSessionLocal
from app.core.deps import get_current_user
from app.models.event import (
    Event,
    EventAttendance,
    EventCategory,
    EventParticipant,
    EventStatus,
    EventSubscription,
    ParticipantStatus,
)
from app.models.user import User
from app.schemas.event import (
    AttendanceIn,
    AttendanceParticipantOut,
    CategoryOut,
    EventCreate,
    EventListOut,
    EventOut,
    EventUpdate,
    ParticipantOut,
    SubscriptionCreate,
    SubscriptionOut,
)
from app.services.event_notifications import dispatch_new_event_notifications
from app.services.file_service import save_event_image
from app.services.notifications import notify_attendance_request, notify_event_update, notify_new_participant

router = APIRouter(prefix="/events", tags=["events"])

_TARGET_CATEGORIES = {"Спорт", "Развлечения", "Творчество", "Обучение", "Отдых"}


@router.get("/categories", response_model=list[CategoryOut])
async def get_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EventCategory).where(EventCategory.name.in_(_TARGET_CATEGORIES))
    )
    return result.scalars().all()


@router.get("", response_model=list[EventListOut])
async def list_events(
    category_id: Optional[int] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    only_available: bool = Query(False),
    search: Optional[str] = Query(None),
    is_tour: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer))
        .where(Event.status == EventStatus.active)
    )
    if category_id:
        query = query.where(Event.category_id == category_id)
    if date_from:
        query = query.where(Event.date >= date_from)
    if date_to:
        query = query.where(Event.date <= date_to)
    if only_available:
        query = query.where(Event.participants_count < Event.capacity)
    if search:
        query = query.where(
            or_(
                Event.title.ilike(f"%{search}%"),
                Event.description.ilike(f"%{search}%"),
                Event.address.ilike(f"%{search}%"),
            )
        )
    if is_tour is not None:
        query = query.where(Event.is_tour == is_tour)
    query = query.order_by(Event.date.asc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(
    data: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = await db.get(EventCategory, data.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    event = Event(
        **data.model_dump(),
        organizer_id=current_user.id,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer))
        .where(Event.id == event.id)
    )
    full_event = result.scalar_one()

    # Fire-and-forget: notify category subscribers & organizer followers
    # Use a fresh session — the request-scoped `db` will be closed after the response
    _notify_kwargs = dict(
        event_id=full_event.id,
        event_title=full_event.title,
        event_date=full_event.date,
        event_address=full_event.address,
        category_id=full_event.category_id,
        category_name=full_event.category.name,
        category_icon=full_event.category.icon,
        organizer_id=current_user.id,
        organizer_name=f"{current_user.first_name} {current_user.last_name}",
    )

    async def _notify_with_new_session():
        async with AsyncSessionLocal() as new_db:
            await dispatch_new_event_notifications(db=new_db, **_notify_kwargs)

    asyncio.create_task(_notify_with_new_session())

    return full_event


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer))
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    return event


@router.put("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: int,
    data: EventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer))
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    changes = []
    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        old_val = getattr(event, field)
        if old_val != value:
            setattr(event, field, value)
            if field == "date":
                changes.append(f"Дата изменена на {value.strftime('%d.%m.%Y %H:%M')}")
            elif field == "address":
                changes.append(f"Адрес изменён на: {value}")
            elif field == "status" and value == EventStatus.cancelled:
                changes.append("Мероприятие отменено организатором")

    await db.commit()
    await db.refresh(event)

    if changes:
        subs_result = await db.execute(
            select(EventSubscription)
            .options(selectinload(EventSubscription.user))
            .where(EventSubscription.event_id == event_id)
        )
        for sub in subs_result.scalars().all():
            change_text = "\n".join(changes)
            tg_id = sub.user.telegram_id if sub.notify_telegram else None
            email = sub.user.email if sub.notify_email else None
            await notify_event_update(tg_id, email, event.title, change_text)

    return event


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    event.status = EventStatus.cancelled
    await db.commit()


@router.post("/{event_id}/image", response_model=EventOut)
async def upload_event_image(
    event_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer))
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    image_url = await save_event_image(file, event_id)
    event.image_url = image_url
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/{event_id}/join", status_code=status.HTTP_201_CREATED)
async def join_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.organizer))
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.status != EventStatus.active:
        raise HTTPException(status_code=400, detail="Мероприятие недоступно для записи")
    if event.is_full:
        raise HTTPException(status_code=400, detail="Мест больше нет")
    if event.organizer_id == current_user.id:
        raise HTTPException(status_code=400, detail="Организатор не может записаться на своё мероприятие")

    existing = await db.execute(
        select(EventParticipant).where(
            and_(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == current_user.id,
                EventParticipant.status == ParticipantStatus.registered,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Вы уже записаны на это мероприятие")

    participant = EventParticipant(event_id=event_id, user_id=current_user.id)
    db.add(participant)
    event.participants_count += 1
    await db.commit()

    organizer = event.organizer
    await notify_new_participant(
        organizer.telegram_id,
        organizer.email,
        f"{current_user.first_name} {current_user.last_name}",
        event.title,
        event.participants_count,
        event.capacity,
    )
    return {"message": "Вы успешно записались"}


@router.delete("/{event_id}/join", status_code=status.HTTP_200_OK)
async def leave_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    participant = await db.execute(
        select(EventParticipant).where(
            and_(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == current_user.id,
                EventParticipant.status == ParticipantStatus.registered,
            )
        )
    )
    record = participant.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Вы не записаны на это мероприятие")

    record.status = ParticipantStatus.cancelled
    event = await db.get(Event, event_id)
    if event and event.participants_count > 0:
        event.participants_count -= 1
    await db.commit()
    return {"message": "Вы отменили участие"}


@router.get("/{event_id}/participants", response_model=list[ParticipantOut])
async def get_participants(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только организатор может видеть список участников")

    result = await db.execute(
        select(EventParticipant)
        .options(selectinload(EventParticipant.user))
        .where(
            and_(
                EventParticipant.event_id == event_id,
                EventParticipant.status == ParticipantStatus.registered,
            )
        )
        .order_by(EventParticipant.joined_at.asc())
    )
    return result.scalars().all()


@router.post("/{event_id}/subscribe", response_model=SubscriptionOut)
async def subscribe_event(
    event_id: int,
    data: SubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")

    existing = await db.execute(
        select(EventSubscription).where(
            and_(EventSubscription.event_id == event_id, EventSubscription.user_id == current_user.id)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Вы уже подписаны на это мероприятие")

    if data.notify_telegram and not current_user.telegram_id:
        raise HTTPException(status_code=400, detail="Для Telegram-уведомлений необходимо привязать Telegram")

    sub = EventSubscription(
        event_id=event_id,
        user_id=current_user.id,
        notify_telegram=data.notify_telegram,
        notify_email=data.notify_email,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.delete("/{event_id}/subscribe", status_code=status.HTTP_200_OK)
async def unsubscribe_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(EventSubscription).where(
            and_(EventSubscription.event_id == event_id, EventSubscription.user_id == current_user.id)
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Подписка не найдена")
    await db.delete(sub)
    await db.commit()
    return {"message": "Подписка отменена"}


@router.get("/{event_id}/my-status")
async def my_event_status(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return whether current user is joined and/or subscribed to this event."""
    joined = await db.execute(
        select(EventParticipant).where(
            and_(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == current_user.id,
                EventParticipant.status == ParticipantStatus.registered,
            )
        )
    )
    subscribed = await db.execute(
        select(EventSubscription).where(
            and_(EventSubscription.event_id == event_id, EventSubscription.user_id == current_user.id)
        )
    )
    return {
        "joined": joined.scalar_one_or_none() is not None,
        "subscribed": subscribed.scalar_one_or_none() is not None,
    }


@router.get("/my/organized", response_model=list[EventListOut])
async def my_organized_events(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer))
        .where(Event.organizer_id == current_user.id)
        .order_by(Event.date.desc())
    )
    return result.scalars().all()


@router.get("/my/joined", response_model=list[EventListOut])
async def my_joined_events(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer))
        .join(EventParticipant, and_(
            EventParticipant.event_id == Event.id,
            EventParticipant.user_id == current_user.id,
            EventParticipant.status == ParticipantStatus.registered,
        ))
        .order_by(Event.date.asc())
    )
    return result.scalars().all()


@router.post("/{event_id}/attendance/notify", status_code=status.HTTP_200_OK)
async def request_attendance_notification(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send Telegram notification to organizer with participant list (once per event)."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только организатор")
    if event.date > datetime.utcnow():
        raise HTTPException(status_code=400, detail="Мероприятие ещё не завершилось")
    if event.attendance_notified:
        return {"message": "Уведомление уже отправлено"}

    participants_result = await db.execute(
        select(EventParticipant)
        .options(selectinload(EventParticipant.user))
        .where(and_(
            EventParticipant.event_id == event_id,
            EventParticipant.status == ParticipantStatus.registered,
        ))
    )
    participants = participants_result.scalars().all()
    names = [f"{p.user.first_name} {p.user.last_name}" for p in participants]

    from app.core.config import settings as cfg
    await notify_attendance_request(
        current_user.telegram_id,
        event.title,
        event_id,
        names,
        cfg.FRONTEND_URL,
    )

    event.attendance_notified = True
    await db.commit()
    return {"message": "Уведомление отправлено"}


@router.get("/{event_id}/attendance", response_model=list[AttendanceParticipantOut])
async def get_attendance(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return participants with their attendance status (organizer only)."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только организатор")

    participants_result = await db.execute(
        select(EventParticipant)
        .options(selectinload(EventParticipant.user))
        .where(and_(
            EventParticipant.event_id == event_id,
            EventParticipant.status == ParticipantStatus.registered,
        ))
        .order_by(EventParticipant.joined_at.asc())
    )
    participants = participants_result.scalars().all()

    attendance_result = await db.execute(
        select(EventAttendance).where(EventAttendance.event_id == event_id)
    )
    attendance_map = {a.user_id: a.attended for a in attendance_result.scalars().all()}

    return [
        AttendanceParticipantOut(
            user_id=p.user_id,
            user=p.user,
            attended=attendance_map.get(p.user_id),
        )
        for p in participants
    ]


@router.post("/{event_id}/attendance", status_code=status.HTTP_200_OK)
async def mark_attendance(
    event_id: int,
    data: AttendanceIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Organizer submits attendance; no-shows get rating -0.1."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только организатор")
    if event.date > datetime.utcnow():
        raise HTTPException(status_code=400, detail="Мероприятие ещё не завершилось")

    # Load existing attendance records
    existing_result = await db.execute(
        select(EventAttendance).where(EventAttendance.event_id == event_id)
    )
    existing_map: dict[int, EventAttendance] = {a.user_id: a for a in existing_result.scalars().all()}

    for item in data.items:
        prev = existing_map.get(item.user_id)
        if prev is None:
            # New record
            record = EventAttendance(
                event_id=event_id,
                user_id=item.user_id,
                attended=item.attended,
                marked_at=datetime.utcnow(),
            )
            db.add(record)
            if not item.attended:
                user = await db.get(User, item.user_id)
                if user:
                    user.rating = max(1.0, round(user.rating - 0.1, 2))
        else:
            # Update — revert previous rating change if status flipped
            if prev.attended != item.attended:
                user = await db.get(User, item.user_id)
                if user:
                    if not item.attended and prev.attended:
                        # was present, now absent → penalise
                        user.rating = max(1.0, round(user.rating - 0.1, 2))
                    elif item.attended and not prev.attended:
                        # was absent, now present → restore
                        user.rating = min(10.0, round(user.rating + 0.1, 2))
            prev.attended = item.attended
            prev.marked_at = datetime.utcnow()

    await db.commit()
    return {"message": "Посещаемость сохранена"}
