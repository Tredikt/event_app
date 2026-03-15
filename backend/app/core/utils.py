"""Shared utilities."""

from datetime import datetime
from zoneinfo import ZoneInfo

MOSCOW_TZ = ZoneInfo("Europe/Moscow")


def moscow_now() -> datetime:
    """Return current Moscow time as a naive datetime (no tzinfo).

    Use this instead of datetime.utcnow() everywhere in the project
    so all stored timestamps are in Moscow time (UTC+3).
    """
    return datetime.now(MOSCOW_TZ).replace(tzinfo=None)
