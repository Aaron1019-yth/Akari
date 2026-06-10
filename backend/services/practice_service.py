import hashlib
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import models
from backend.schemas import (
    ErrorBatchRequest,
    ErrorBatchResponse,
    PracticeSessionOut,
    PracticeSessionRequest,
    PracticeSessionResponse,
)
from backend.services import profile_service


class PracticeError(Exception):
    pass


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _hash_question(text: str) -> str:
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


def create_practice_session(db: Session, payload: PracticeSessionRequest) -> PracticeSessionResponse:
    if payload.correct_count > payload.question_count:
        raise PracticeError("correct_count cannot exceed question_count")
    task = db.get(models.DailyTask, payload.daily_task_id)
    module = db.get(models.Module, payload.module_id)
    if task is None or module is None:
        raise PracticeError("Task or module not found")
    if task.module_id != module.id:
        raise PracticeError("Task does not belong to module")

    ended_at = datetime.now(UTC).replace(tzinfo=None)
    started_at = ended_at - timedelta(seconds=payload.duration_seconds)
    session = models.PracticeSession(
        id=_id("session"),
        daily_task_id=task.id,
        module_id=module.id,
        started_at=started_at,
        ended_at=ended_at,
        question_count=payload.question_count,
        correct_count=payload.correct_count,
        accuracy=round(payload.correct_count / payload.question_count, 4),
        duration_seconds=payload.duration_seconds,
        tags_json=json.dumps(payload.tags, ensure_ascii=False),
    )
    db.add(session)
    task.actual_minutes = max(task.actual_minutes, round(payload.duration_seconds / 60))
    if task.type in ("practice", "mock_exam"):
        task.status = "completed"
    profile_service.recalculate_module(db, module)
    goal = module.track.goal
    profile = profile_service.recalculate_profile(db, goal)
    db.commit()
    db.refresh(session)
    db.refresh(task)
    db.refresh(module)
    return PracticeSessionResponse(
        session=PracticeSessionOut(
            id=session.id,
            daily_task_id=session.daily_task_id,
            module_id=session.module_id,
            started_at=session.started_at,
            ended_at=session.ended_at,
            question_count=session.question_count,
            correct_count=session.correct_count,
            accuracy=session.accuracy,
            duration_seconds=session.duration_seconds,
            tags=json.loads(session.tags_json),
        ),
        task=task,
        module=module,
        profile=profile_service.serialize_profile(profile),
    )


def create_error_batch(db: Session, payload: ErrorBatchRequest) -> ErrorBatchResponse:
    session = db.get(models.PracticeSession, payload.practice_session_id)
    if session is None:
        raise PracticeError("Practice session not found")

    created = 0
    skipped = 0
    touched_modules: set[str] = set()
    for item in payload.errors:
        question_hash = _hash_question(item.question_text)
        existing = db.scalar(
            select(models.ErrorRecord).where(
                models.ErrorRecord.practice_session_id == payload.practice_session_id,
                models.ErrorRecord.question_hash == question_hash,
            )
        )
        if existing is not None:
            skipped += 1
            continue
        db.add(
            models.ErrorRecord(
                id=_id("error"),
                practice_session_id=payload.practice_session_id,
                module_id=item.module_id,
                question_hash=question_hash,
                question_text=item.question_text,
                user_answer=item.user_answer,
                correct_answer=item.correct_answer,
                explanation=item.explanation,
                tags_json=json.dumps(item.tags, ensure_ascii=False),
                recorded_at=datetime.now(UTC).replace(tzinfo=None),
                reviewed_count=0,
                mastered=False,
            )
        )
        touched_modules.add(item.module_id)
        created += 1

    goal = None
    for module_id in touched_modules:
        module = db.get(models.Module, module_id)
        if module is not None:
            goal = module.track.goal
    profile = profile_service.recalculate_profile(db, goal) if goal is not None else None
    db.commit()
    return ErrorBatchResponse(created_count=created, skipped_count=skipped, profile=profile_service.serialize_profile(profile))
