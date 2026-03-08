from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class NewsPostCreate(BaseModel):
    title: str
    content: str
    city: Optional[str] = None


class NewsAuthor(BaseModel):
    id: int
    first_name: str
    last_name: str
    avatar_url: Optional[str] = None

    model_config = {"from_attributes": True}


class NewsPostOut(BaseModel):
    id: int
    title: str
    content: str
    image_url: Optional[str] = None
    city: Optional[str] = None
    author: Optional[NewsAuthor] = None
    created_at: datetime

    model_config = {"from_attributes": True}
