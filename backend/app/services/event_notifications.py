"""
Called after a new event is created.
Finds all users who subscribed to the event's category OR follow the organizer,
deduplicates, respects individual notification settings, and sends TG messages.
"""
import asyncio
import logging
from datetime import datetime

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.notifications import (
    CategorySubscription,
    NotificationSettings,
    OrganizerSubscription,
)
from app.models.user import User
from app.services.notifications import notify_new_event_to_subscribers
from app.core.config import settings

logger = logging.getLogger(__name__)


async def dispatch_new_event_notifications(
    db: AsyncSession,
    event_id: int,
    event_title: str,
    event_date: datetime,
    event_address: str,
    category_id: int,
    category_name: str,
    category_icon: str,
    organizer_id: int,
    organizer_name: str,
):
    """Run after event creation — fire & forget via asyncio.create_task."""
    date_str = event_date.strftime("%d.%m.%Y %H:%M")

    # ── 1. Users subscribed to this category ──────────────────────────────
    cat_result = await db.execute(
        select(CategorySubscription)
        .options(selectinload(CategorySubscription.user).selectinload(User.notification_settings))
        .where(
            and_(
                CategorySubscription.category_id == category_id,
                CategorySubscription.user_id != organizer_id,  # skip organizer himself
            )
        )
    )
    cat_subs = cat_result.scalars().all()

    # ── 2. Users following this organizer ─────────────────────────────────
    org_result = await db.execute(
        select(OrganizerSubscription)
        .options(selectinload(OrganizerSubscription.follower).selectinload(User.notification_settings))
        .where(OrganizerSubscription.organizer_id == organizer_id)
    )
    org_subs = org_result.scalars().all()

    # ── 3. Build recipient maps (deduplicate: user_id → {reason, user}) ───
    # Priority: organizer subscription wins over category (personal message)
    recipients_by_reason: dict[str, dict[int, User]] = {"category": {}, "organizer": {}}

    for cs in cat_subs:
        u = cs.user
        ns = u.notification_settings
        if ns and not ns.notify_new_events:
            continue
        recipients_by_reason["category"][u.id] = u

    for os_ in org_subs:
        u = os_.follower
        ns = u.notification_settings
        if ns and not ns.notify_organizer_events:
            continue
        # Move from category to organizer bucket if already there
        recipients_by_reason["category"].pop(u.id, None)
        recipients_by_reason["organizer"][u.id] = u

    # ── 4. Send batches ───────────────────────────────────────────────────
    async def _batch(reason: str, users: dict[int, User]):
        if not users:
            return
        batch = [
            {
                "telegram_id": u.telegram_id,
                "email": u.email,
                "settings": u.notification_settings,
            }
            for u in users.values()
            if u.telegram_id or u.email
        ]
        if not batch:
            return
        await notify_new_event_to_subscribers(
            event_id=event_id,
            event_title=event_title,
            event_date=date_str,
            event_address=event_address,
            category_name=category_name,
            category_icon=category_icon,
            organizer_name=organizer_name,
            reason=reason,
            recipients=batch,
            frontend_url=settings.FRONTEND_URL,
        )
        logger.info(f"Sent new-event notifications ({reason}) for event {event_id} to {len(batch)} users")

    await asyncio.gather(
        _batch("category", recipients_by_reason["category"]),
        _batch("organizer", recipients_by_reason["organizer"]),
    )
