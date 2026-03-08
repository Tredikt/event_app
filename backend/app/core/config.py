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
    # Comma-separated telegram_id list of admins, e.g. "123456789,987654321"
    ADMIN_TELEGRAM_IDS: str = ""

    @property
    def admin_telegram_ids(self) -> set[int]:
        if not self.ADMIN_TELEGRAM_IDS:
            return set()
        return {int(x.strip()) for x in self.ADMIN_TELEGRAM_IDS.split(",") if x.strip().isdigit()}

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

    # S3 / Object Storage (optional — falls back to local if not set)
    S3_ENDPOINT_URL: Optional[str] = None      # e.g. https://storage.yandexcloud.net
    S3_ACCESS_KEY_ID: Optional[str] = None
    S3_SECRET_ACCESS_KEY: Optional[str] = None
    S3_BUCKET_NAME: Optional[str] = None
    S3_REGION: str = "ru-central1"
    S3_PUBLIC_URL: Optional[str] = None        # e.g. https://bucket.storage.yandexcloud.net

    @property
    def s3_enabled(self) -> bool:
        return bool(self.S3_ENDPOINT_URL and self.S3_ACCESS_KEY_ID and self.S3_SECRET_ACCESS_KEY and self.S3_BUCKET_NAME)

    class Config:
        env_file = str(_ROOT / ".env")


settings = Settings()
