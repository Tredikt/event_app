"""Telegram and email notification helpers."""

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_telegram_message(telegram_id: int, text: str) -> bool:
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.warning("Telegram bot token not configured")
        return False
    try:
        from app.routers.telegram import get_bot
        bot = get_bot()
        if bot is None:
            logger.warning("PTB bot not initialised yet, skipping message to %s", telegram_id)
            return False
        await bot.send_message(chat_id=telegram_id, text=text, parse_mode="HTML")
        return True
    except Exception as e:
        logger.error("Telegram send error: %s", e)
        return False


async def send_email(to_email: str, subject: str, body_html: str) -> bool:
    if not settings.SMTP_USER:
        logger.warning("SMTP not configured")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
        msg["To"] = to_email
        msg.attach(MIMEText(body_html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        return True
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return False


async def notify_event_reminder(telegram_id: Optional[int], email: Optional[str], event_title: str, event_date: str, event_address: str):
    text = (
        f"⏰ <b>Напоминание о мероприятии</b>\n\n"
        f"📌 <b>{event_title}</b>\n"
        f"📅 {event_date}\n"
        f"📍 {event_address}\n\n"
        f"Скоро начинается! Не забудьте прийти."
    )
    if telegram_id:
        await send_telegram_message(telegram_id, text)
    if email:
        html = f"""
        <h2>Напоминание о мероприятии</h2>
        <p><strong>{event_title}</strong></p>
        <p>📅 {event_date}</p>
        <p>📍 {event_address}</p>
        <p>Мероприятие скоро начинается!</p>
        """
        await send_email(email, f"Напоминание: {event_title}", html)


async def notify_event_update(telegram_id: Optional[int], email: Optional[str], event_title: str, change: str):
    text = (
        f"📢 <b>Изменение мероприятия</b>\n\n"
        f"📌 <b>{event_title}</b>\n\n"
        f"{change}"
    )
    if telegram_id:
        await send_telegram_message(telegram_id, text)
    if email:
        html = f"<h2>Изменение мероприятия</h2><p><strong>{event_title}</strong></p><p>{change}</p>"
        await send_email(email, f"Изменение: {event_title}", html)


async def notify_new_participant(organizer_telegram_id: Optional[int], organizer_email: Optional[str],
                                  participant_name: str, event_title: str, current_count: int, capacity: int):
    text = (
        f"🎉 <b>Новый участник!</b>\n\n"
        f"📌 <b>{event_title}</b>\n"
        f"👤 {participant_name} записался на ваше мероприятие\n"
        f"👥 Участников: {current_count}/{capacity}"
    )
    if organizer_telegram_id:
        await send_telegram_message(organizer_telegram_id, text)
    if organizer_email:
        html = f"<h2>Новый участник</h2><p><strong>{event_title}</strong></p><p>{participant_name} записался. Участников: {current_count}/{capacity}</p>"
        await send_email(organizer_email, f"Новый участник: {event_title}", html)


async def notify_attendance_request(
    telegram_id: Optional[int],
    event_title: str,
    event_id: int,
    participant_names: list[str],
    frontend_url: str,
):
    """Notify organizer that event is over and they should mark attendance."""
    names_text = "\n".join(f"• {name}" for name in participant_names) if participant_names else "Участников не было"
    text = (
        f"✅ <b>Мероприятие завершено!</b>\n\n"
        f"📌 <b>{event_title}</b>\n\n"
        f"Участники ({len(participant_names)}):\n{names_text}\n\n"
        f"👉 Отметьте, кто пришёл:\n{frontend_url}/events/{event_id}"
    )
    if telegram_id:
        await send_telegram_message(telegram_id, text)


async def notify_new_event_to_subscribers(
    *,
    event_id: int,
    event_title: str,
    event_date: str,
    event_address: str,
    category_name: str,
    category_icon: str,
    organizer_name: str,
    reason: str,  # "category" | "organizer"
    recipients: list[dict],  # [{"telegram_id": int, "email": str|None, "settings": NotificationSettings}]
    frontend_url: str,
):
    """Send new-event notification to a batch of recipients."""
    if reason == "category":
        header = f"🔔 <b>Новое мероприятие в категории «{category_icon} {category_name}»</b>"
    else:
        header = f"🔔 <b>Новое мероприятие от организатора {organizer_name}</b>"

    text = (
        f"{header}\n\n"
        f"📌 <b>{event_title}</b>\n"
        f"📅 {event_date}\n"
        f"📍 {event_address}\n\n"
        f"👉 {frontend_url}/events/{event_id}"
    )
    html_body = f"""
    <h2>{header.replace('<b>', '<strong>').replace('</b>', '</strong>')}</h2>
    <p><strong>{event_title}</strong></p>
    <p>📅 {event_date}</p>
    <p>📍 {event_address}</p>
    <p><a href="{frontend_url}/events/{event_id}">Подробнее</a></p>
    """

    for r in recipients:
        ns = r.get("settings")
        # Respect global telegram toggle
        if r.get("telegram_id") and (ns is None or ns.telegram_enabled):
            await send_telegram_message(r["telegram_id"], text)
        # Respect global email toggle
        if r.get("email") and (ns is None or ns.email_enabled):
            await send_email(r["email"], f"Новое мероприятие: {event_title}", html_body)
