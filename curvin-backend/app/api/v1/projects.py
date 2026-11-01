"""Project APIs — user-scoped CRUD matching ProjectsService.

Identity note (Phase 1): `X-User-Id` selects the acting user (a dev user by
default). This is a placeholder for real session auth; every row is already
user-scoped so the switch changes one dependency, not the schema.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Project, ProjectFile, User
from app.schemas import (
    CreateProjectIn,
    ProjectOut,
    RepoFileOut,
    project_out,
    repo_file_out,
)

router = APIRouter(prefix="/projects", tags=["projects"])

DEV_USER_ID = "user_dev"


def current_user_id(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    return x_user_id or DEV_USER_ID


def ensure_user(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        user = User(
            id=user_id,
            name=f"Developer {user_id}",
            email=f"{user_id}@local.dev",
        )
        db.add(user)
        db.commit()
    return user


def _get_project(db: Session, user_id: str, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.user_id != user_id:
        # Not-found for both missing and foreign projects (no enumeration).
        raise HTTPException(status_code=404, detail="project not found")
    return project


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[ProjectOut]:
    ensure_user(db, user_id)
    rows = db.scalars(
        select(Project)
        .where(Project.user_id == user_id)
        .order_by(Project.updated_at.desc())
    ).all()
    return [project_out(p) for p in rows]


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(
    payload: CreateProjectIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> ProjectOut:
    ensure_user(db, user_id)

    # GitHub mode cannot be completed yet (GitHub integration is Phase 8).
    # The project is persisted honestly as `importing`, never faked.
    status = "importing" if payload.mode == "github" else "active"
    current_task = (
        "GitHub repository import pending (integration not yet implemented)"
        if payload.mode == "github"
        else None
    )

    project = Project(
        user_id=user_id,
        name=payload.name,
        description=payload.description,
        status=status,
        template_id=payload.templateId if payload.mode == "template" else None,
        tech_stack=[],
        current_task=current_task,
        repo_id=payload.githubRepoId if payload.mode == "github" else None,
        repo_provider="github" if payload.mode == "github" else None,
    )
    db.add(project)
    db.commit()
    return project_out(project)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> ProjectOut:
    return project_out(_get_project(db, user_id, project_id))


@router.get("/{project_id}/files", response_model=list[RepoFileOut])
def list_project_files(
    project_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[RepoFileOut]:
    project = _get_project(db, user_id, project_id)
    rows = db.scalars(
        select(ProjectFile)
        .where(ProjectFile.project_id == project.id)
        .order_by(ProjectFile.path)
    ).all()
    # Empty until the context engine / runner indexes a repository — by design.
    return [repo_file_out(f) for f in rows]
