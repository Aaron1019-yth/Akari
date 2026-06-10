import json
from datetime import UTC, datetime
from statistics import pstdev
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.db import models
from backend.schemas import StudentProfileOut


def _json_list(value: str) -> list[str]:
    parsed = json.loads(value or "[]")
    return parsed if isinstance(parsed, list) else []


def _json_dict(value: str) -> dict[str, float]:
    parsed = json.loads(value or "{}")
    return parsed if isinstance(parsed, dict) else {}


def serialize_profile(profile: models.StudentProfile | None) -> StudentProfileOut | None:
    if profile is None:
        return None
    return StudentProfileOut(
        id=profile.id,
        goal_id=profile.goal_id,
        strengths=_json_list(profile.strengths_json),
        weaknesses=_json_list(profile.weaknesses_json),
        module_proficiencies=_json_dict(profile.module_proficiencies_json),
        preferred_time_slots=_json_list(profile.preferred_time_slots_json),
        avg_daily_study_minutes=profile.avg_daily_study_minutes,
        learning_style=profile.learning_style,
        last_updated=profile.last_updated,
    )


def recalculate_module(db: Session, module: models.Module) -> None:
    sessions = db.scalars(
        select(models.PracticeSession)
        .where(models.PracticeSession.module_id == module.id)
        .order_by(models.PracticeSession.started_at.desc())
    ).all()
    total_questions = sum(session.question_count for session in sessions)
    total_correct = sum(session.correct_count for session in sessions)
    correct_rate = total_correct / total_questions if total_questions else 0
    recent = sessions[:5]
    consistency = 0.5
    if len(recent) >= 2:
        consistency = max(0, 1 - pstdev([session.accuracy for session in recent]))
    recency = 0
    if sessions:
        days = (datetime.now(UTC).replace(tzinfo=None) - sessions[0].started_at).days
        recency = max(0, 1 - days / 30)

    module.total_questions = total_questions
    module.correct_rate = round(correct_rate, 4)
    module.proficiency = round(correct_rate * 0.6 + consistency * 0.2 + recency * 0.2, 4)


def recalculate_profile(db: Session, goal: models.Goal) -> models.StudentProfile:
    modules = [module for track in goal.tracks for module in track.modules]
    proficiencies = {module.id: module.proficiency for module in modules}
    strengths = [module.name for module in modules if module.proficiency >= 0.7]
    weaknesses = [module.name for module in modules if module.proficiency < 0.4]

    avg_minutes = db.scalar(
        select(func.avg(models.DailyTask.actual_minutes)).where(models.DailyTask.actual_minutes > 0)
    )

    profile = goal.profile
    if profile is None:
        profile = models.StudentProfile(
            id=f"profile_{uuid4().hex}",
            goal_id=goal.id,
            strengths_json="[]",
            weaknesses_json="[]",
            module_proficiencies_json="{}",
            preferred_time_slots_json="[]",
            avg_daily_study_minutes=0,
            learning_style="steady",
            last_updated=datetime.now(UTC).replace(tzinfo=None),
        )
        db.add(profile)

    profile.strengths_json = json.dumps(strengths, ensure_ascii=False)
    profile.weaknesses_json = json.dumps(weaknesses, ensure_ascii=False)
    profile.module_proficiencies_json = json.dumps(proficiencies, ensure_ascii=False)
    profile.avg_daily_study_minutes = int(avg_minutes or 0)
    profile.last_updated = datetime.now(UTC).replace(tzinfo=None)
    return profile
