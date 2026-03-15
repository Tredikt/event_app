"""News posts router."""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_user
from app.models.news import NewsPost, NewsPostImage
from app.models.user import User
from app.schemas.news import NewsPostOut

router = APIRouter(prefix="/news", tags=["news"])


@router.get("", response_model=list[NewsPostOut])
async def list_news(
    response: Response,
    city: Optional[str] = None,
    author_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "public, max-age=60"
    q = (
        select(NewsPost)
        .options(selectinload(NewsPost.author), selectinload(NewsPost.event), selectinload(NewsPost.images))
        .order_by(desc(NewsPost.created_at))
    )
    if city:
        q = q.where(NewsPost.city.ilike(f"%{city}%"))
    if author_id:
        q = q.where(NewsPost.author_id == author_id)
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
        select(NewsPost)
        .options(selectinload(NewsPost.author), selectinload(NewsPost.images))
        .where(NewsPost.id == post.id)
    )
    return NewsPostOut.from_post(result.scalar_one())


@router.post("/{post_id}/images", response_model=NewsPostOut)
async def upload_news_images(
    post_id: int,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(NewsPost)
        .options(selectinload(NewsPost.author), selectinload(NewsPost.event), selectinload(NewsPost.images))
        .where(NewsPost.id == post_id)
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Пост не найден")
    if not current_user.is_admin and post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет прав")

    from app.services.file_service import save_event_image
    start_order = len(post.images)
    for i, file in enumerate(files):
        if not file.filename:
            continue
        url = await save_event_image(file, post_id)
        db.add(NewsPostImage(post_id=post_id, image_url=url, order=start_order + i))
        if not post.image_url:
            post.image_url = url

    await db.commit()
    result = await db.execute(
        select(NewsPost)
        .options(selectinload(NewsPost.author), selectinload(NewsPost.event), selectinload(NewsPost.images))
        .where(NewsPost.id == post_id)
    )
    return NewsPostOut.from_post(result.scalar_one())


@router.delete("/{post_id}/images/{image_id}", status_code=204)
async def delete_news_image(
    post_id: int,
    image_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    img = await db.get(NewsPostImage, image_id)
    if not img or img.post_id != post_id:
        raise HTTPException(status_code=404, detail="Фото не найдено")

    post_check = await db.get(NewsPost, post_id)
    if post_check and not current_user.is_admin and post_check.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет прав")

    deleted_url = img.image_url
    await db.delete(img)

    post = await db.get(NewsPost, post_id)
    if post and post.image_url == deleted_url:
        next_result = await db.execute(
            select(NewsPostImage)
            .where(NewsPostImage.post_id == post_id, NewsPostImage.id != image_id)
            .order_by(NewsPostImage.order)
            .limit(1)
        )
        next_img = next_result.scalar_one_or_none()
        post.image_url = next_img.image_url if next_img else None

    await db.commit()


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
