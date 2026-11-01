"""Conversation + message APIs.

POST /{id}/messages persists the user message and creates an AgentRun in
CREATED state. The autonomous execution loop (Phase 3) will drive that run;
until then the run is persisted with its run_created event and NO fabricated
progress — clients observe it through the run events endpoint.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.events import emit_event
from app.api.v1.projects import current_user_id, ensure_user
from app.core.database import get_db
from app.models import AgentRun, Conversation, Message, Project, utcnow
from app.schemas import (
    ConversationOut,
    CreateConversationIn,
    MessageOut,
    SendMessageIn,
    SendMessageResult,
    conversation_out,
    message_out,
    run_out,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _get_conversation(
    db: Session, user_id: str, conversation_id: str
) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != user_id:
        raise HTTPException(status_code=404, detail="conversation not found")
    return conversation


def _conversation_messages(db: Session, conversation_id: str) -> list[Message]:
    return list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at, Message.id)
        ).all()
    )


@router.get("", response_model=list[ConversationOut])
def list_conversations(
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> list[ConversationOut]:
    ensure_user(db, user_id)
    rows = db.scalars(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc())
    ).all()
    return [conversation_out(c, _conversation_messages(db, c.id)) for c in rows]


@router.post("", response_model=ConversationOut, status_code=201)
def create_conversation(
    payload: CreateConversationIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> ConversationOut:
    ensure_user(db, user_id)
    project_id = None
    if payload.projectId is not None:
        project = db.execute(
            select(Project).where(Project.id == payload.projectId),
        ).scalar_one_or_none()
        if project is None or project.user_id != user_id:
            raise HTTPException(
                status_code=404, detail="project not found for this user"
            )
        project_id = project.id

    conversation = Conversation(
        user_id=user_id,
        title=payload.title,
        project_id=project_id,
    )
    db.add(conversation)
    db.commit()
    return conversation_out(conversation, [])


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> ConversationOut:
    conversation = _get_conversation(db, user_id, conversation_id)
    return conversation_out(conversation, _conversation_messages(db, conversation.id))


@router.post("/{conversation_id}/messages", response_model=SendMessageResult, status_code=201)
def send_message(
    conversation_id: str,
    payload: SendMessageIn,
    db: Session = Depends(get_db),
    user_id: str = Depends(current_user_id),
) -> SendMessageResult:
    conversation = _get_conversation(db, user_id, conversation_id)

    message = Message(
        conversation_id=conversation.id,
        role="user",
        content=payload.content,
        attachments=payload.attachments,
    )
    db.add(message)

    run = AgentRun(
        user_id=user_id,
        conversation_id=conversation.id,
        project_id=conversation.project_id,
        goal=payload.content,
        status="created",
    )
    db.add(run)
    conversation.updated_at = utcnow()
    db.commit()

    # Persisted run creation event — the honest starting point of the log.
    # The orchestrator (Phase 3) picks the run up from here and drives it.
    emit_event(db, run.id, "run_created", {"goal": payload.content[:500]})

    return SendMessageResult(message=message_out(message), run=run_out(run))
