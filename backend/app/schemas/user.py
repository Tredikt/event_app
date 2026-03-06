"""User Pydantic schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

from app.models.user import GenderEnum


class UserRegister(BaseModel):
    first_name: str
    last_name: str
    phone: str
    password: str
    gender: GenderEnum
    email: Optional[EmailStr] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = "".join(filter(str.isdigit, v))
        if len(digits) < 10:
            raise ValueError("Некорректный номер телефона")
        return v


class UserLogin(BaseModel):
    phone: str
    password: str


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    gender: Optional[GenderEnum] = None


class UserPublic(BaseModel):
    id: int
    first_name: str
    last_name: str
    gender: GenderEnum
    avatar_url: Optional[str] = None
    telegram_username: Optional[str] = None
    rating: float = 5.0

    model_config = {"from_attributes": True}


class UserProfile(UserPublic):
    phone: str
    email: Optional[str] = None
    telegram_id: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


class TelegramConnect(BaseModel):
    telegram_id: int
    telegram_username: Optional[str] = None
