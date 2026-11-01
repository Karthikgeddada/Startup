"""Pydantic schemas — the API contract, mirroring src/types/domain.ts.

Frontend compatibility rule: response shapes use the same camelCase field
names as the frontend domain types, so the HTTP adapters (Phase 7) map 1:1.
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

from app.models import AgentRun, Approval, Conversation, Message, Project, ProjectFile

# ------------------------------------------------------------------ inputs


class CreateProjectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    mode: Literal["blank", "github", "template", "ai"]
    githubRepoId: str | None = None
    templateId: str | None = None
    prompt: str | None = None


class CreateConversationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=255)
    projectId: str | None = None


class SendMessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1)
    attachments: list[dict] = Field(default_factory=list)


class CreateApprovalIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=255)
    description: str = ""


# ----------------------------------------------------------------- outputs


class RepositoryRefOut(BaseModel):
    id: str
    provider: str
    owner: str
    name: str
    url: str
    defaultBranch: str


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str
    status: str
    repository: RepositoryRefOut | None
    activeBranch: str | None
    techStack: list[str]
    currentTask: str | None
    templateId: str | None
    createdAt: datetime
    updatedAt: datetime
    lastActivityAt: datetime


class RepoFileOut(BaseModel):
    path: str
    type: str
    sizeBytes: int | None


class UserMessageOut(BaseModel):
    id: str
    role: Literal["user"]
    content: str
    attachments: list[dict]
    createdAt: datetime


class AgentTurnOut(BaseModel):
    id: str
    role: Literal["agent"]
    status: str
    blocks: list[dict]
    createdAt: datetime


MessageOut = Annotated[
    Union[UserMessageOut, AgentTurnOut], Field(discriminator="role")
]


class ConversationOut(BaseModel):
    id: str
    title: str
    projectId: str | None
    repositoryId: str | None
    messages: list[MessageOut]
    createdAt: datetime
    updatedAt: datetime


class RunTaskOut(BaseModel):
    id: str
    description: str
    status: str
    position: int


class RunOut(BaseModel):
    id: str
    conversationId: str | None
    projectId: str | None
    goal: str
    status: str
    error: str | None
    tasks: list[RunTaskOut]
    createdAt: datetime
    updatedAt: datetime


class RunEventOut(BaseModel):
    seq: int
    type: str
    payload: dict
    createdAt: datetime


class ApprovalOut(BaseModel):
    id: str
    runId: str
    title: str
    description: str
    status: str
    createdAt: datetime
    updatedAt: datetime


class SendMessageResult(BaseModel):
    message: MessageOut
    run: RunOut


# -------------------------------------------------------------- serializers


def repository_ref_out(p: Project) -> RepositoryRefOut | None:
    if not p.repo_id:
        return None
    return RepositoryRefOut(
        id=p.repo_id,
        provider=p.repo_provider or "github",
        owner=p.repo_owner or "",
        name=p.repo_name or "",
        url=p.repo_url or "",
        defaultBranch=p.repo_default_branch or "main",
    )


def project_out(p: Project) -> ProjectOut:
    return ProjectOut(
        id=p.id,
        name=p.name,
        description=p.description,
        status=p.status,
        repository=repository_ref_out(p),
        activeBranch=p.active_branch,
        techStack=list(p.tech_stack or []),
        currentTask=p.current_task,
        templateId=p.template_id,
        createdAt=p.created_at,
        updatedAt=p.updated_at,
        lastActivityAt=p.last_activity_at,
    )


def repo_file_out(f: ProjectFile) -> RepoFileOut:
    return RepoFileOut(path=f.path, type=f.type, sizeBytes=f.size_bytes)


def message_out(m: Message) -> UserMessageOut | AgentTurnOut:
    if m.role == "user":
        return UserMessageOut(
            id=m.id,
            role="user",
            content=m.content or "",
            attachments=list(m.attachments or []),
            createdAt=m.created_at,
        )
    return AgentTurnOut(
        id=m.id,
        role="agent",
        status=m.status or "completed",
        blocks=list(m.blocks or []),
        createdAt=m.created_at,
    )


def conversation_out(c: Conversation, messages: list[Message]) -> ConversationOut:
    return ConversationOut(
        id=c.id,
        title=c.title,
        projectId=c.project_id,
        repositoryId=c.repository_id,
        messages=[message_out(m) for m in messages],
        createdAt=c.created_at,
        updatedAt=c.updated_at,
    )


def run_task_out(t) -> RunTaskOut:
    return RunTaskOut(
        id=t.id, description=t.description, status=t.status, position=t.position
    )


def run_out(r: AgentRun, tasks: list | None = None) -> RunOut:
    return RunOut(
        id=r.id,
        conversationId=r.conversation_id,
        projectId=r.project_id,
        goal=r.goal,
        status=r.status,
        error=r.error,
        tasks=[run_task_out(t) for t in (tasks or [])],
        createdAt=r.created_at,
        updatedAt=r.updated_at,
    )


def run_event_out(e) -> RunEventOut:
    return RunEventOut(
        seq=e.seq, type=e.type, payload=dict(e.payload or {}), createdAt=e.created_at
    )


def approval_out(a: Approval) -> ApprovalOut:
    return ApprovalOut(
        id=a.id,
        runId=a.run_id,
        title=a.title,
        description=a.description,
        status=a.status,
        createdAt=a.created_at,
        updatedAt=a.updated_at,
    )
