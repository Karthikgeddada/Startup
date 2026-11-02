"""Model gateway core: roles, tool specs, results, errors, and budgets.

Provider-neutral. The orchestrator (Phase 3) depends only on these types —
never on a specific vendor SDK — so providers can be swapped via config.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from enum import Enum


# ------------------------------------------------------------------- errors


class GatewayError(Exception):
    """Base class for every model-gateway failure."""


class GatewayNotConfiguredError(GatewayError):
    """Raised when agent features are used without complete LLM_* settings."""


class ProviderError(GatewayError):
    """The provider returned a non-retryable error response (e.g. 4xx)."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        super().__init__(f"provider error {status_code}: {message}")


class ProviderUnavailableError(GatewayError):
    """Connection failure or timeout after retries (or 5xx/429 exhaustion)."""


class BudgetExceededError(GatewayError):
    """The run's LLM call or token budget is exhausted."""


# -------------------------------------------------------------------- roles


class ModelRole(str, Enum):
    """Logical model roles. Any subset may share the same physical model."""

    FAST = "fast"  # cheap classification / routing
    PLANNING = "planning"
    CODE = "code"
    VERIFICATION = "verification"
    EMBEDDING = "embedding"


# ---------------------------------------------------------------- data types


@dataclass(frozen=True)
class ToolSpec:
    """A tool offered to the model for tool-calling."""

    name: str
    description: str
    parameters_schema: dict = field(default_factory=dict)


@dataclass(frozen=True)
class ToolCallRequest:
    """A tool invocation requested by the model."""

    id: str
    name: str
    arguments: dict


@dataclass
class Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@dataclass
class CompletionResult:
    content: str | None
    tool_calls: list[ToolCallRequest]
    finish_reason: str | None
    usage: Usage
    model: str


@dataclass
class StreamEvent:
    """One increment of a streamed completion.

    type: 'content_delta' | 'tool_call' | 'usage' | 'done'
    """

    type: str
    content: str | None = None
    tool_calls: list[ToolCallRequest] | None = None  # complete calls, on finish
    finish_reason: str | None = None
    usage: Usage | None = None


@dataclass
class EmbeddingResult:
    vector: list[float]
    usage: Usage
    model: str


# ------------------------------------------------------------------ budgets


@dataclass
class ExecutionBudget:
    """Per-run limits; the agent loop must never exceed them."""

    max_llm_calls: int = 40
    max_total_tokens: int = 200_000


class BudgetTracker:
    """Enforces an ExecutionBudget across gateway calls."""

    def __init__(self, budget: ExecutionBudget | None = None) -> None:
        self.budget = budget or ExecutionBudget()
        self.calls = 0
        self.total_tokens = 0

    def record_call(self) -> None:
        self.calls += 1
        if self.calls > self.budget.max_llm_calls:
            raise BudgetExceededError(
                f"LLM call budget exceeded ({self.budget.max_llm_calls} calls)"
            )

    def record_usage(self, usage: Usage) -> None:
        self.total_tokens += usage.total_tokens
        if self.total_tokens > self.budget.max_total_tokens:
            raise BudgetExceededError(
                f"LLM token budget exceeded ({self.budget.max_total_tokens} tokens)"
            )


# ----------------------------------------------------------------- protocol


Message = dict  # {"role": ..., "content": ...} — provider-neutral shape


class ModelGateway(ABC):
    """A provider-neutral LLM gateway. Implementations must never expose keys."""

    @abstractmethod
    def complete(
        self,
        messages: Sequence[Message],
        *,
        role: ModelRole = ModelRole.CODE,
        tools: Sequence[ToolSpec] | None = None,
        temperature: float | None = None,
    ) -> CompletionResult: ...

    @abstractmethod
    def stream(
        self,
        messages: Sequence[Message],
        *,
        role: ModelRole = ModelRole.CODE,
        tools: Sequence[ToolSpec] | None = None,
        temperature: float | None = None,
    ) -> Iterator[StreamEvent]: ...

    @abstractmethod
    def embed(
        self, texts: Sequence[str], *, role: ModelRole = ModelRole.EMBEDDING
    ) -> list[EmbeddingResult]: ...
