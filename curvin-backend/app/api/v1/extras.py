"""Phase 7 support endpoints — the remaining frontend service contracts.

Everything here is real data from the database (placeholder identity via
X-User-Id like every other router) with one honest exception: GitHub
repository listing returns [] until GITHUB_TOKEN is configured — an empty
list is displayed, never fabricated repos. Learn/Discover content stays on
the frontend's static content library (no backend feature yet).
"""
from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.projects import current_user_id, ensure_user
from app.core.config import get_settings
from app.core.database import get_db
from app.models import AgentRun, Conversation, Project, ProjectFile
from app.schemas import (
    ActivityItemOut,
    GitHubRepositoryOut,
    ProjectTemplateOut,
    RecentItemOut,
    SearchResultOut,
    UserProfileOut,
)

logger = logging.getLogger("curvin.extras")

router = APIRouter(tags=["extras"])

STARTER_TEMPLATES = [
    ProjectTemplateOut(
        id="tpl-next-supabase",
        name="Next.js + Supabase starter",
        description="Next.js app router, Supabase Postgres, typed service layer.",
        category="Web app",
        stack=["Next.js", "TypeScript", "Supabase", "Tailwind"],
    ),
    ProjectTemplateOut(
        id="tpl-fastapi-postgres",
        name="FastAPI + Postgres starter",
        description="FastAPI modular monolith with SQLAlchemy and Alembic.",
        category="API service",
        stack=["Python", "FastAPI", "Postgres", "Alembic"],
    ),
    ProjectTemplateOut(
        id="tpl-agent-service",
        name="Agent service starter",
        description="FastAPI backend with an event-sourced agent loop and SSE.",
        category="AI",
        stack=["Python", "FastAPI", "SSE", "LLM gateway"],
    ),
]


@router.get("/me", response_model=UserProfileOut)
def get_current_user(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> UserProfileOut:
    """Placeholder identity (Phase 1 scope): the X-User-Id user."""
    user = ensure_user(db, user_id)
    return UserProfileOut(
        id=user.id, name=user.name, email=user.email, createdAt=user.created_at
    )


@router.get("/activity", response_model=list[ActivityItemOut])
def list_activity(
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[ActivityItemOut]:
    """Recent agent runs as honest activity items (goal + outcome state)."""
    ensure_user(db, user_id)
    rows = db.scalars(
        select(AgentRun)
        .where(AgentRun.user_id == user_id)
        .order_by(AgentRun.created_at.desc())
        .limit(limit)
    ).all()
    return [
        ActivityItemOut(
            id=run.id,
            projectId=run.project_id,
            description=f"{run.goal[:160]} — {run.status}",
            createdAt=run.created_at,
        )
        for run in rows
    ]


@router.get("/templates", response_model=list[ProjectTemplateOut])
def list_templates() -> list[ProjectTemplateOut]:
    """Static starter templates (real scaffolding lands with Phase 9)."""
    return STARTER_TEMPLATES


@router.get("/github/repositories", response_model=list[GitHubRepositoryOut])
def list_github_repositories(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[GitHubRepositoryOut]:
    """The user's GitHub repos — real listing only with GITHUB_TOKEN set.

    No token → empty list (the frontend shows an honest empty state); a
    GitHub error → empty list with a server-side warning, never fake repos.
    """
    ensure_user(db, user_id)
    token = get_settings().github_token
    if not token:
        return []
    try:
        response = httpx.get(
            "https://api.github.com/user/repos",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            params={"per_page": 50, "sort": "updated"},
            timeout=15,
        )
        response.raise_for_status()
        repos = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("GitHub repository listing failed: %s", exc)
        return []
    return [
        GitHubRepositoryOut(
            id=str(repo.get("id")),
            owner=(repo.get("owner") or {}).get("login", ""),
            name=repo.get("name", ""),
            description=repo.get("description") or "",
            primaryLanguage=(repo.get("language") or None),
            stars=int(repo.get("stargazers_count") or 0),
            isPrivate=bool(repo.get("private")),
            updatedAt=repo.get("updated_at") or "",
        )
        for repo in repos
    ]


@router.get("/recents", response_model=list[RecentItemOut])
def list_recents(
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[RecentItemOut]:
    """Recent conversations + projects, newest first — real rows only."""
    ensure_user(db, user_id)
    projects = db.scalars(
        select(Project).where(Project.user_id == user_id).order_by(Project.updated_at.desc())
    ).all()
    conversations = db.scalars(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc())
    ).all()
    items = [
        (
            p.updated_at,
            RecentItemOut(
                id=p.id,
                type="project",
                title=p.name,
                subtitle=p.current_task or p.description[:80] or None,
                projectId=p.id,
                href=f"/workspace?project={p.id}",
                lastAccessedAt=p.updated_at,
            ),
        )
        for p in projects
    ] + [
        (
            c.updated_at,
            RecentItemOut(
                id=c.id,
                type="conversation",
                title=c.title,
                subtitle="Conversation",
                projectId=c.project_id,
                href=f"/workspace?conversation={c.id}",
                lastAccessedAt=c.updated_at,
            ),
        )
        for c in conversations
    ]
    items.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _, item in items[:limit]]


@router.get("/search", response_model=list[SearchResultOut])
def search(
    q: str = Query(min_length=1, max_length=200),
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[SearchResultOut]:
    """Search across projects, conversations, and indexed project files."""
    ensure_user(db, user_id)
    pattern = f"%{q}%"
    results: list[SearchResultOut] = []

    projects = db.scalars(
        select(Project)
        .where(Project.user_id == user_id, Project.name.ilike(pattern))
        .order_by(Project.updated_at.desc())
        .limit(10)
    ).all()
    results.extend(
        SearchResultOut(
            id=p.id,
            category="projects",
            title=p.name,
            subtitle=p.description[:80] or None,
            href=f"/workspace?project={p.id}",
        )
        for p in projects
    )

    conversations = db.scalars(
        select(Conversation)
        .where(Conversation.user_id == user_id, Conversation.title.ilike(pattern))
        .order_by(Conversation.updated_at.desc())
        .limit(10)
    ).all()
    results.extend(
        SearchResultOut(
            id=c.id,
            category="conversations",
            title=c.title,
            subtitle="Conversation",
            href=f"/workspace?conversation={c.id}",
        )
        for c in conversations
    )

    files = db.scalars(
        select(ProjectFile)
        .join(Project, ProjectFile.project_id == Project.id)
        .where(Project.user_id == user_id, ProjectFile.path.ilike(pattern))
        .order_by(ProjectFile.updated_at.desc())
        .limit(10)
    ).all()
    results.extend(
        SearchResultOut(
            id=f"{f.project_id}:{f.path}",
            category="files",
            title=f.path,
            subtitle=None,
            href=f"/workspace?project={f.project_id}",
        )
        for f in files
    )

    if not results:
        raise HTTPException(status_code=404, detail=f"no results for {q!r}")
    return results[:20]
