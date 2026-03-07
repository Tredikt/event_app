"""Background cron tasks."""

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.core.config import settings

logger = logging.getLogger(__name__)

ATTENDANCE_NOTIFY_DELAY_HOURS = 3
CRON_INTERVAL_SECONDS = 15 * 60  # run every 15 minutes


async def _send_attendance_notifications():
    """Find events that ended 3+ hours ago and haven't been notified yet."""
    from app.models.event import Event, EventParticipant
    from app.services.notifications import notify_attendance_request

    cutoff = datetime.utcnow() - timedelta(hours=ATTENDANCE_NOTIFY_DELAY_HOURS)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Event)
            .options(
                selectinload(Event.organizer),
                selectinload(Event.participants).selectinload(EventParticipant.user),
            )
            .where(Event.date <= cutoff)
            .where(Event.attendance_notified == False)  # noqa: E712
        )
        events = result.scalars().all()

        for event in events:
            try:
                organizer = event.organizer
                if not organizer.telegram_id:
                    event.attendance_notified = True
                    continue

                names = [
                    f"{p.user.first_name} {p.user.last_name}".strip()
                    for p in event.participants
                ]

                await notify_attendance_request(
                    telegram_id=organizer.telegram_id,
                    event_title=event.title,
                    event_id=event.id,
                    participant_names=names,
                    frontend_url=settings.FRONTEND_URL,
                )
                event.attendance_notified = True
                logger.info("Attendance notification sent for event %s", event.id)
            except Exception as e:
                logger.error("Error notifying event %s: %s", event.id, e)

        await db.commit()


async def run_cron():
    """Infinite loop that runs attendance notifications periodically."""
    logger.info("Cron started (interval=%ds)", CRON_INTERVAL_SECONDS)
    while True:
        await asyncio.sleep(CRON_INTERVAL_SECONDS)
        try:
            await _send_attendance_notifications()
        except Exception as e:
            logger.error("Cron error: %s", e)
