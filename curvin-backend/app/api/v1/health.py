"""Health and readiness."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import check_database, get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    settings = get_settings()
    db_ok = check_database(db)
    return {
        "status": "ok" if db_ok else "degraded",
        "service": settings.app_name,
        "version": settings.api_version,
        "environment": settings.environment,
        "database": "ok" if db_ok else "unavailable",
    }
