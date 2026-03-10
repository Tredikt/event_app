"""News posts router."""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_user
from app.models.news import NewsPost
from app.models.user import User
from app.schemas.news import NewsPostOut

router = APIRouter(prefix="/news", tags=["news"])


@router.get("", response_model=list[NewsPostOut])
async def list_news(
    response: Response,
    city: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "public, max-age=60"
    from app.models.event import Event
    q = (
        select(NewsPost)
        .options(selectinload(NewsPost.author), selectinload(NewsPost.event))
        .order_by(desc(NewsPost.created_at))
    )
    if city:
        q = q.where(NewsPost.city.ilike(f"%{city}%"))
    result = await db.execute(q)
    return [NewsPostOut.from_post(p) for p in result.scalars().all()]


@router.post("", response_model=NewsPostOut)
async def create_news(
    title: str = Form(...),
    content: str = Form(...),
    city: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Только администраторы могут публиковать новости")

    image_url = None
    if image and image.filename:
        from app.services.file_service import save_event_image
        image_url = await save_event_image(image, 0)

    post = NewsPost(
        title=title,
        content=content,
        city=city or None,
        image_url=image_url,
        author_id=current_user.id,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    result = await db.execute(
        select(NewsPost).options(selectinload(NewsPost.author)).where(NewsPost.id == post.id)
    )
    return result.scalar_one()


@router.delete("/{post_id}", status_code=204)
async def delete_news(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(NewsPost).where(NewsPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    if not current_user.is_admin and post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет прав")
    await db.delete(post)
    await db.commit()
