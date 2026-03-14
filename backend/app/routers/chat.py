"""Chat router — REST + WebSocket."""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import get_current_user
from app.core.security import decode_token
from app.models.chat import Chat, ChatMessage
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chats", tags=["chats"])


# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------

class _ConnectionManager:
    def __init__(self):
        self._rooms: dict[int, list[WebSocket]] = {}

    async def connect(self, ws: WebSocket, chat_id: int):
        await ws.accept()
        self._rooms.setdefault(chat_id, []).append(ws)

    def disconnect(self, ws: WebSocket, chat_id: int):
        room = self._rooms.get(chat_id, [])
        if ws in room:
            room.remove(ws)

    async def broadcast(self, chat_id: int, data: dict):
        for ws in list(self._rooms.get(chat_id, [])):
            try:
                await ws.send_json(data)
            except Exception:
                pass


manager = _ConnectionManager()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "avatar_url": u.avatar_url,
    }


def _msg_dict(m: ChatMessage) -> dict:
    return {
        "id": m.id,
        "chat_id": m.chat_id,
        "sender_id": m.sender_id,
        "text": m.text,
        "created_at": m.created_at.isoformat(),
        "is_read": m.is_read,
        "sender": _user_dict(m.sender) if m.sender else None,
    }


async def _get_or_create_chat(db: AsyncSession, me_id: int, other_id: int) -> Chat:
    result = await db.execute(
        select(Chat)
        .options(selectinload(Chat.user1), selectinload(Chat.user2))
        .where(
            or_(
                and_(Chat.user1_id == me_id, Chat.user2_id == other_id),
                and_(Chat.user1_id == other_id, Chat.user2_id == me_id),
            )
        )
    )
    chat = result.scalar_one_or_none()
    if not chat:
        chat = Chat(user1_id=me_id, user2_id=other_id)
        db.add(chat)
        await db.commit()
        await db.refresh(chat)
        # reload relations
        result = await db.execute(
            select(Chat)
            .options(selectinload(Chat.user1), selectinload(Chat.user2))
            .where(Chat.id == chat.id)
        )
        chat = result.scalar_one()
    return chat


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

class OpenChatIn(BaseModel):
    user_id: int


@router.post("/open")
async def open_chat(
    body: OpenChatIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Open (or get existing) chat with another user."""
    if body.user_id == current_user.id:
        raise HTTPException(400, "Нельзя создать чат с собой")
    other = await db.get(User, body.user_id)
    if not other:
        raise HTTPException(404, "Пользователь не найден")
    chat = await _get_or_create_chat(db, current_user.id, body.user_id)
    other_user = chat.user2 if chat.user1_id == current_user.id else chat.user1
    return {"chat_id": chat.id, "partner": _user_dict(other_user)}


@router.get("")
async def list_chats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all chats of the current user, sorted by last message."""
    result = await db.execute(
        select(Chat)
        .options(selectinload(Chat.user1), selectinload(Chat.user2))
        .where(
            or_(Chat.user1_id == current_user.id, Chat.user2_id == current_user.id)
        )
        .order_by(desc(Chat.last_message_at))
    )
    chats = result.scalars().all()

    out = []
    for chat in chats:
        partner = chat.user2 if chat.user1_id == current_user.id else chat.user1

        # last message
        last_msg_result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.chat_id == chat.id)
            .order_by(desc(ChatMessage.created_at))
            .limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()

        # unread count
        unread = await db.scalar(
            select(
                __import__("sqlalchemy", fromlist=["func"]).func.count()
            ).where(
                and_(
                    ChatMessage.chat_id == chat.id,
                    ChatMessage.sender_id != current_user.id,
                    ChatMessage.is_read == False,  # noqa: E712
                )
            )
        ) or 0

        out.append({
            "chat_id": chat.id,
            "partner": _user_dict(partner),
            "last_message": _msg_dict(last_msg) if last_msg else None,
            "unread": unread,
        })
    return out


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import func
    count = await db.scalar(
        select(func.count()).select_from(ChatMessage)
        .join(Chat, Chat.id == ChatMessage.chat_id)
        .where(
            and_(
                or_(Chat.user1_id == current_user.id, Chat.user2_id == current_user.id),
                ChatMessage.sender_id != current_user.id,
                ChatMessage.is_read == False,  # noqa: E712
            )
        )
    ) or 0
    return {"count": count}


@router.get("/{chat_id}/messages")
async def get_messages(
    chat_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = await db.get(Chat, chat_id)
    if not chat or current_user.id not in (chat.user1_id, chat.user2_id):
        raise HTTPException(404, "Чат не найден")

    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender))
        .where(ChatMessage.chat_id == chat_id)
        .order_by(ChatMessage.created_at)
        .offset(skip).limit(limit)
    )
    messages = result.scalars().all()

    # mark as read
    for m in messages:
        if m.sender_id != current_user.id and not m.is_read:
            m.is_read = True
    await db.commit()

    return [_msg_dict(m) for m in messages]


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@router.websocket("/{chat_id}/ws")
async def chat_ws(
    chat_id: int,
    websocket: WebSocket,
    token: Optional[str] = Query(None),
):
    # Authenticate via query param token
    if not token:
        await websocket.close(code=4001)
        return

    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    user_id: int = int(payload.get("sub", 0))

    async with AsyncSessionLocal() as db:
        chat = await db.get(Chat, chat_id)
        if not chat or user_id not in (chat.user1_id, chat.user2_id):
            await websocket.close(code=4003)
            return

    await manager.connect(websocket, chat_id)
    try:
        while True:
            data = await websocket.receive_json()
            text = (data.get("text") or "").strip()
            if not text:
                continue

            async with AsyncSessionLocal() as db:
                msg = ChatMessage(
                    chat_id=chat_id,
                    sender_id=user_id,
                    text=text,
                    created_at=datetime.utcnow(),
                )
                db.add(msg)

                # update last_message_at on chat
                chat = await db.get(Chat, chat_id)
                if chat:
                    chat.last_message_at = msg.created_at

                await db.commit()
                await db.refresh(msg)

                # load sender for response
                result = await db.execute(
                    select(ChatMessage)
                    .options(selectinload(ChatMessage.sender))
                    .where(ChatMessage.id == msg.id)
                )
                msg = result.scalar_one()

            await manager.broadcast(chat_id, _msg_dict(msg))

    except WebSocketDisconnect:
        manager.disconnect(websocket, chat_id)
    except Exception as e:
        logger.error("WS error chat=%s user=%s: %s", chat_id, user_id, e)
        manager.disconnect(websocket, chat_id)
