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


class NewsImageOut(BaseModel):
    id: int
    image_url: str
    order: int

    model_config = {"from_attributes": True}


class NewsPostOut(BaseModel):
    id: int
    title: str
    content: str
    image_url: Optional[str] = None
    images: list[NewsImageOut] = []
    city: Optional[str] = None
    author: Optional[NewsAuthor] = None
    event_id: Optional[int] = None
    event_image_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_post(cls, post) -> "NewsPostOut":
        data = cls.model_validate(post)
        if not data.image_url and not data.images and post.event_id and post.event:
            data.event_image_url = post.event.image_url
        return data
