"""Telegram bot (aiogram v3) + account-linking utilities."""

import io
import logging
import secrets
import uuid
from typing import Optional

import httpx
from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.deps import get_current_user
from app.models.notifications import NotificationSettings
from app.models.user import User
from app.services.notifications import send_telegram_message

logger = logging.getLogger(__name__)

# ── FastAPI router ────────────────────────────────────────────────────────────

router = APIRouter(prefix="/telegram", tags=["telegram"])

# ── Shared state ──────────────────────────────────────────────────────────────

# token -> user_id  (use Redis in production)
PENDING_LINKS: dict[str, int] = {}

# Cached bot username
_bot_username: Optional[str] = None

# Aiogram bot instance (set in start_bot)
_bot: Optional[Bot] = None

# Admin post drafts: chat_id -> {step, title, content, city, _photo_bytes, event_id}
# steps: 'title' | 'content' | 'city' | 'photo' | 'event_id'
_admin_draft: dict[int, dict] = {}


def _is_admin(chat_id: int) -> bool:
    return chat_id in settings.admin_telegram_ids


def get_bot() -> Optional[Bot]:
    return _bot


async def get_bot_username() -> Optional[str]:
    global _bot_username
    if _bot_username:
        return _bot_username
    if not settings.TELEGRAM_BOT_TOKEN:
        return None
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/getMe"
            )
            data = r.json()
            if data.get("ok"):
                _bot_username = data["result"].get("username")
                return _bot_username
    except Exception as exc:
        logger.warning("Could not fetch bot username: %s", exc)
    return None


# ── Aiogram dispatcher & router ───────────────────────────────────────────────

dp = Dispatcher()
bot_router = Router()
dp.include_router(bot_router)


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_categories_text() -> str:
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


async def _create_news_post(chat_id: int, draft: dict, photo_bytes: Optional[bytes] = None) -> None:
    from app.models.news import NewsPost
    from app.services.file_service import _process_image, _upload_s3, _save_local

    image_url = None
    if photo_bytes:
        try:
            data = _process_image(photo_bytes, 1200, 800)
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
            event_id=draft.get("event_id"),
        )
        db.add(post)
        await db.commit()


async def _ask_event_link(chat_id: int) -> None:
    keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="Пропустить", callback_data=f"news_event:skip:{chat_id}"),
        InlineKeyboardButton(text="Привязать к мероприятию", callback_data=f"news_event:link:{chat_id}"),
    ]])
    if _bot:
        await _bot.send_message(
            chat_id=chat_id,
            text="🔗 <b>Привязать новость к мероприятию?</b>",
            parse_mode="HTML",
            reply_markup=keyboard,
        )


# ── /start ────────────────────────────────────────────────────────────────────

@bot_router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    chat_id = message.chat.id
    username = message.from_user.username if message.from_user else None
    args = message.text.split(" ", 1)[1].strip() if " " in (message.text or "") else ""

    if args:
        token = args
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


# ── /help ─────────────────────────────────────────────────────────────────────

@bot_router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    chat_id = message.chat.id
    admin_hint = "\n/postnews — Опубликовать новость" if _is_admin(chat_id) else ""
    await send_telegram_message(
        chat_id,
        "📋 <b>Команды бота:</b>\n\n"
        "/stop — Отключить уведомления\n"
        "/on — Включить уведомления\n"
        "/myid — Узнать свой Telegram ID\n"
        f"/help — Помощь{admin_hint}",
    )


# ── /myid ─────────────────────────────────────────────────────────────────────

@bot_router.message(Command("myid"))
async def cmd_myid(message: Message) -> None:
    await send_telegram_message(message.chat.id, f"🆔 Ваш Telegram ID: <code>{message.chat.id}</code>")


# ── /stop  /off ───────────────────────────────────────────────────────────────

@bot_router.message(Command("stop", "off"))
async def cmd_stop(message: Message) -> None:
    chat_id = message.chat.id
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == chat_id))
        user = result.scalar_one_or_none()
        if not user:
            await send_telegram_message(chat_id, "❌ Аккаунт не найден.")
            return
        ns_q = await db.execute(select(NotificationSettings).where(NotificationSettings.user_id == user.id))
        ns = ns_q.scalar_one_or_none()
        if ns:
            ns.telegram_enabled = False
        else:
            db.add(NotificationSettings(user_id=user.id, telegram_enabled=False))
        await db.commit()
    await send_telegram_message(chat_id, "🔕 <b>Уведомления отключены.</b>\n\nЧтобы включить снова — /on")


# ── /on ───────────────────────────────────────────────────────────────────────

@bot_router.message(Command("on"))
async def cmd_on(message: Message) -> None:
    chat_id = message.chat.id
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.telegram_id == chat_id))
        user = result.scalar_one_or_none()
        if not user:
            await send_telegram_message(chat_id, "❌ Аккаунт не найден.")
            return
        ns_q = await db.execute(select(NotificationSettings).where(NotificationSettings.user_id == user.id))
        ns = ns_q.scalar_one_or_none()
        if ns:
            ns.telegram_enabled = True
        else:
            db.add(NotificationSettings(user_id=user.id, telegram_enabled=True))
        await db.commit()
    await send_telegram_message(chat_id, "🔔 <b>Уведомления включены!</b>")


# ── /postnews (admin) ─────────────────────────────────────────────────────────

@bot_router.message(Command("postnews"))
async def cmd_postnews(message: Message) -> None:
    chat_id = message.chat.id
    if not _is_admin(chat_id):
        return
    _admin_draft[chat_id] = {"step": "title"}
    await send_telegram_message(chat_id, "📝 <b>Введите заголовок новости:</b>\n\n/cancel — отменить")


# ── /cancel (admin) ───────────────────────────────────────────────────────────

@bot_router.message(Command("cancel"))
async def cmd_cancel(message: Message) -> None:
    chat_id = message.chat.id
    if chat_id in _admin_draft:
        del _admin_draft[chat_id]
        await send_telegram_message(chat_id, "❌ Публикация отменена.")


# ── /skip (admin draft) ───────────────────────────────────────────────────────

@bot_router.message(Command("skip"))
async def cmd_skip(message: Message) -> None:
    chat_id = message.chat.id
    draft = _admin_draft.get(chat_id)
    if not draft:
        return

    step = draft.get("step")
    if step == "photo":
        await _ask_event_link(chat_id)
    elif step == "event_id":
        await _create_news_post(chat_id, draft)
        del _admin_draft[chat_id]
        await send_telegram_message(chat_id, "✅ <b>Новость опубликована!</b>")


# ── Admin draft — photo ───────────────────────────────────────────────────────

@bot_router.message(F.photo)
async def handle_photo(message: Message) -> None:
    chat_id = message.chat.id
    if not _is_admin(chat_id):
        return
    draft = _admin_draft.get(chat_id)
    if not draft or draft.get("step") != "photo":
        return

    photo_bytes = None
    if _bot:
        try:
            photo = message.photo[-1]
            buf = io.BytesIO()
            await _bot.download(photo, destination=buf)
            photo_bytes = buf.getvalue()
        except Exception as exc:
            logger.warning("Could not download photo: %s", exc)

    draft["_photo_bytes"] = photo_bytes
    await _ask_event_link(chat_id)


# ── Admin draft — text steps ──────────────────────────────────────────────────

@bot_router.message(F.text)
async def handle_text(message: Message) -> None:
    chat_id = message.chat.id
    text = message.text or ""

    draft = _admin_draft.get(chat_id)
    if not draft:
        return

    step = draft.get("step")

    if step == "title":
        if not text.strip():
            await send_telegram_message(chat_id, "⚠️ Заголовок пустой, попробуйте снова:")
            return
        draft["title"] = text.strip()
        draft["step"] = "content"
        await send_telegram_message(
            chat_id,
            "✏️ <b>Введите текст новости:</b>\n\n"
            "Поддерживается форматирование Telegram (<b>жирный</b>, <i>курсив</i>).\n\n"
            "/cancel — отменить",
        )

    elif step == "content":
        content = message.html_text if message.html_text else text
        if not content.strip():
            await send_telegram_message(chat_id, "⚠️ Текст пустой, попробуйте снова:")
            return
        draft["content"] = content
        draft["step"] = "city"
        await send_telegram_message(
            chat_id,
            "🏙️ <b>Введите город</b> (или /skip чтобы пропустить):\n\n/cancel — отменить",
        )

    elif step == "city":
        draft["city"] = text.strip() or None
        draft["step"] = "photo"
        await send_telegram_message(
            chat_id,
            "🖼️ <b>Отправьте фото</b> (или /skip чтобы пропустить):\n\n/cancel — отменить",
        )

    elif step == "photo":
        await send_telegram_message(chat_id, "⚠️ Отправьте фото или /skip чтобы пропустить.")

    elif step == "event_id":
        try:
            draft["event_id"] = int(text.strip())
        except ValueError:
            await send_telegram_message(chat_id, "⚠️ Введите числовой ID мероприятия или /skip:")
            return
        await _create_news_post(chat_id, draft)
        del _admin_draft[chat_id]
        await send_telegram_message(chat_id, "✅ <b>Новость с привязкой к мероприятию опубликована!</b>")


# ── Callback: inline keyboard buttons ────────────────────────────────────────

@bot_router.callback_query(F.data.startswith("news_event:"))
async def handle_news_event_callback(callback: CallbackQuery) -> None:
    await callback.answer()

    _, action, chat_id_str = (callback.data or "").split(":", 2)
    chat_id = int(chat_id_str)

    if not _is_admin(chat_id):
        return

    draft = _admin_draft.get(chat_id)
    if not draft:
        return

    # Remove inline keyboard from the original message
    if callback.message:
        try:
            await callback.message.edit_reply_markup(reply_markup=None)
        except Exception:
            pass

    if action == "skip":
        photo_bytes = draft.pop("_photo_bytes", None)
        await _create_news_post(chat_id, draft, photo_bytes)
        del _admin_draft[chat_id]
        await send_telegram_message(chat_id, "✅ <b>Новость опубликована!</b>")

    elif action == "link":
        draft["step"] = "event_id"
        await send_telegram_message(
            chat_id,
            "🔢 <b>Введите ID мероприятия</b> (число из адреса страницы, например 42):\n\n/skip — пропустить",
        )


# ── FastAPI endpoints ─────────────────────────────────────────────────────────

@router.post("/webhook")
async def telegram_webhook(request: Request):
    """Receive updates from Telegram (webhook mode, optional)."""
    if not settings.TELEGRAM_BOT_TOKEN or not _bot:
        raise HTTPException(status_code=503, detail="Telegram bot not configured")
    from aiogram.types import Update as AiogramUpdate
    data = await request.json()
    update = AiogramUpdate.model_validate(data)
    await dp.feed_update(bot=_bot, update=update)
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


# ── Bot lifecycle (called from main.py lifespan) ──────────────────────────────

async def start_bot() -> Optional[Bot]:
    """Initialize aiogram bot and start polling. Returns Bot instance."""
    global _bot
    if not settings.TELEGRAM_BOT_TOKEN:
        return None
    _bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
    # Drop any active webhook so polling works cleanly
    await _bot.delete_webhook(drop_pending_updates=False)
    # Remove bot command menu (the "Menu" button in Telegram UI)
    await _bot.delete_my_commands()
    import asyncio
    asyncio.create_task(dp.start_polling(_bot, allowed_updates=["message", "callback_query"]))
    logger.info("Aiogram bot polling started")
    return _bot


async def stop_bot() -> None:
    global _bot
    if _bot:
        await dp.stop_polling()
        await _bot.session.close()
        _bot = None
