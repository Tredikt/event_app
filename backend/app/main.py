"""FastAPI application entry point."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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
)
from app.routers import auth, events, notifications, telegram

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def seed_categories():
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import select
    from app.models.event import EventCategory

    categories = [
        {"name": "Спорт", "icon": "🏃", "color": "#FF6B35"},
        {"name": "Творчество", "icon": "🎨", "color": "#A855F7"},
        {"name": "Настолки", "icon": "🎲", "color": "#3B82F6"},
        {"name": "Обучение", "icon": "📚", "color": "#10B981"},
        {"name": "Музыка", "icon": "🎵", "color": "#F59E0B"},
        {"name": "Кино", "icon": "🎬", "color": "#EF4444"},
        {"name": "Еда", "icon": "🍕", "color": "#F97316"},
        {"name": "Технологии", "icon": "💻", "color": "#6366F1"},
        {"name": "Природа", "icon": "🌿", "color": "#22C55E"},
        {"name": "Другое", "icon": "✨", "color": "#64748B"},
    ]
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(EventCategory))
        existing = result.scalars().all()
        if not existing:
            for cat in categories:
                db.add(EventCategory(**cat))
            await db.commit()
            logger.info("Categories seeded")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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

    logger.info("Application started")
    yield

    if ptb:
        await ptb.updater.stop()
        await ptb.stop()
        await ptb.shutdown()
    await engine.dispose()


app = FastAPI(
    title="Communicate — платформа мероприятий",
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


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
