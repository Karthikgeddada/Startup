"""Database engine and session management.

SQLite for local development/tests, Postgres in production. The engine is
created from settings at import time; tests point DATABASE_URL at a temp
SQLite file before importing the app.
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for all CURVIN models."""


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    if not url.startswith("postgresql"):
        return {}
    # Direct Postgres (no pooler): default pooling + prepared statements are fine.
    if "pooler" not in url and ":6543/" not in url:
        return {}
    # Supabase/Render-style pgBouncer (transaction mode, port 6543):
    # logical connections are handed to different server connections, so
    # SQLAlchemy must not pool them (NullPool) and psycopg3 must not use
    # server-side prepared statements or cached statements — all of that
    # state leaks across pgBouncer's server connections and breaks mid-run.
    kwargs: dict = {"poolclass": NullPool}
    if url.startswith("postgresql+psycopg://"):
        kwargs["connect_args"] = {"prepare_threshold": None}
        kwargs["prepared_statement_cache_size"] = 0
    return kwargs


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
