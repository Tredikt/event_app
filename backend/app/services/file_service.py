"""File upload service: avatar and event image processing (local or S3)."""

import io
import os
import uuid

import aiofiles
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

from app.core.config import settings

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
MAX_SIZE = settings.MAX_AVATAR_SIZE_MB * 1024 * 1024


def _process_image(content: bytes, max_w: int, max_h: int) -> bytes:
    img = Image.open(io.BytesIO(content))
    img = ImageOps.exif_transpose(img)  # fix iPhone/Android rotation
    img.thumbnail((max_w, max_h), Image.LANCZOS)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


async def _upload_s3(key: str, data: bytes) -> str:
    """Upload bytes to S3 and return the public URL."""
    import aioboto3
    session = aioboto3.Session()
    async with session.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        region_name=settings.S3_REGION,
    ) as s3:
        await s3.put_object(
            Bucket=settings.S3_BUCKET_NAME,
            Key=key,
            Body=data,
            ContentType="image/jpeg",
            ACL="public-read",
        )

    base = settings.S3_PUBLIC_URL or f"{settings.S3_ENDPOINT_URL}/{settings.S3_BUCKET_NAME}"
    return f"{base.rstrip('/')}/{key}"


async def _save_local(subdir: str, filename: str, data: bytes) -> str:
    """Save bytes to local filesystem and return the URL path."""
    upload_dir = os.path.join(settings.UPLOAD_DIR, subdir)
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, filename)
    async with aiofiles.open(filepath, "wb") as f:
        await f.write(data)
    return f"/uploads/{subdir}/{filename}"


async def save_avatar(file: UploadFile, user_id: int) -> str:
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail=f"Файл слишком большой (максимум {settings.MAX_AVATAR_SIZE_MB}MB)")

    try:
        data = _process_image(content, 400, 400)
    except Exception:
        raise HTTPException(status_code=400, detail="Недопустимый формат изображения")
    uid = uuid.uuid4().hex

    if settings.s3_enabled:
        return await _upload_s3(f"avatars/{user_id}_{uid}.jpg", data)
    return await _save_local("avatars", f"{user_id}_{uid}.jpg", data)


async def save_event_image(file: UploadFile, event_id: int) -> str:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Допустимые форматы: JPEG, PNG, WEBP, HEIC")

    content = await file.read()
    if len(content) > MAX_SIZE * 2:
        raise HTTPException(status_code=400, detail="Файл слишком большой")

    data = _process_image(content, 1200, 800)
    uid = uuid.uuid4().hex

    if settings.s3_enabled:
        return await _upload_s3(f"events/{event_id}_{uid}.jpg", data)
    return await _save_local("events", f"{event_id}_{uid}.jpg", data)
