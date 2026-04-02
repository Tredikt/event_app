"""Authentication and user profile endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import User, VerificationRequest, VerificationStatus
from app.schemas.user import (
    TelegramConnect,
    Token,
    UserLogin,
    UserProfile,
    UserRegister,
    UserUpdate,
    VerificationRequestIn,
    VerificationRequestOut,
)
from app.services.file_service import save_avatar

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.phone == data.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Номер телефона уже зарегистрирован")

    if data.email:
        existing_email = await db.execute(select(User).where(User.email == data.email))
        if existing_email.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

    user = User(
        first_name=data.first_name,
        last_name=data.last_name,
        phone=data.phone,
        email=data.email,
        hashed_password=get_password_hash(data.password),
        gender=data.gender,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, user=UserProfile.model_validate(user))


@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    if "@" in data.phone:
        result = await db.execute(select(User).where(User.email == data.phone))
    else:
        result = await db.execute(select(User).where(User.phone == data.phone))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный телефон/email или пароль")

    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token, user=UserProfile.model_validate(user))


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserProfile.model_validate(current_user)


@router.put("/me", response_model=UserProfile)
async def update_me(
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.first_name:
        current_user.first_name = data.first_name
    if data.last_name:
        current_user.last_name = data.last_name
    if data.email:
        current_user.email = data.email
    if data.gender:
        current_user.gender = data.gender
    if data.city is not None:
        current_user.city = data.city or None
    await db.commit()
    await db.refresh(current_user)
    return UserProfile.model_validate(current_user)


@router.post("/me/avatar", response_model=UserProfile)
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    avatar_url = await save_avatar(file, current_user.id)
    current_user.avatar_url = avatar_url
    await db.commit()
    await db.refresh(current_user)
    return UserProfile.model_validate(current_user)


@router.post("/me/verification", status_code=status.HTTP_201_CREATED)
async def submit_verification(
    data: VerificationRequestIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit legal entity verification request."""
    if current_user.verification_status == VerificationStatus.approved:
        raise HTTPException(status_code=400, detail="Верификация уже подтверждена")
    # Upsert: delete old request if rejected/pending
    existing = await db.execute(
        select(VerificationRequest).where(VerificationRequest.user_id == current_user.id)
    )
    old = existing.scalar_one_or_none()
    if old:
        await db.delete(old)
    req = VerificationRequest(
        user_id=current_user.id,
        legal_type=data.legal_type,
        legal_name=data.legal_name,
        inn=data.inn,
        contact_info=data.contact_info,
    )
    current_user.verification_status = VerificationStatus.pending
    db.add(req)
    await db.commit()
    return {"status": "pending"}


@router.get("/me/verification", response_model=VerificationRequestOut | None)
async def get_verification(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(VerificationRequest).where(VerificationRequest.user_id == current_user.id)
    )
    return result.scalar_one_or_none()


@router.post("/me/telegram", response_model=UserProfile)
async def connect_telegram(
    data: TelegramConnect,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = await db.execute(select(User).where(User.telegram_id == data.telegram_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Telegram уже привязан к другому аккаунту")
    current_user.telegram_id = data.telegram_id
    current_user.telegram_username = data.telegram_username
    await db.commit()
    await db.refresh(current_user)
    return UserProfile.model_validate(current_user)
