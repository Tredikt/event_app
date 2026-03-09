"""Telegram bot webhook handler and account-linking utilities."""

import io
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


async def _get_categories_text() -> str:
    """Return formatted list of event categories from DB."""
    from app.models.event import EventCategory
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(EventCategory).order_by(EventCategory.id))
            cats = result.scalars().all()
        if not cats:
            return ""
        lines = "\n".join(f"{c.icon} {c.name}" for c in cats)
        return (
            f"📋 <b>Категории мероприятий:</b>\n\n{lines}\n\n"
            f"Перейди на сайт, чтобы найти события по интересам!"
        )
    except Exception as exc:
        logger.warning("Could not fetch categories: %s", exc)
        return ""


router = APIRouter(prefix="/telegram", tags=["telegram"])

# token -> user_id  (use Redis in production)
PENDING_LINKS: dict[str, int] = {}

# Cached bot username
_bot_username: Optional[str] = None

# Shared PTB Bot instance
_bot = None

# Admin post drafts: chat_id -> {step, title, content, city}
# steps: 'title' | 'content' | 'city' | 'photo'
_admin_draft: dict[int, dict] = {}


def _is_admin(chat_id: int) -> bool:
    return chat_id in settings.admin_telegram_ids


def get_bot():
    return _bot


async def get_bot_username() -> Optional[str]:
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
                        "Теперь вы будете получать уведомления о мероприятиях.",
                    )
                else:
                    await send_telegram_message(chat_id, "❌ Токен недействителен или истёк.")
        else:
            await send_telegram_message(chat_id, "👋 Привет! Зарегистрируйся на сайте и привяжи Telegram в профиле.")

    elif text == "/help":
        await send_telegram_message(
            chat_id,
            "📋 <b>Команды бота:</b>\n\n"
            "/stop — Отключить уведомления\n"
            "/on — Включить уведомления\n"
            "/myid — Узнать свой Telegram ID\n"
            "/help — Помощь",
        )

    return {"ok": True}


@router.post("/generate-link-token")
async def generate_link_token(
    current_user: User = Depends(get_current_user),
):
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


# ── Admin news posting ────────────────────────────────────────────────────────

async def _create_news_post(chat_id: int, draft: dict, photo_bytes: Optional[bytes] = None) -> None:
    from app.models.news import NewsPost
    from app.services.file_service import _process_image, _upload_s3, _save_local

    image_url = None
    if photo_bytes:
        try:
            data = _process_image(photo_bytes, 1200, 800)
            import uuid
            uid = uuid.uuid4().hex
            if settings.s3_enabled:
                image_url = await _upload_s3(f"news/{uid}.jpg", data)
            else:
                image_url = await _save_local("news", f"{uid}.jpg", data)
        except Exception as exc:
            logger.warning("Could not process news image: %s", exc)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == chat_id))
        user = result.scalar_one_or_none()
        post = NewsPost(
            title=draft["title"],
            content=draft["content"],
            city=draft.get("city") or None,
            image_url=image_url,
            author_id=user.id if user else None,
        )
        db.add(post)
        await db.commit()


async def _handle_admin_step(update: Update) -> bool:
    """Handle admin news conversation. Returns True if message consumed."""
    message = update.message
    if not message:
        return False

    chat_id = message.chat.id
    if not _is_admin(chat_id):
        return False

    text = message.text or ""
    draft = _admin_draft.get(chat_id)

    if text == "/postnews":
        _admin_draft[chat_id] = {"step": "title"}
        await send_telegram_message(chat_id, "📝 <b>Введите заголовок новости:</b>\n\n/cancel — отменить")
        return True

    if text == "/cancel":
        if chat_id in _admin_draft:
            del _admin_draft[chat_id]
            await send_telegram_message(chat_id, "❌ Публикация отменена.")
            return True
        return False

    if not draft:
        return False

    step = draft["step"]

    if step == "title":
        if not text.strip():
            await send_telegram_message(chat_id, "⚠️ Заголовок пустой, попробуйте снова:")
            return True
        draft["title"] = text.strip()
        draft["step"] = "content"
        await send_telegram_message(
            chat_id,
            "✏️ <b>Введите текст новости:</b>\n\n"
            "Поддерживается форматирование Telegram (<b>жирный</b>, <i>курсив</i>, <code>код</code>, ссылки).\n\n"
            "/cancel — отменить"
        )
        return True

    if step == "content":
        # Preserve Telegram HTML formatting
        content = message.text_html if message.text_html else text
        if not content.strip():
            await send_telegram_message(chat_id, "⚠️ Текст пустой, попробуйте снова:")
            return True
        draft["content"] = content
        draft["step"] = "city"
        await send_telegram_message(
            chat_id,
            "🏙️ <b>Введите город</b> (или /skip чтобы пропустить):\n\n/cancel — отменить"
        )
        return True

    if step == "city":
        draft["city"] = None if text == "/skip" else text.strip()
        draft["step"] = "photo"
        await send_telegram_message(
            chat_id,
            "🖼️ <b>Отправьте фото</b> (или /skip чтобы пропустить):\n\n/cancel — отменить"
        )
        return True

    if step == "photo":
        if text == "/skip":
            await _create_news_post(chat_id, draft)
            del _admin_draft[chat_id]
            await send_telegram_message(chat_id, "✅ <b>Новость опубликована!</b>")
        else:
            await send_telegram_message(chat_id, "⚠️ Отправьте фото или /skip чтобы пропустить.")
        return True

    return False


async def _handle_admin_photo(update: Update) -> bool:
    """Handle photo in admin post flow. Returns True if consumed."""
    message = update.message
    if not message or not message.photo:
        return False

    chat_id = message.chat.id
    if not _is_admin(chat_id):
        return False

    draft = _admin_draft.get(chat_id)
    if not draft or draft.get("step") != "photo":
        return False

    photo_bytes = None
    try:
        photo = message.photo[-1]
        file = await _bot.get_file(photo.file_id)
        buf = io.BytesIO()
        await file.download_to_memory(buf)
        photo_bytes = buf.getvalue()
    except Exception as exc:
        logger.warning("Could not download photo: %s", exc)

    await _create_news_post(chat_id, draft, photo_bytes)
    del _admin_draft[chat_id]
    await send_telegram_message(chat_id, "✅ <b>Новость с фото опубликована!</b>")
    return True


# ── PTB message handler ───────────────────────────────────────────────────────

async def _ptb_message_handler(update: Update, context) -> None:
    message = update.message
    if not message:
        return

    chat_id = message.chat.id

    # Admin photo flow
    if message.photo:
        if await _handle_admin_photo(update):
            return

    # Admin text flow
    if message.text and await _handle_admin_step(update):
        return

    if not message.text:
        return

    text = message.text
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
                "👋 <b>Привет! Ты попал в Повод.</b>\n\n"
                "Это платформа для поиска мероприятий рядом с тобой:\n"
                "• 📍 Находи события на карте\n"
                "• ✅ Записывайся на мероприятия\n"
                "• 🔔 Получай уведомления о новых событиях\n\n"
                "Чтобы начать — зарегистрируйся на сайте и привяжи Telegram в профиле.\n\n"
                "📋 <b>Команды:</b>\n"
                "/stop — Отключить уведомления\n"
                "/on — Включить уведомления",
            )
            cats_text = await _get_categories_text()
            if cats_text:
                await send_telegram_message(chat_id, cats_text)

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
        await send_telegram_message(chat_id, "🔕 <b>Уведомления отключены.</b>\n\nЧтобы включить снова — /on")

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
        await send_telegram_message(chat_id, "🔔 <b>Уведомления включены!</b>")

    elif text == "/help":
        admin_hint = "\n/postnews — Опубликовать новость" if _is_admin(chat_id) else ""
        await send_telegram_message(
            chat_id,
            "📋 <b>Команды бота:</b>\n\n"
            "/stop — Отключить уведомления\n"
            "/on — Включить уведомления\n"
            f"/myid — Узнать свой Telegram ID\n"
            f"/help — Помощь{admin_hint}",
        )

    elif text == "/myid":
        await send_telegram_message(chat_id, f"🆔 Ваш Telegram ID: <code>{chat_id}</code>")


def get_ptb_app() -> Application:
    global _bot
    ptb = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).build()
    ptb.add_handler(MessageHandler(filters.TEXT | filters.PHOTO, _ptb_message_handler))
    _bot = ptb.bot
    return ptb
