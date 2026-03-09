"""FastAPI application entry point."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base, engine
from app.models import (  # noqa: F401 — register all models with Base.metadata
    CategorySubscription,
    Event,
    EventCategory,
    EventParticipant,
    EventSubscription,
    NotificationSettings,
    OrganizerSubscription,
    User,
    NewsPost,
)
from app.routers import auth, events, notifications, telegram, news

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def seed_categories():
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import select, func
    from app.models.event import Event, EventCategory

    categories = [
        {"name": "Спорт", "icon": "🏃", "color": "#FF6B35"},
        {"name": "Развлечения", "icon": "🎉", "color": "#3B82F6"},
        {"name": "Творчество", "icon": "🎨", "color": "#A855F7"},
        {"name": "Обучение", "icon": "📚", "color": "#10B981"},
        {"name": "Отдых", "icon": "🌿", "color": "#22C55E"},
        {"name": "Кино", "icon": "🎬", "color": "#EF4444"},
        {"name": "Музыка", "icon": "🎵", "color": "#F59E0B"},
        {"name": "Еда", "icon": "🍕", "color": "#EC4899"},
        {"name": "Игры", "icon": "🎮", "color": "#6366F1"},
        {"name": "Путешествия", "icon": "✈️", "color": "#14B8A6"},
    ]
    target_names = {c["name"] for c in categories}
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(EventCategory))
        existing = result.scalars().all()
        existing_by_name = {c.name: c for c in existing}

        # Add missing target categories
        for cat in categories:
            if cat["name"] not in existing_by_name:
                db.add(EventCategory(**cat))

        # Remove obsolete categories that have no events
        for cat in existing:
            if cat.name not in target_names:
                count_result = await db.execute(
                    select(func.count()).where(Event.category_id == cat.id)
                )
                if count_result.scalar() == 0:
                    await db.delete(cat)

        await db.commit()
        logger.info("Categories synced")


async def migrate_schema():
    """Apply incremental schema changes that create_all doesn't handle."""
    async with engine.begin() as conn:
        await conn.execute(text(
            "ALTER TABLE events ADD COLUMN IF NOT EXISTS is_tour BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        await conn.execute(text(
            "ALTER TABLE events ADD COLUMN IF NOT EXISTS attendance_notified BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS rating FLOAT NOT NULL DEFAULT 5.0"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS event_attendance (
                id SERIAL PRIMARY KEY,
                event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                attended BOOLEAN,
                marked_at TIMESTAMP,
                UNIQUE(event_id, user_id)
            )
        """))


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await migrate_schema()
    await seed_categories()
    os.makedirs(os.path.join(settings.UPLOAD_DIR, "avatars"), exist_ok=True)
    os.makedirs(os.path.join(settings.UPLOAD_DIR, "events"), exist_ok=True)

    ptb = None
    if settings.TELEGRAM_BOT_TOKEN:
        from app.routers.telegram import get_ptb_app
        ptb = get_ptb_app()
        await ptb.initialize()
        await ptb.start()
        await ptb.updater.start_polling()
        logger.info("Telegram bot polling started")

    from app.services.cron import run_cron
    cron_task = asyncio.create_task(run_cron())
    logger.info("Application started")
    yield

    cron_task.cancel()
    try:
        await cron_task
    except asyncio.CancelledError:
        pass

    if ptb:
        await ptb.updater.stop()
        await ptb.stop()
        await ptb.shutdown()
    await engine.dispose()


app = FastAPI(
    title="Повод — платформа мероприятий",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(os.path.join(settings.UPLOAD_DIR, "avatars"), exist_ok=True)
os.makedirs(os.path.join(settings.UPLOAD_DIR, "events"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.include_router(auth.router)
app.include_router(events.router)
app.include_router(notifications.router)
app.include_router(telegram.router)
app.include_router(news.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
