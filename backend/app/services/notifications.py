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


async def notify_new_participant(
    organizer_telegram_id: Optional[int],
    organizer_email: Optional[str],
    participant_name: str,
    event_title: str,
    current_count: int,
    capacity: int,
    participant_telegram_username: Optional[str] = None,
):
    tg_line = f"\n📲 Telegram: @{participant_telegram_username}" if participant_telegram_username else ""
    text = (
        f"🎉 <b>Новый участник!</b>\n\n"
        f"📌 <b>{event_title}</b>\n"
        f"👤 {participant_name} записался на ваше мероприятие{tg_line}\n"
        f"👥 Участников: {current_count}/{capacity}"
    )
    if organizer_telegram_id:
        await send_telegram_message(organizer_telegram_id, text)
    if organizer_email:
        html = f"<h2>Новый участник</h2><p><strong>{event_title}</strong></p><p>{participant_name} записался. Участников: {current_count}/{capacity}</p>"
        await send_email(organizer_email, f"Новый участник: {event_title}", html)


async def notify_participant_left(
    organizer_telegram_id: Optional[int],
    organizer_email: Optional[str],
    participant_name: str,
    event_title: str,
    current_count: int,
    capacity: int,
):
    text = (
        f"😔 <b>Участник отказался</b>\n\n"
        f"📌 <b>{event_title}</b>\n"
        f"👤 {participant_name} отменил участие\n"
        f"👥 Осталось участников: {current_count}/{capacity}"
    )
    if organizer_telegram_id:
        await send_telegram_message(organizer_telegram_id, text)
    if organizer_email:
        html = f"<h2>Участник отказался</h2><p><strong>{event_title}</strong></p><p>{participant_name} отменил участие. Участников: {current_count}/{capacity}</p>"
        await send_email(organizer_email, f"Отказ от участия: {event_title}", html)


async def notify_joined_event(
    participant_telegram_id: Optional[int],
    event_title: str,
    event_date: Optional[str],
    event_address: str,
    organizer_name: str,
    organizer_telegram_username: Optional[str],
    frontend_url: str,
    event_id: int,
):
    """Notify the participant that their registration is confirmed, with organizer contact."""
    date_line = f"📅 {event_date}\n" if event_date else ""
    org_contact = (
        f"\n💬 Свяжитесь с организатором: @{organizer_telegram_username}"
        if organizer_telegram_username
        else f"\n👤 Организатор: {organizer_name}"
    )
    text = (
        f"✅ <b>Вы записались на мероприятие!</b>\n\n"
        f"📌 <b>{event_title}</b>\n"
        f"{date_line}"
        f"📍 {event_address}"
        f"{org_contact}\n\n"
        f"👉 {frontend_url}/events/{event_id}"
    )
    if participant_telegram_id:
        await send_telegram_message(participant_telegram_id, text)


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


async def notify_event_cancelled(
    participant_telegram_id: Optional[int],
    event_title: str,
    event_date: Optional[str],
    reason: str = "min_participants",
):
    """Notify participant that the event was auto-cancelled due to low sign-ups."""
    date_line = f"📅 {event_date}\n" if event_date else ""
    if reason == "min_participants":
        reason_text = "Мероприятие отменено: не набралось минимальное количество участников."
    else:
        reason_text = "Мероприятие отменено организатором."
    text = (
        f"❌ <b>Мероприятие отменено</b>\n\n"
        f"📌 <b>{event_title}</b>\n"
        f"{date_line}"
        f"{reason_text}"
    )
    if participant_telegram_id:
        await send_telegram_message(participant_telegram_id, text)


async def notify_new_follower(
    organizer_telegram_id: Optional[int],
    follower_name: str,
    follower_telegram_username: Optional[str] = None,
):
    tg_line = f"\n📲 @{follower_telegram_username}" if follower_telegram_username else ""
    text = (
        f"🔔 <b>Новый подписчик!</b>\n\n"
        f"👤 {follower_name} подписался на ваши мероприятия{tg_line}"
    )
    if organizer_telegram_id:
        await send_telegram_message(organizer_telegram_id, text)


async def notify_payment_submitted(
    organizer_telegram_id: Optional[int],
    participant_name: str,
    event_title: str,
    participant_telegram_username: Optional[str] = None,
):
    """Notify organizer that a participant has submitted payment proof."""
    tg_line = f"\n📲 Telegram: @{participant_telegram_username}" if participant_telegram_username else ""
    text = (
        f"💳 <b>Новая заявка об оплате!</b>\n\n"
        f"📌 <b>{event_title}</b>\n"
        f"👤 {participant_name} сообщил об оплате{tg_line}\n\n"
        f"Подтвердите участие в приложении."
    )
    if organizer_telegram_id:
        await send_telegram_message(organizer_telegram_id, text)


async def notify_payment_approved(
    user_telegram_id: Optional[int],
    event_title: str,
    event_date: Optional[str] = None,
    event_address: Optional[str] = None,
):
    """Notify participant that their payment was approved and participation confirmed."""
    date_line = f"📅 {event_date}\n" if event_date else ""
    address_line = f"📍 {event_address}\n" if event_address else ""
    text = (
        f"✅ <b>Участие подтверждено!</b>\n\n"
        f"📌 <b>{event_title}</b>\n"
        f"{date_line}"
        f"{address_line}\n"
        f"Ваша оплата принята, вы в списке участников. До встречи на мероприятии!"
    )
    if user_telegram_id:
        await send_telegram_message(user_telegram_id, text)


async def notify_payment_rejected(
    user_telegram_id: Optional[int],
    event_title: str,
):
    """Notify participant that their payment application was rejected."""
    text = (
        f"❌ <b>Заявка отклонена</b>\n\n"
        f"📌 <b>{event_title}</b>\n\n"
        f"К сожалению, организатор отклонил вашу заявку. "
        f"Свяжитесь с организатором для уточнения деталей."
    )
    if user_telegram_id:
        await send_telegram_message(user_telegram_id, text)


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
