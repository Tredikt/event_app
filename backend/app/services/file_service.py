"""File upload service: avatar and event image processing."""

import io
import os
import uuid

import aiofiles
from fastapi import HTTPException, UploadFile
from PIL import Image

from app.core.config import settings

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = settings.MAX_AVATAR_SIZE_MB * 1024 * 1024


async def save_avatar(file: UploadFile, user_id: int) -> str:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Допустимые форматы: JPEG, PNG, WEBP")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail=f"Файл слишком большой (максимум {settings.MAX_AVATAR_SIZE_MB}MB)")

    img = Image.open(io.BytesIO(content))
    img.thumbnail((400, 400), Image.LANCZOS)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    upload_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"{user_id}_{uuid.uuid4().hex}.jpg"
    filepath = os.path.join(upload_dir, filename)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(buf.read())

    return f"/uploads/avatars/{filename}"


async def save_event_image(file: UploadFile, event_id: int) -> str:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Допустимые форматы: JPEG, PNG, WEBP")

    content = await file.read()
    if len(content) > MAX_SIZE * 2:
        raise HTTPException(status_code=400, detail="Файл слишком большой")

    img = Image.open(io.BytesIO(content))
    img.thumbnail((1200, 800), Image.LANCZOS)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    upload_dir = os.path.join(settings.UPLOAD_DIR, "events")
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"{event_id}_{uuid.uuid4().hex}.jpg"
    filepath = os.path.join(upload_dir, filename)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(buf.read())

    return f"/uploads/events/{filename}"
