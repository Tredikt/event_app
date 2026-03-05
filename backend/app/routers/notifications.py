"""Notification settings, category and organizer subscription endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.event import EventCategory
from app.models.notifications import (
    CategorySubscription,
    NotificationSettings,
    OrganizerSubscription,
)
from app.models.user import User
from app.schemas.notifications import (
    CategorySubscriptionOut,
    NotificationSettingsOut,
    NotificationSettingsUpdate,
    OrganizerSubscriptionOut,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── Settings ────────────────────────────────────────────────────────────────

async def _get_or_create_settings(user_id: int, db: AsyncSession) -> NotificationSettings:
    result = await db.execute(
        select(NotificationSettings).where(NotificationSettings.user_id == user_id)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = NotificationSettings(user_id=user_id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.get("/settings", response_model=NotificationSettingsOut)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_or_create_settings(current_user.id, db)


@router.put("/settings", response_model=NotificationSettingsOut)
async def update_settings(
    data: NotificationSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = await _get_or_create_settings(current_user.id, db)
    update = data.model_dump(exclude_none=True)
    for field, value in update.items():
        setattr(settings, field, value)
    await db.commit()
    await db.refresh(settings)
    return settings


# ── Category subscriptions ───────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategorySubscriptionOut])
async def get_category_subscriptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CategorySubscription)
        .options(selectinload(CategorySubscription.category))
        .where(CategorySubscription.user_id == current_user.id)
        .order_by(CategorySubscription.created_at.asc())
    )
    return result.scalars().all()


@router.post("/categories/{category_id}", response_model=CategorySubscriptionOut, status_code=status.HTTP_201_CREATED)
async def subscribe_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category = await db.get(EventCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    existing = await db.execute(
        select(CategorySubscription).where(
            and_(CategorySubscription.user_id == current_user.id,
                 CategorySubscription.category_id == category_id)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Вы уже подписаны на эту категорию")

    if not current_user.telegram_id:
        raise HTTPException(
            status_code=400,
            detail="Для подписки на уведомления необходимо привязать Telegram в профиле"
        )

    sub = CategorySubscription(user_id=current_user.id, category_id=category_id)
    db.add(sub)
    await db.commit()

    result = await db.execute(
        select(CategorySubscription)
        .options(selectinload(CategorySubscription.category))
        .where(CategorySubscription.id == sub.id)
    )
    return result.scalar_one()


@router.delete("/categories/{category_id}", status_code=status.HTTP_200_OK)
async def unsubscribe_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CategorySubscription).where(
            and_(CategorySubscription.user_id == current_user.id,
                 CategorySubscription.category_id == category_id)
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Подписка не найдена")
    await db.delete(sub)
    await db.commit()
    return {"message": "Подписка на категорию отменена"}


# ── Organizer subscriptions ──────────────────────────────────────────────────

@router.get("/organizers", response_model=list[OrganizerSubscriptionOut])
async def get_organizer_subscriptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OrganizerSubscription)
        .options(selectinload(OrganizerSubscription.organizer))
        .where(OrganizerSubscription.follower_id == current_user.id)
        .order_by(OrganizerSubscription.created_at.asc())
    )
    return result.scalars().all()


@router.post("/organizers/{organizer_id}", response_model=OrganizerSubscriptionOut, status_code=status.HTTP_201_CREATED)
async def follow_organizer(
    organizer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if organizer_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя подписаться на самого себя")

    organizer = await db.get(User, organizer_id)
    if not organizer or not organizer.is_active:
        raise HTTPException(status_code=404, detail="Организатор не найден")

    existing = await db.execute(
        select(OrganizerSubscription).where(
            and_(OrganizerSubscription.follower_id == current_user.id,
                 OrganizerSubscription.organizer_id == organizer_id)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Вы уже подписаны на этого организатора")

    if not current_user.telegram_id:
        raise HTTPException(
            status_code=400,
            detail="Для подписки на уведомления необходимо привязать Telegram в профиле"
        )

    sub = OrganizerSubscription(follower_id=current_user.id, organizer_id=organizer_id)
    db.add(sub)
    await db.commit()

    result = await db.execute(
        select(OrganizerSubscription)
        .options(selectinload(OrganizerSubscription.organizer))
        .where(OrganizerSubscription.id == sub.id)
    )
    return result.scalar_one()


@router.delete("/organizers/{organizer_id}", status_code=status.HTTP_200_OK)
async def unfollow_organizer(
    organizer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(OrganizerSubscription).where(
            and_(OrganizerSubscription.follower_id == current_user.id,
                 OrganizerSubscription.organizer_id == organizer_id)
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Подписка не найдена")
    await db.delete(sub)
    await db.commit()
    return {"message": "Подписка на организатора отменена"}


@router.get("/organizers/{organizer_id}/status")
async def get_follow_status(
    organizer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if current user follows a specific organizer."""
    result = await db.execute(
        select(OrganizerSubscription).where(
            and_(OrganizerSubscription.follower_id == current_user.id,
                 OrganizerSubscription.organizer_id == organizer_id)
        )
    )
    return {"following": result.scalar_one_or_none() is not None}
