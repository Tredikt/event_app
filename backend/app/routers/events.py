"""Event CRUD, participation, and subscription endpoints."""

import asyncio
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status, Response
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db, AsyncSessionLocal
from app.core.deps import get_current_user
from app.core.utils import moscow_now
from app.models.event import (
    Event,
    EventAttendance,
    EventCategory,
    EventImage,
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
from app.services.notifications import notify_attendance_request, notify_event_cancelled, notify_event_update, notify_joined_event, notify_new_participant, notify_participant_left, notify_payment_submitted, notify_payment_approved, notify_payment_rejected

router = APIRouter(prefix="/events", tags=["events"])

_TOURS_CATEGORIES = {"Спорт", "Развлечения", "Творчество", "Обучение", "Отдых"}


@router.get("/categories", response_model=list[CategoryOut])
async def get_categories(response: Response, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=3600"
    result = await db.execute(select(EventCategory))
    return result.scalars().all()


@router.get("", response_model=list[EventListOut])
async def list_events(
    response: Response,
    category_id: Optional[int] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    only_available: bool = Query(False),
    is_free: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    is_tour: Optional[bool] = Query(None),
    city: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    catalog_mode = is_tour is True
    query = (
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer))
        .where(Event.status == EventStatus.active)
    )
    # Для обычных мероприятий показываем только будущие; каталог не имеет дат
    if not catalog_mode:
        query = query.where(
            or_(Event.date >= moscow_now(), Event.date.is_(None))
        ).where(Event.is_tour == False)  # noqa: E712
    if category_id:
        query = query.where(Event.category_id == category_id)
    if date_from:
        query = query.where(Event.date >= date_from)
    if date_to:
        query = query.where(Event.date <= date_to)
    if only_available:
        query = query.where(Event.participants_count < Event.capacity)
    if is_free is True:
        query = query.where(or_(Event.price.is_(None), Event.price == 0))
    elif is_free is False:
        query = query.where(Event.price > 0)
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
    # Каталог — по дате создания (свежее первым), мероприятия — по дате события
    if catalog_mode:
        query = query.order_by(Event.created_at.desc()).offset(skip).limit(limit)
    else:
        if city:
            city_priority = case(
                (Event.address.ilike(f"%{city}%"), 0),
                else_=1,
            )
            query = query.order_by(city_priority, Event.date.asc())
        else:
            query = query.order_by(Event.date.asc())
        query = query.offset(skip).limit(limit)
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
        .options(selectinload(Event.category), selectinload(Event.organizer), selectinload(Event.images))
        .where(Event.id == event.id)
    )
    full_event = result.scalar_one()

    # Fire-and-forget: notify category subscribers & organizer followers
    # Use a fresh session — the request-scoped `db` will be closed after the response
    _notify_kwargs = dict(
        event_id=full_event.id,
        event_title=full_event.title,
        event_date=full_event.date or moscow_now(),
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


@router.post("/{event_id}/instantiate", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def instantiate_catalog_event(
    event_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a one-time event from a catalog item."""
    result = await db.execute(
        select(Event).options(selectinload(Event.category), selectinload(Event.organizer)).where(Event.id == event_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if not source.is_tour:
        raise HTTPException(status_code=400, detail="Только каталожные позиции можно использовать как шаблон")
    if source.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет прав")

    date_str = body.get("date")
    if not date_str:
        raise HTTPException(status_code=422, detail="Укажите дату")
    try:
        from datetime import datetime as dt
        event_date = dt.fromisoformat(date_str.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail="Неверный формат даты")

    new_event = Event(
        title=source.title,
        description=source.description,
        date=event_date,
        capacity=source.capacity,
        address=source.address,
        latitude=source.latitude,
        longitude=source.longitude,
        category_id=source.category_id,
        image_url=source.image_url,
        is_tour=False,
        organizer_id=current_user.id,
    )
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)

    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer), selectinload(Event.images))
        .where(Event.id == new_event.id)
    )
    return result.scalar_one()


@router.post("/{event_id}/repeat", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def repeat_event(
    event_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a copy of a past event with a new date."""
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer), selectinload(Event.images))
        .where(Event.id == event_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if source.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет прав")

    date_str = body.get("date")
    if not date_str:
        raise HTTPException(status_code=422, detail="Укажите дату")
    try:
        from datetime import datetime as dt
        event_date = dt.fromisoformat(date_str.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail="Неверный формат даты")

    new_event = Event(
        title=source.title,
        description=source.description,
        date=event_date,
        capacity=source.capacity,
        min_participants=source.min_participants,
        address=source.address,
        latitude=source.latitude,
        longitude=source.longitude,
        category_id=source.category_id,
        image_url=source.image_url,
        price=source.price,
        payment_details=source.payment_details,
        is_tour=False,
        organizer_id=current_user.id,
    )
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)

    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer), selectinload(Event.images))
        .where(Event.id == new_event.id)
    )
    return result.scalar_one()


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer), selectinload(Event.images))
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    sub_count = await db.scalar(
        select(func.count()).where(EventSubscription.event_id == event_id)
    ) or 0
    out = EventOut.model_validate(event)
    out.subscriptions_count = sub_count
    return out


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
    is_cancellation = False
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
                is_cancellation = True

    await db.commit()

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

    if is_cancellation:
        date_str = event.date.strftime("%d.%m.%Y %H:%M") if event.date else None
        parts_result = await db.execute(
            select(EventParticipant)
            .options(selectinload(EventParticipant.user))
            .where(EventParticipant.event_id == event_id)
            .where(EventParticipant.status == ParticipantStatus.registered)
        )
        for p in parts_result.scalars().all():
            asyncio.create_task(notify_event_cancelled(
                participant_telegram_id=p.user.telegram_id,
                event_title=event.title,
                event_date=date_str,
                reason="organizer",
            ))

    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer), selectinload(Event.images))
        .where(Event.id == event_id)
    )
    return result.scalar_one()


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Event)
        .options(
            selectinload(Event.participants).selectinload(EventParticipant.user)
        )
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    date_str = event.date.strftime("%d.%m.%Y %H:%M") if event.date else None
    participants_to_notify = [
        p.user for p in event.participants if p.status == ParticipantStatus.registered
    ]
    title = event.title

    await db.delete(event)
    await db.commit()

    for u in participants_to_notify:
        asyncio.create_task(notify_event_cancelled(
            participant_telegram_id=u.telegram_id,
            event_title=title,
            event_date=date_str,
            reason="organizer",
        ))


@router.post("/{event_id}/image", response_model=EventOut)
async def upload_event_image(
    event_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer), selectinload(Event.images))
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    image_url = await save_event_image(file, event_id)
    order = len(event.images)
    db.add(EventImage(event_id=event_id, image_url=image_url, order=order))
    if not event.image_url:
        event.image_url = image_url
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/{event_id}/images", response_model=EventOut)
async def upload_event_images(
    event_id: int,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer), selectinload(Event.images))
        .where(Event.id == event_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    start_order = len(event.images)
    for i, file in enumerate(files):
        if not file.filename:
            continue
        image_url = await save_event_image(file, event_id)
        db.add(EventImage(event_id=event_id, image_url=image_url, order=start_order + i))
        if not event.image_url:
            event.image_url = image_url

    await db.commit()
    result = await db.execute(
        select(Event)
        .options(selectinload(Event.category), selectinload(Event.organizer), selectinload(Event.images))
        .where(Event.id == event_id)
    )
    return result.scalar_one()


@router.delete("/{event_id}/images/{image_id}", status_code=204)
async def delete_event_image(
    event_id: int,
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Недостаточно прав")

    img = await db.get(EventImage, image_id)
    if not img or img.event_id != event_id:
        raise HTTPException(status_code=404, detail="Фото не найдено")

    deleted_url = img.image_url
    await db.delete(img)

    # If deleted image was the cover, update to next available
    if event.image_url == deleted_url:
        result = await db.execute(
            select(EventImage)
            .where(EventImage.event_id == event_id, EventImage.id != image_id)
            .order_by(EventImage.order)
            .limit(1)
        )
        next_img = result.scalar_one_or_none()
        event.image_url = next_img.image_url if next_img else None

    await db.commit()


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
    if event.date and (event.date - moscow_now()) < timedelta(hours=6):
        raise HTTPException(status_code=400, detail="Регистрация закрыта (менее 6 часов до начала)")
    if event.is_full:
        raise HTTPException(status_code=400, detail="Мест больше нет")
    if event.organizer_id == current_user.id:
        raise HTTPException(status_code=400, detail="Организатор не может записаться на своё мероприятие")

    existing = await db.execute(
        select(EventParticipant).where(
            and_(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == current_user.id,
                EventParticipant.status.in_([
                    ParticipantStatus.registered,
                    ParticipantStatus.pending_payment,
                    ParticipantStatus.payment_submitted,
                ]),
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Вы уже записаны на это мероприятие")

    is_paid = event.price and event.price > 0

    if is_paid:
        # Paid event: create participant with pending_payment status, don't increment count
        participant = EventParticipant(
            event_id=event_id,
            user_id=current_user.id,
            status=ParticipantStatus.pending_payment,
        )
        db.add(participant)
        await db.commit()
        return {"message": "Заявка подана, ожидайте подтверждения оплаты", "payment_required": True}
    else:
        # Free event: existing flow
        participant = EventParticipant(event_id=event_id, user_id=current_user.id)
        db.add(participant)
        event.participants_count += 1
        await db.commit()

        organizer = event.organizer
        from app.core.config import settings
        event_date_str = event.date.strftime("%d.%m.%Y %H:%M") if event.date else None

        await notify_new_participant(
            organizer.telegram_id,
            organizer.email,
            f"{current_user.first_name} {current_user.last_name}",
            event.title,
            event.participants_count,
            event.capacity,
            participant_telegram_username=current_user.telegram_username,
        )
        await notify_joined_event(
            participant_telegram_id=current_user.telegram_id,
            event_title=event.title,
            event_date=event_date_str,
            event_address=event.address,
            organizer_name=f"{organizer.first_name} {organizer.last_name}",
            organizer_telegram_username=organizer.telegram_username,
            frontend_url=settings.FRONTEND_URL,
            event_id=event_id,
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
                EventParticipant.status.in_([
                    ParticipantStatus.registered,
                    ParticipantStatus.pending_payment,
                    ParticipantStatus.payment_submitted,
                ]),
            )
        )
    )
    record = participant.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Вы не записаны на это мероприятие")

    was_registered = record.status == ParticipantStatus.registered
    record.status = ParticipantStatus.cancelled
    event = await db.get(Event, event_id, options=[selectinload(Event.organizer)])
    # Only decrement count if they were fully registered
    if event and was_registered and event.participants_count > 0:
        event.participants_count -= 1
    await db.commit()

    if event and was_registered:
        participant_name = f"{current_user.first_name} {current_user.last_name}".strip()
        asyncio.create_task(notify_participant_left(
            organizer_telegram_id=event.organizer.telegram_id,
            organizer_email=event.organizer.email,
            participant_name=participant_name,
            event_title=event.title,
            current_count=event.participants_count,
            capacity=event.capacity,
        ))

    return {"message": "Вы отменили участие"}


@router.post("/{event_id}/payment-confirm", status_code=status.HTTP_200_OK)
async def confirm_payment(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """User confirms they have paid; status becomes payment_submitted and organizer is notified."""
    result = await db.execute(
        select(EventParticipant).where(
            and_(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == current_user.id,
                EventParticipant.status == ParticipantStatus.pending_payment,
            )
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Заявка на оплату не найдена")

    record.status = ParticipantStatus.payment_submitted
    await db.commit()

    event = await db.execute(
        select(Event).options(selectinload(Event.organizer)).where(Event.id == event_id)
    )
    ev = event.scalar_one_or_none()
    if ev:
        asyncio.create_task(notify_payment_submitted(
            organizer_telegram_id=ev.organizer.telegram_id,
            participant_name=f"{current_user.first_name} {current_user.last_name}",
            event_title=ev.title,
            participant_telegram_username=current_user.telegram_username,
        ))

    return {"message": "Оплата отмечена, ожидайте подтверждения организатора"}


@router.post("/{event_id}/participants/{user_id}/approve", status_code=status.HTTP_200_OK)
async def approve_participant(
    event_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Organizer approves payment: status -> registered, participants_count++, notify user."""
    event_result = await db.execute(
        select(Event).options(selectinload(Event.organizer)).where(Event.id == event_id)
    )
    ev = event_result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if ev.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только организатор")

    result = await db.execute(
        select(EventParticipant).where(
            and_(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == user_id,
                EventParticipant.status.in_([
                    ParticipantStatus.pending_payment,
                    ParticipantStatus.payment_submitted,
                ]),
            )
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    record.status = ParticipantStatus.registered
    ev.participants_count += 1
    await db.commit()

    participant_user = await db.get(User, user_id)
    event_date_str = ev.date.strftime("%d.%m.%Y %H:%M") if ev.date else None
    if participant_user:
        asyncio.create_task(notify_payment_approved(
            user_telegram_id=participant_user.telegram_id,
            event_title=ev.title,
            event_date=event_date_str,
            event_address=ev.address,
        ))

    return {"message": "Участие подтверждено"}


@router.post("/{event_id}/participants/{user_id}/reject", status_code=status.HTTP_200_OK)
async def reject_participant(
    event_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Organizer rejects payment application: status -> cancelled, notify user."""
    event_result = await db.execute(
        select(Event).where(Event.id == event_id)
    )
    ev = event_result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if ev.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только организатор")

    result = await db.execute(
        select(EventParticipant).where(
            and_(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == user_id,
                EventParticipant.status.in_([
                    ParticipantStatus.pending_payment,
                    ParticipantStatus.payment_submitted,
                ]),
            )
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    record.status = ParticipantStatus.cancelled
    await db.commit()

    participant_user = await db.get(User, user_id)
    if participant_user:
        asyncio.create_task(notify_payment_rejected(
            user_telegram_id=participant_user.telegram_id,
            event_title=ev.title,
        ))

    return {"message": "Заявка отклонена"}


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
                EventParticipant.status.in_([
                    ParticipantStatus.registered,
                    ParticipantStatus.pending_payment,
                    ParticipantStatus.payment_submitted,
                ]),
            )
        )
        .order_by(EventParticipant.joined_at.asc())
    )
    participants = result.scalars().all()

    # Collect user ids to query their stats across this organizer's events
    user_ids = [p.user_id for p in participants]
    organizer_event_ids_q = select(Event.id).where(Event.organizer_id == event.organizer_id)

    # total registrations per user (any non-cancelled status)
    reg_result = await db.execute(
        select(EventParticipant.user_id, func.count().label("cnt"))
        .where(
            and_(
                EventParticipant.user_id.in_(user_ids),
                EventParticipant.event_id.in_(organizer_event_ids_q),
                EventParticipant.status != ParticipantStatus.cancelled,
            )
        )
        .group_by(EventParticipant.user_id)
    )
    reg_counts = {row.user_id: row.cnt for row in reg_result}

    # total attended per user (EventAttendance with attended=True)
    att_result = await db.execute(
        select(EventAttendance.user_id, func.count().label("cnt"))
        .where(
            and_(
                EventAttendance.user_id.in_(user_ids),
                EventAttendance.event_id.in_(organizer_event_ids_q),
                EventAttendance.attended == True,  # noqa: E712
            )
        )
        .group_by(EventAttendance.user_id)
    )
    att_counts = {row.user_id: row.cnt for row in att_result}

    return [
        ParticipantOut.from_participant(
            p,
            total_registrations=reg_counts.get(p.user_id, 0),
            total_attended=att_counts.get(p.user_id, 0),
        )
        for p in participants
    ]


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
    participant_result = await db.execute(
        select(EventParticipant).where(
            and_(
                EventParticipant.event_id == event_id,
                EventParticipant.user_id == current_user.id,
                EventParticipant.status.in_([
                    ParticipantStatus.registered,
                    ParticipantStatus.pending_payment,
                    ParticipantStatus.payment_submitted,
                ]),
            )
        )
    )
    participant = participant_result.scalar_one_or_none()
    subscribed = await db.execute(
        select(EventSubscription).where(
            and_(EventSubscription.event_id == event_id, EventSubscription.user_id == current_user.id)
        )
    )
    payment_status = participant.status.value if participant else None
    return {
        "joined": participant is not None and participant.status == ParticipantStatus.registered,
        "subscribed": subscribed.scalar_one_or_none() is not None,
        "payment_status": payment_status,
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
    if event.date > moscow_now():
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
    """Organizer submits attendance."""  # RATING DISABLED — removed 'no-shows get rating -0.1'
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Мероприятие не найдено")
    if event.organizer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только организатор")
    if event.date > moscow_now():
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
                marked_at=moscow_now(),
            )
            db.add(record)
            # RATING DISABLED — no-show rating penalty commented out
            # if not item.attended:
            #     user = await db.get(User, item.user_id)
            #     if user:
            #         user.rating = max(1.0, round(user.rating - 0.1, 2))
        else:
            # Update — rating change on status flip commented out
            # RATING DISABLED
            # if prev.attended != item.attended:
            #     user = await db.get(User, item.user_id)
            #     if user:
            #         if not item.attended and prev.attended:
            #             # was present, now absent → penalise
            #             user.rating = max(1.0, round(user.rating - 0.1, 2))
            #         elif item.attended and not prev.attended:
            #             # was absent, now present → restore
            #             user.rating = min(10.0, round(user.rating + 0.1, 2))
            prev.attended = item.attended
            prev.marked_at = moscow_now()

    await db.commit()
    return {"message": "Посещаемость сохранена"}
