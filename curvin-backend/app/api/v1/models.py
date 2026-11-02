"""Model configuration status — the BYOK surface. Never exposes keys."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.agent.gateway import GatewayNotConfiguredError, ModelRole, resolve_roles
from app.core.config import Settings, get_settings

router = APIRouter(prefix="/models", tags=["models"])


@router.get("")
def model_status(settings: Settings = Depends(get_settings)) -> dict:
    try:
        resolved = resolve_roles(settings)
    except GatewayNotConfiguredError as exc:
        return {
            "configured": False,
            "message": str(exc),
            "provider": settings.llm_provider,
            "roles": {
                role.value: {"model": None} for role in ModelRole
            },
        }
    return {
        "configured": True,
        "provider": resolved.provider,
        "roles": {
            role.value: {"model": resolved.role_models[role]}
            for role in ModelRole
        },
    }
