"""Chat router — REST + WebSocket."""

import logging
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import and_, desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import get_current_user
from app.core.security import decode_token
from app.models.chat import Chat, ChatMessage
from app.models.event import Event, EventParticipant, ParticipantStatus
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
        "image_url": m.image_url,
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


@router.get("/can-chat/{user_id}")
async def can_chat(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if current user can start a chat with user_id (event relationship exists)."""
    if user_id == current_user.id:
        return {"allowed": False}
    # Already have a chat → allowed
    existing = await db.execute(
        select(Chat).where(
            or_(
                and_(Chat.user1_id == current_user.id, Chat.user2_id == user_id),
                and_(Chat.user1_id == user_id, Chat.user2_id == current_user.id),
            )
        )
    )
    if existing.scalar_one_or_none():
        return {"allowed": True}
    # Check event relationship
    relation = await db.execute(
        select(EventParticipant).join(Event, Event.id == EventParticipant.event_id).where(
            EventParticipant.status == ParticipantStatus.registered,
            or_(
                and_(Event.organizer_id == user_id, EventParticipant.user_id == current_user.id),
                and_(Event.organizer_id == current_user.id, EventParticipant.user_id == user_id),
            )
        ).limit(1)
    )
    return {"allowed": relation.scalar_one_or_none() is not None}


@router.post("/open")
async def open_chat(
    body: OpenChatIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Open (or get existing) chat. Allowed only between participant and event organizer."""
    if body.user_id == current_user.id:
        raise HTTPException(400, "Нельзя создать чат с собой")
    other = await db.get(User, body.user_id)
    if not other:
        raise HTTPException(404, "Пользователь не найден")

    # Check existing chat first — allow access if already created
    existing = await db.execute(
        select(Chat).where(
            or_(
                and_(Chat.user1_id == current_user.id, Chat.user2_id == body.user_id),
                and_(Chat.user1_id == body.user_id, Chat.user2_id == current_user.id),
            )
        )
    )
    if not existing.scalar_one_or_none():
        # Only allow new chat if there's an event connection:
        # current_user is participant of other's event OR other is participant of current_user's event
        relation = await db.execute(
            select(EventParticipant).join(Event, Event.id == EventParticipant.event_id).where(
                EventParticipant.status == ParticipantStatus.registered,
                or_(
                    and_(Event.organizer_id == body.user_id, EventParticipant.user_id == current_user.id),
                    and_(Event.organizer_id == current_user.id, EventParticipant.user_id == body.user_id),
                )
            ).limit(1)
        )
        if not relation.scalar_one_or_none():
            raise HTTPException(403, "Чат доступен только между участником и организатором мероприятия")

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
# File upload
# ---------------------------------------------------------------------------

CHAT_UPLOAD_DIR = "uploads/chats"
os.makedirs(CHAT_UPLOAD_DIR, exist_ok=True)
ALLOWED_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4"}
MAX_SIZE = 20 * 1024 * 1024  # 20 MB


@router.post("/{chat_id}/upload")
async def upload_chat_file(
    chat_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    chat = await db.get(Chat, chat_id)
    if not chat or current_user.id not in (chat.user1_id, chat.user2_id):
        raise HTTPException(403, "Нет доступа")
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, "Недопустимый тип файла")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(400, "Файл слишком большой (макс. 20 МБ)")
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
    name = f"{uuid.uuid4().hex}.{ext}"
    path = os.path.join(CHAT_UPLOAD_DIR, name)
    with open(path, "wb") as f:
        f.write(data)
    return {"url": f"/uploads/chats/{name}"}


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

    # Mark unread messages from the other user as read on connect
    async with AsyncSessionLocal() as db:
        unread = await db.execute(
            select(ChatMessage).where(
                ChatMessage.chat_id == chat_id,
                ChatMessage.sender_id != user_id,
                ChatMessage.is_read == False,  # noqa: E712
            )
        )
        unread_msgs = unread.scalars().all()
        if unread_msgs:
            for m in unread_msgs:
                m.is_read = True
            await db.commit()
            # Notify sender that messages were read
            await manager.broadcast(chat_id, {"type": "read", "reader_id": user_id})

    try:
        while True:
            data = await websocket.receive_json()

            # Handle read receipt from client
            if data.get("type") == "read":
                async with AsyncSessionLocal() as db:
                    unread = await db.execute(
                        select(ChatMessage).where(
                            ChatMessage.chat_id == chat_id,
                            ChatMessage.sender_id != user_id,
                            ChatMessage.is_read == False,  # noqa: E712
                        )
                    )
                    msgs = unread.scalars().all()
                    if msgs:
                        for m in msgs:
                            m.is_read = True
                        await db.commit()
                        await manager.broadcast(chat_id, {"type": "read", "reader_id": user_id})
                continue

            text = (data.get("text") or "").strip()
            image_url = (data.get("image_url") or "").strip() or None
            if not text and not image_url:
                continue

            async with AsyncSessionLocal() as db:
                msg = ChatMessage(
                    chat_id=chat_id,
                    sender_id=user_id,
                    text=text or None,
                    image_url=image_url,
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
