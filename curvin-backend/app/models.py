"""SQLAlchemy models — Phase 1 persistence schema.

All rows are user-scoped (user_id foreign keys) so multi-user isolation is
built in from day one. Timestamps are timezone-aware UTC. Structured agent
content (blocks, event payloads, attachments) uses JSON columns, which work
on both SQLite and Postgres.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


# ------------------------------------------------------------------ users


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id("user")
    )
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)


# --------------------------------------------------------------- projects


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id("proj")
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    template_id: Mapped[str | None] = mapped_column(String(64))
    tech_stack: Mapped[list] = mapped_column(JSON, default=list)
    current_task: Mapped[str | None] = mapped_column(Text)
    active_branch: Mapped[str | None] = mapped_column(String(255))

    # Repository reference (inlined; nullable until a repo is connected).
    repo_id: Mapped[str | None] = mapped_column(String(64))
    repo_provider: Mapped[str | None] = mapped_column(String(32))
    repo_owner: Mapped[str | None] = mapped_column(String(255))
    repo_name: Mapped[str | None] = mapped_column(String(255))
    repo_url: Mapped[str | None] = mapped_column(String(1024))
    repo_default_branch: Mapped[str | None] = mapped_column(String(255))

    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class ProjectFile(TimestampMixin, Base):
    """Persisted per-project file index (filled by the context engine / runner)."""

    __tablename__ = "project_files"
    __table_args__ = (UniqueConstraint("project_id", "path", name="uq_project_file_path"),)

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id("file")
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    path: Mapped[str] = mapped_column(String(1024))
    type: Mapped[str] = mapped_column(String(16))  # file | dir
    size_bytes: Mapped[int | None] = mapped_column(Integer)


# ---------------------------------------------------------- conversations


class Conversation(TimestampMixin, Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id("conv")
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    repository_id: Mapped[str | None] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))


class Message(TimestampMixin, Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id("msg")
    )
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))  # user | agent
    content: Mapped[str | None] = mapped_column(Text)  # user messages
    attachments: Mapped[list] = mapped_column(JSON, default=list)  # user messages
    blocks: Mapped[list | None] = mapped_column(JSON)  # agent turn blocks
    status: Mapped[str | None] = mapped_column(String(32))  # agent turn status
    run_id: Mapped[str | None] = mapped_column(String(64))  # producing agent run


# ------------------------------------------------------------ agent runs


class AgentRun(TimestampMixin, Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id("run")
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    conversation_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), index=True
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
    goal: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(32), default="created", index=True
    )
    error: Mapped[str | None] = mapped_column(Text)


class RunTask(TimestampMixin, Base):
    __tablename__ = "run_tasks"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id("task")
    )
    run_id: Mapped[str] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="pending")


class RunEvent(Base):
    """Append-only run event log; (run_id, seq) is unique and monotonic."""

    __tablename__ = "run_events"
    __table_args__ = (
        UniqueConstraint("run_id", "seq", name="uq_run_event_seq"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True
    )
    seq: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class Approval(TimestampMixin, Base):
    __tablename__ = "approvals"

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: new_id("appr")
    )
    run_id: Mapped[str] = mapped_column(
        ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="pending")
