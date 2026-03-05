from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings

# communicate_site/ root: backend/app/core/ → up 4 levels
_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30 days

    TELEGRAM_BOT_TOKEN: Optional[str] = None

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM: Optional[str] = None

    REDIS_URL: str = "redis://localhost:6379/0"
    BACKEND_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:5173"

    UPLOAD_DIR: str = "uploads"
    MAX_AVATAR_SIZE_MB: int = 5

    class Config:
        env_file = str(_ROOT / ".env")


settings = Settings()
