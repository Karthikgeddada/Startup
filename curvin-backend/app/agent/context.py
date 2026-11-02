"""Context & memory (Phase 5).

Two bounded services the orchestrator consumes:

1. Conversation memory: the most recent RECENT_WINDOW messages are kept
   verbatim; everything older is compacted into one deterministic digest
   (truncation, not invention — no LLM summary unless a key is configured,
   and even then the summary is clearly labelled). This keeps long
   conversations inside the model context without dropping them silently.

2. Project file index: the `project_files` table is filled from real runner
   tool outcomes (`record_file_facts`) and injected into run context so the
   agent knows which files exist before it reads them. The index is never
   guessed — only paths the runner actually listed/read/wrote appear.
"""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Message, Project, ProjectFile, RunEvent, utcnow

RECENT_WINDOW = 10
MAX_INDEX_FILES = 40


def _agent_text(message: Message) -> str:
    return " ".join(
        b.get("content", "")
        for b in (message.blocks or [])
        if isinstance(b, dict) and b.get("kind") == "text" and b.get("content")
    ).strip()


def compact_history(
    db: Session, conversation_id: str, *, window: int = RECENT_WINDOW
) -> list[dict]:
    """Conversation as LLM messages: compacted digest + recent window.

    Messages older than the window collapse into one system digest line per
    exchange — content is truncated, never rewritten or invented.
    """
    history = list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at, Message.id)
        ).all()
    )
    if not history:
        return []

    older, recent = history[:-window] if len(history) > window else [], history[-window:]

    messages: list[dict] = []
    if older:
        digest_lines = []
        for m in older:
            if m.role == "user":
                digest_lines.append(f"user asked: {(m.content or '').strip()[:160]}")
            else:
                text = _agent_text(m)[:160]
                if text:
                    digest_lines.append(f"agent answered: {text}")
        messages.append(
            {
                "role": "system",
                "content": (
                    f"Earlier conversation ({len(older)} messages, compacted — "
                    "truncated, not summarised):\n" + "\n".join(digest_lines)
                ),
            }
        )
    for m in recent:
        if m.role == "user":
            messages.append({"role": "user", "content": m.content or ""})
        else:
            text = _agent_text(m)
            if text:
                messages.append({"role": "assistant", "content": text})
    return messages


def _upsert_file(
    db: Session,
    project_id: str | None,
    path: str,
    *,
    file_type: str,
    size_bytes: int | None,
) -> None:
    if not project_id or not path or len(path) > 1024:
        return
    row = db.scalar(
        select(ProjectFile).where(
            ProjectFile.project_id == project_id, ProjectFile.path == path
        )
    )
    if row is None:
        row = ProjectFile(
            project_id=project_id, path=path, type=file_type, size_bytes=size_bytes
        )
        db.add(row)
    else:
        row.type = file_type
        if size_bytes is not None:
            row.size_bytes = size_bytes
        row.updated_at = utcnow()
    db.commit()


def record_file_facts(
    db: Session,
    *,
    project_id: str | None,
    tool: str,
    arguments: dict,
    outcome: dict,
) -> list[str]:
    """Fill the project file index from a REAL runner tool outcome.

    Called by the orchestrator after every successful tool execution; unknown
    tools and failed outcomes change nothing.
    """
    if not outcome.get("ok") or not project_id:
        return []
    result = outcome.get("result") or {}
    touched: list[str] = []

    if tool == "fs_list":
        for entry in (result.get("entries") or [])[:200]:
            path = str(entry.get("path") or "")
            _upsert_file(
                db,
                project_id,
                path,
                file_type=entry.get("type") or "file",
                size_bytes=entry.get("sizeBytes"),
            )
            touched.append(path)
    elif tool == "fs_read":
        path = str(arguments.get("path") or "")
        _upsert_file(
            db, project_id, path, file_type="file", size_bytes=result.get("bytes")
        )
        touched.append(path)
    elif tool == "fs_write":
        path = str(arguments.get("path") or "")
        _upsert_file(
            db, project_id, path, file_type="file", size_bytes=result.get("bytes")
        )
        touched.append(path)
    return touched


def project_file_context(db: Session, project_id: str | None) -> dict | None:
    """System message describing the project's known file index (bounded)."""
    if not project_id:
        return None
    files = list(
        db.scalars(
            select(ProjectFile)
            .where(ProjectFile.project_id == project_id)
            .order_by(ProjectFile.path)
        ).all()
    )
    project = db.get(Project, project_id)
    if not files:
        return None
    listing = "\n".join(
        f"- {f.path} ({f.type}{f', {f.size_bytes}B' if f.size_bytes is not None else ''})"
        for f in files[:MAX_INDEX_FILES]
    )
    note = (
        f" (+{len(files) - MAX_INDEX_FILES} more files not listed)"
        if len(files) > MAX_INDEX_FILES
        else ""
    )
    return {
        "role": "system",
        "content": (
            f"Project {project.name if project else project_id} — files known from "
            f"runner-verified tool results{note}:\n{listing}"
        ),
    }


def last_run_events(db: Session, run_id: str) -> list[RunEvent]:
    """Ordered event log for a run (utility for tests + resume)."""
    return list(
        db.scalars(
            select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.seq)
        ).all()
    )
