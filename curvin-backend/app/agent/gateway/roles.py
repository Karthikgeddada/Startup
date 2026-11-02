"""Role resolution: LLM_* settings → per-role model configuration.

Partial validation by design — the gateway is only *required* when agent
features are used. resolve_roles() raises GatewayNotConfiguredError with an
actionable message the moment it is needed but not configured; the API boots
fine without any LLM settings.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.agent.gateway.base import GatewayNotConfiguredError, ModelRole

_ROLE_MODEL_ATTR = {
    ModelRole.FAST: "llm_fast_model",
    ModelRole.PLANNING: "llm_planning_model",
    ModelRole.CODE: "llm_code_model",
    ModelRole.VERIFICATION: "llm_verification_model",
    ModelRole.EMBEDDING: "llm_embedding_model",
}

_REQUIRED = (
    "LLM_PROVIDER",
    "LLM_BASE_URL",
    "LLM_MODEL",
    "LLM_API_KEY",
)


@dataclass(frozen=True)
class ResolvedRoles:
    """Everything the OpenAI-compatible gateway needs to build itself."""

    provider: str
    base_url: str
    api_key: str
    role_models: dict[ModelRole, str]


def resolve_roles(settings) -> ResolvedRoles:
    """Map settings (any Settings-like object) to per-role model names.

    Any role without its own override falls back to the base LLM_MODEL.
    """
    missing = [name for name, present in {
        "LLM_PROVIDER": settings.llm_provider,
        "LLM_BASE_URL": settings.llm_base_url,
        "LLM_MODEL": settings.llm_model,
        "LLM_API_KEY": settings.llm_api_key,
    }.items() if not present]
    if missing:
        raise GatewayNotConfiguredError(
            "model gateway not configured — set "
            + ", ".join(missing)
            + " (see curvin-backend/.env.example)"
        )

    role_models: dict[ModelRole, str] = {}
    for role, attr in _ROLE_MODEL_ATTR.items():
        override = getattr(settings, attr, None)
        role_models[role] = override or settings.llm_model

    return ResolvedRoles(
        provider=settings.llm_provider,
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        role_models=role_models,
    )
