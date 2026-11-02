"""CURVIN backend configuration.

Environment-driven with PARTIAL validation: only the configuration required for
the active functionality is enforced (LLM settings become mandatory when the
model gateway ships in Phase 2 — never at boot for unrelated features).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "CURVIN Backend"
    environment: str = "development"  # development | production
    api_version: str = "1.0.0"

    # SQLite for local-first development; Postgres URL (Supabase/Render) in production.
    database_url: str = "sqlite:///./curvin.db"

    # CORS: set FRONTEND_URL in production. Permissive default is development-only.
    frontend_url: str | None = None

    # Security (Phase 1 placeholder; real session auth lands later without schema change).
    auth_secret: str | None = None

    # Model gateway (Phase 2) — bring your own key, server-side only.
    # Entirely optional until agent features are used; never exposed to the browser.
    llm_provider: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None
    # Optional per-role overrides (default: every role uses llm_model).
    llm_fast_model: str | None = None
    llm_planning_model: str | None = None
    llm_code_model: str | None = None
    llm_verification_model: str | None = None
    llm_embedding_model: str | None = None
    # Gateway behaviour.
    llm_timeout_seconds: float = 60.0
    llm_max_retries: int = 2

    # Per-run agent execution budgets (bounded loops, never unbounded).
    agent_max_llm_calls: int = 40
    agent_max_total_tokens: int = 200_000

    # curvin-runner dispatch (Phase 4). A runner is "online" if it heartbeated
    # inside this window; tool jobs fail honestly after the job timeout.
    runner_online_window_seconds: float = 30.0
    runner_job_timeout_seconds: float = 120.0
    runner_poll_interval_seconds: float = 0.5

    @property
    def cors_origins(self) -> list[str]:
        if self.frontend_url:
            return [self.frontend_url]
        return ["*"]

    @property
    def cors_allow_credentials(self) -> bool:
        # Credentials cannot be combined with the wildcard origin.
        return bool(self.frontend_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
