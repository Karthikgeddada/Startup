"""CURVIN model gateway — provider-neutral LLM access (Phase 2).

Public surface used by the rest of the backend:
    ModelRole, ToolSpec, ToolCallRequest, CompletionResult, StreamEvent,
    EmbeddingResult, Usage, ExecutionBudget, BudgetTracker,
    resolve_roles, ResolvedRoles, OpenAICompatibleGateway, errors.
"""
from app.agent.gateway.base import (
    BudgetExceededError,
    BudgetTracker,
    CompletionResult,
    EmbeddingResult,
    ExecutionBudget,
    GatewayError,
    GatewayNotConfiguredError,
    Message,
    ModelGateway,
    ModelRole,
    ProviderError,
    ProviderUnavailableError,
    StreamEvent,
    ToolCallRequest,
    ToolSpec,
    Usage,
)
from app.agent.gateway.openai_compat import OpenAICompatibleGateway
from app.agent.gateway.roles import ResolvedRoles, resolve_roles

__all__ = [
    "BudgetExceededError",
    "BudgetTracker",
    "CompletionResult",
    "EmbeddingResult",
    "ExecutionBudget",
    "GatewayError",
    "GatewayNotConfiguredError",
    "Message",
    "ModelGateway",
    "ModelRole",
    "OpenAICompatibleGateway",
    "ProviderError",
    "ProviderUnavailableError",
    "ResolvedRoles",
    "StreamEvent",
    "ToolCallRequest",
    "ToolSpec",
    "Usage",
    "resolve_roles",
]
