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


async def _cancel_underfilled_events():
    """Auto-cancel events starting in <6 h that haven't reached min_participants."""
    from app.models.event import Event, EventParticipant, EventStatus
    from app.services.notifications import notify_event_cancelled

    now = datetime.utcnow()
    window_start = now
    window_end = now + timedelta(hours=6)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Event)
            .options(
                selectinload(Event.participants).selectinload(EventParticipant.user),
            )
            .where(Event.status == EventStatus.active)
            .where(Event.is_tour == False)  # noqa: E712
            .where(Event.min_participants.is_not(None))
            .where(Event.date >= window_start)
            .where(Event.date <= window_end)
        )
        events = result.scalars().all()

        for event in events:
            active_count = sum(1 for p in event.participants if p.status.value == "registered")
            if active_count >= event.min_participants:
                continue

            event.status = EventStatus.cancelled
            logger.info(
                "Auto-cancelled event %s (min=%s, got=%s)",
                event.id, event.min_participants, active_count,
            )

            date_str = event.date.strftime("%d.%m.%Y %H:%M") if event.date else None
            for p in event.participants:
                if p.status.value != "registered":
                    continue
                try:
                    await notify_event_cancelled(
                        participant_telegram_id=p.user.telegram_id,
                        event_title=event.title,
                        event_date=date_str,
                        reason="min_participants",
                    )
                except Exception as e:
                    logger.error("Error notifying participant %s: %s", p.user_id, e)

        await db.commit()


async def _send_event_reminders():
    """Send reminder notifications 2 hours before an event to all subscribers."""
    from app.models.event import Event, EventSubscription
    from app.services.notifications import notify_event_reminder

    now = datetime.utcnow()
    window_start = now + timedelta(hours=1, minutes=50)
    window_end = now + timedelta(hours=2, minutes=10)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(EventSubscription)
            .join(EventSubscription.event)
            .join(EventSubscription.user)
            .options(
                selectinload(EventSubscription.event),
                selectinload(EventSubscription.user),
            )
            .where(EventSubscription.reminder_sent == False)  # noqa: E712
            .where(Event.date >= window_start)
            .where(Event.date <= window_end)
        )
        subs = result.scalars().all()

        for sub in subs:
            event = sub.event
            user = sub.user
            try:
                date_str = event.date.strftime("%d.%m.%Y %H:%M") if event.date else ""
                tg_id = user.telegram_id if sub.notify_telegram else None
                email = user.email if sub.notify_email else None
                await notify_event_reminder(
                    telegram_id=tg_id,
                    email=email,
                    event_title=event.title,
                    event_date=date_str,
                    event_address=event.address or "",
                )
                sub.reminder_sent = True
                logger.info("Reminder sent for event %s to user %s", event.id, user.id)
            except Exception as e:
                logger.error("Error sending reminder event=%s user=%s: %s", event.id, user.id, e)

        if subs:
            await db.commit()


async def _complete_past_events():
    """Mark active non-tour events whose date has passed as completed."""
    from app.models.event import Event, EventStatus

    now = datetime.utcnow()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Event)
            .where(Event.status == EventStatus.active)
            .where(Event.is_tour == False)  # noqa: E712
            .where(Event.date.is_not(None))
            .where(Event.date < now)
        )
        events = result.scalars().all()
        for event in events:
            event.status = EventStatus.completed
            logger.info("Auto-completed event %s (date=%s)", event.id, event.date)
        if events:
            await db.commit()


async def run_cron():
    """Infinite loop that runs attendance notifications periodically."""
    logger.info("Cron started (interval=%ds)", CRON_INTERVAL_SECONDS)
    # Run immediately on startup, then repeat on interval
    try:
        await _complete_past_events()
    except Exception as e:
        logger.error("Cron complete-past error (startup): %s", e)
    while True:
        await asyncio.sleep(CRON_INTERVAL_SECONDS)
        try:
            await _complete_past_events()
        except Exception as e:
            logger.error("Cron complete-past error: %s", e)
        try:
            await _send_event_reminders()
        except Exception as e:
            logger.error("Cron reminders error: %s", e)
        try:
            await _send_attendance_notifications()
        except Exception as e:
            logger.error("Cron error: %s", e)
        try:
            await _cancel_underfilled_events()
        except Exception as e:
            logger.error("Cron cancel-underfilled error: %s", e)
