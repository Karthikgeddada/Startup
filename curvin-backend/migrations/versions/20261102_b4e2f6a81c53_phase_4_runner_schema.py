"""phase 4 runner schema

Revision ID: b4e2f6a81c53
Revises: 9cd1e2cdfe93
Create Date: 2026-11-02

Adds `runners` (curvin-runner registrations, SHA-256 token hash, heartbeat)
and `runner_jobs` (queued → claimed → succeeded | failed | timeout tool
executions dispatched to the user's machine).
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b4e2f6a81c53"
down_revision: str | None = "9cd1e2cdfe93"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "runners",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("platform", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_runners_user_id"), "runners", ["user_id"], unique=False)

    op.create_table(
        "runner_jobs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("run_id", sa.String(length=64), nullable=True),
        sa.Column("runner_id", sa.String(length=64), nullable=True),
        sa.Column("tool", sa.String(length=64), nullable=False),
        sa.Column("arguments", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["agent_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_runner_jobs_user_id"), "runner_jobs", ["user_id"], unique=False)
    op.create_index(op.f("ix_runner_jobs_run_id"), "runner_jobs", ["run_id"], unique=False)
    op.create_index(op.f("ix_runner_jobs_runner_id"), "runner_jobs", ["runner_id"], unique=False)
    op.create_index(op.f("ix_runner_jobs_status"), "runner_jobs", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_runner_jobs_status"), table_name="runner_jobs")
    op.drop_index(op.f("ix_runner_jobs_runner_id"), table_name="runner_jobs")
    op.drop_index(op.f("ix_runner_jobs_run_id"), table_name="runner_jobs")
    op.drop_index(op.f("ix_runner_jobs_user_id"), table_name="runner_jobs")
    op.drop_table("runner_jobs")
    op.drop_index(op.f("ix_runners_user_id"), table_name="runners")
    op.drop_table("runners")
