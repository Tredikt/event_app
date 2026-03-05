"""Telegram bot webhook handler and account-linking utilities."""

import logging
import secrets
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from telegram import Update
from telegram.ext import Application, MessageHandler, filters

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.deps import get_current_user
from app.models.notifications import NotificationSettings
from app.models.user import User
from app.services.notifications import send_telegram_message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telegram", tags=["telegram"])

# token -> user_id  (use Redis in production)
PENDING_LINKS: dict[str, int] = {}

# Cached bot username — fetched once from Telegram on first call
_bot_username: Optional[str] = None

# Shared PTB Bot instance — set in get_ptb_app(), reused for all outgoing messages
_bot = None


def get_bot():
    """Return the shared PTB Bot instance (None if not yet initialised)."""
    return _bot


async def get_bot_username() -> Optional[str]:
    """Fetch and cache the bot's own @username via getMe."""
    global _bot_username

    if _bot_username:
        return _bot_username

    if not settings.TELEGRAM_BOT_TOKEN:
        return None

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/getMe"
            )
            data = response.json()
            if data.get("ok"):
                _bot_username = data["result"].get("username")
                logger.info("Bot username fetched: @%s", _bot_username)
                return _bot_username
    except Exception as exc:
        logger.warning("Could not fetch bot username: %s", exc)

    return None


@router.post("/webhook")
async def telegram_webhook(request: Request):
    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Telegram bot not configured")

    data = await request.json()
    message = data.get("message", {})
    text = message.get("text", "") or ""
    chat_id = message.get("chat", {}).get("id")
    username = message.get("from", {}).get("username")

    if not chat_id:
        return {"ok": True}

    if text.startswith("/start "):
        token = text.split(" ", 1)[1].strip()
        if token in PENDING_LINKS:
            user_id = PENDING_LINKS.pop(token)
            async with AsyncSessionLocal() as db:
                user = await db.get(User, user_id)
                if user:
                    user.telegram_id = chat_id
                    user.telegram_username = username
                    await db.commit()
                    await send_telegram_message(
                        chat_id,
                        "✅ <b>Telegram успешно привязан!</b>\n\n"
                        "Теперь вы будете получать уведомления о мероприятиях.\n\n"
                        "📋 <b>Доступные команды:</b>\n"
                        "/stop — Отключить уведомления\n"
                        "/on — Включить уведомления\n"
                        "/help — Помощь",
                    )
                else:
                    await send_telegram_message(
                        chat_id, "❌ Токен недействителен или истёк."
                    )
        else:
            await send_telegram_message(
                chat_id,
                "👋 <b>Привет! Это бот платформы Communicate.</b>\n\n"
                "Здесь вы получаете уведомления о мероприятиях.\n\n"
                "📋 <b>Доступные команды:</b>\n"
                "/stop — Отключить уведомления\n"
                "/on — Включить уведомления\n"
                "/help — Помощь\n\n"
                "Для привязки аккаунта перейдите в настройки профиля на сайте.",
            )

    elif text == "/help":
        await send_telegram_message(
            chat_id,
            "📋 <b>Команды бота:</b>\n\n"
            "/start — Начало работы\n"
            "/help — Помощь\n\n"
            "Для привязки аккаунта перейдите в настройки профиля на сайте.",
        )

    return {"ok": True}


@router.post("/generate-link-token")
async def generate_link_token(
    current_user: User = Depends(get_current_user),
):
    """Generate a one-time deep-link to connect the user's Telegram account."""
    if not settings.TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Telegram bot not configured")

    token = secrets.token_urlsafe(32)
    PENDING_LINKS[token] = current_user.id

    bot_username = await get_bot_username()
    if not bot_username:
        raise HTTPException(
            status_code=503,
            detail="Не удалось получить username бота. Проверьте TELEGRAM_BOT_TOKEN.",
        )

    return {
        "token": token,
        "link": f"https://t.me/{bot_username}?start={token}",
    }


async def _ptb_message_handler(update: Update, context) -> None:
    """Handle all text messages from the Telegram bot via polling."""
    message = update.message
    if not message or not message.text:
        return

    text = message.text
    chat_id = message.chat.id
    username = message.from_user.username if message.from_user else None

    if text.startswith("/start"):
        parts = text.split(" ", 1)
        if len(parts) > 1:
            token = parts[1].strip()
            if token in PENDING_LINKS:
                user_id = PENDING_LINKS.pop(token)
                async with AsyncSessionLocal() as db:
                    user = await db.get(User, user_id)
                    if user:
                        user.telegram_id = chat_id
                        user.telegram_username = username
                        await db.commit()
                        await send_telegram_message(
                            chat_id,
                            "✅ <b>Telegram успешно привязан!</b>\n\n"
                            "Теперь вы будете получать уведомления о мероприятиях.\n\n"
                            "📋 <b>Доступные команды:</b>\n"
                            "/stop — Отключить уведомления\n"
                            "/on — Включить уведомления\n"
                            "/help — Помощь",
                        )
                        return
            await send_telegram_message(chat_id, "❌ Токен недействителен или истёк.")
        else:
            await send_telegram_message(
                chat_id,
                "👋 <b>Привет! Это бот платформы Communicate.</b>\n\n"
                "Здесь вы получаете уведомления о мероприятиях.\n\n"
                "📋 <b>Доступные команды:</b>\n"
                "/stop — Отключить уведомления\n"
                "/on — Включить уведомления\n"
                "/help — Помощь\n\n"
                "Для привязки аккаунта перейдите в настройки профиля на сайте.",
            )

    elif text in ("/stop", "/off"):
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.telegram_id == chat_id))
            user = result.scalar_one_or_none()
            if not user:
                await send_telegram_message(chat_id, "❌ Аккаунт не найден.")
                return
            ns_q = await db.execute(
                select(NotificationSettings).where(NotificationSettings.user_id == user.id)
            )
            ns = ns_q.scalar_one_or_none()
            if ns:
                ns.telegram_enabled = False
            else:
                db.add(NotificationSettings(user_id=user.id, telegram_enabled=False))
            await db.commit()
        await send_telegram_message(
            chat_id,
            "🔕 <b>Уведомления отключены.</b>\n\n"
            "Чтобы включить снова — отправьте /on",
        )

    elif text == "/on":
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.telegram_id == chat_id))
            user = result.scalar_one_or_none()
            if not user:
                await send_telegram_message(chat_id, "❌ Аккаунт не найден.")
                return
            ns_q = await db.execute(
                select(NotificationSettings).where(NotificationSettings.user_id == user.id)
            )
            ns = ns_q.scalar_one_or_none()
            if ns:
                ns.telegram_enabled = True
            else:
                db.add(NotificationSettings(user_id=user.id, telegram_enabled=True))
            await db.commit()
        await send_telegram_message(
            chat_id,
            "🔔 <b>Уведомления включены!</b>\n\n"
            "Вы снова будете получать уведомления о мероприятиях.",
        )

    elif text == "/help":
        await send_telegram_message(
            chat_id,
            "📋 <b>Команды бота:</b>\n\n"
            "/stop — Отключить уведомления\n"
            "/on — Включить уведомления\n"
            "/help — Помощь\n\n"
            "Управление подписками также доступно в профиле на сайте.",
        )


def get_ptb_app() -> Application:
    """Build a PTB Application configured with message handlers."""
    global _bot
    ptb = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).build()
    ptb.add_handler(MessageHandler(filters.TEXT, _ptb_message_handler))
    _bot = ptb.bot
    return ptb
