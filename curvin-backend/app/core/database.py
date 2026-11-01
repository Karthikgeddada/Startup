"""Database engine and session management.

SQLite for local development/tests, Postgres in production. The engine is
created from settings at import time; tests point DATABASE_URL at a temp
SQLite file before importing the app.
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for all CURVIN models."""


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {}


settings = get_settings()
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    **_engine_kwargs(settings.database_url),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Development/test convenience — production uses Alembic."""
    from app import models  # noqa: F401  (register models on the metadata)

    Base.metadata.create_all(bind=engine)


def check_database(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
