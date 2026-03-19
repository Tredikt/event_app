"""Reports (complaints) router."""

import asyncio
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.user import User
from app.models.report import Report
from app.services.notifications import send_telegram_message

router = APIRouter(prefix="/reports", tags=["reports"])

REASONS = [
    "Мошенничество / обман",
    "Спам или реклама",
    "Оскорбительное поведение",
    "Фейковый профиль",
    "Недостоверная информация о мероприятии",
    "Другое",
]


class ReportCreate(BaseModel):
    reported_user_id: int
    reason: str
    comment: Optional[str] = None


@router.get("/reasons")
async def get_reasons():
    return REASONS


@router.post("")
async def create_report(
    data: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.reported_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя жаловаться на себя")

    reported = await db.get(User, data.reported_user_id)
    if not reported:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if data.reason not in REASONS:
        raise HTTPException(status_code=400, detail="Недопустимая причина")

    report = Report(
        reporter_id=current_user.id,
        reported_user_id=data.reported_user_id,
        reason=data.reason,
        comment=data.comment,
    )
    db.add(report)
    await db.commit()

    # Notify admins via Telegram
    admin_ids = settings.admin_telegram_ids
    if admin_ids:
        text = (
            f"🚨 <b>Жалоба на пользователя</b>\n\n"
            f"<b>На кого:</b> {reported.first_name} {reported.last_name} (ID {reported.id})\n"
            f"<b>От кого:</b> {current_user.first_name} {current_user.last_name} (ID {current_user.id})\n"
            f"<b>Причина:</b> {data.reason}\n"
        )
        if data.comment:
            text += f"<b>Комментарий:</b> {data.comment}"

        async def notify():
            for admin_id in admin_ids:
                await send_telegram_message(admin_id, text)

        asyncio.create_task(notify())

    return {"ok": True}
