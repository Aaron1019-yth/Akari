from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

from pydantic import BaseModel, Field, ValidationError
from backend.db import models
from backend.db.database import SessionLocal
from backend.schemas import TaskType, TimeSlot
from backend.services import profile_service
from backend.services.planner_service import TRACKS, build_plan_card, get_active_goal
from backend.services.tools.base import Tool, ToolResult


class GeneratedTask(BaseModel):
    title: str = Field(min_length=1, max_length=40)
    type: TaskType
    subject: str = Field(min_length=1)
    estimated_minutes: int = Field(ge=1, le=360)
    time_slot: TimeSlot
    date: date
    module_id: str | None = None


class GeneratedPlan(BaseModel):
    week_start: date
    tasks: list[GeneratedTask] = Field(min_length=1, max_length=35)


def create_generate_plan_tool() -> Tool:
    return Tool(
        name="generate_plan",
        description="根据已确认用户信息生成每日计划并写入数据库。仅在所有必填信息完整且用户明确要计划后调用。",
        parameters={
            "type": "object",
            "properties": {
                "week_start": {"type": "string", "description": "YYYY-MM-DD"},
                "tasks": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "type": {"type": "string", "enum": ["study", "practice", "review", "mock_exam", "essay"]},
                            "subject": {"type": "string"},
                            "estimated_minutes": {"type": "integer"},
                            "time_slot": {"type": "string", "enum": ["morning", "afternoon", "evening"]},
                            "date": {"type": "string", "description": "YYYY-MM-DD"},
                            "module_id": {"type": "string"},
                        },
                        "required": ["title", "type", "subject", "estimated_minutes", "time_slot", "date"],
                    },
                },
            },
            "required": ["week_start", "tasks"],
        },
        execute=_generate_plan,
    )


def validate_generated_plan(params: dict) -> tuple[GeneratedPlan | None, str | None]:
    try:
        return GeneratedPlan.model_validate(params), None
    except ValidationError as exc:
        return None, "; ".join(f"{'.'.join(str(part) for part in err['loc'])}: {err['msg']}" for err in exc.errors())


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _ensure_goal(db) -> models.Goal:
    goal = get_active_goal(db)
    if goal is not None:
        return goal

    goal = models.Goal(
        id=_id("goal"),
        title="Akari 公考备考计划",
        description="由对话教练生成的第一阶段学习计划。",
        target_score=150,
        current_estimated_score=0,
        exam_date=date.today() + timedelta(days=150),
        created_at=datetime.now(UTC).replace(tzinfo=None),
        status="active",
    )
    db.add(goal)
    for track_index, (track_type, title, target_score, module_names) in enumerate(TRACKS):
        track = models.Track(
            id=_id("track"),
            goal_id=goal.id,
            type=track_type,
            title=title,
            target_score=target_score,
            current_score=0,
            sort_order=track_index,
        )
        db.add(track)
        for module_index, name in enumerate(module_names):
            db.add(models.Module(
                id=_id("module"),
                track_id=track.id,
                name=name,
                sort_order=module_index,
                weight=round(1 / len(module_names), 4),
                correct_rate=0,
                total_questions=0,
                proficiency=0.45,
            ))
    db.flush()
    profile_service.recalculate_profile(db, goal)
    return goal


def _generate_plan(week_start: str, tasks: list[dict]) -> ToolResult:
    plan, error = validate_generated_plan({"week_start": week_start, "tasks": tasks})
    if error or plan is None:
        return ToolResult(content=f"generate_plan 参数校验失败: {error}", ok=False)

    db = SessionLocal()
    try:
        goal = _ensure_goal(db)
        modules = [module for track in goal.tracks for module in track.modules]
        week_end = plan.week_start + timedelta(days=6)
        old_plans = [item for item in goal.weekly_plans if item.week_start == plan.week_start]
        for old in old_plans:
            db.delete(old)
        weekly_plan = models.WeeklyPlan(
            id=_id("week"),
            goal_id=goal.id,
            week_start=plan.week_start,
            week_end=week_end,
            focus_areas_json=json.dumps(sorted({task.subject for task in plan.tasks}), ensure_ascii=False),
            target_correct_rate=0.72,
            summary="由 Akari 对话教练生成的本周计划。",
        )
        db.add(weekly_plan)
        db.flush()
        for index, task in enumerate(plan.tasks):
            module = db.get(models.Module, task.module_id) if task.module_id else None
            if module is None:
                module = next((item for item in modules if item.name == task.subject or item.name in task.subject), None)
            if module is None:
                module = modules[0]
            db.add(models.DailyTask(
                id=_id("task"),
                weekly_plan_id=weekly_plan.id,
                module_id=module.id,
                date=task.date,
                title=task.title,
                type=task.type,
                subject=task.subject,
                question_count=25 if task.type in {"practice", "mock_exam"} else 0,
                estimated_minutes=task.estimated_minutes,
                actual_minutes=0,
                time_slot=task.time_slot,
                status="pending",
                sort_order=index,
            ))
        db.commit()
        card = build_plan_card(db)
        return ToolResult(content=f"已生成 {len(plan.tasks)} 个任务。", details={"plan_card": card})
    except Exception as exc:
        db.rollback()
        return ToolResult(content=f"计划生成失败: {exc}", ok=False)
    finally:
        db.close()


def generate_plan_from_diagnostic(fields: dict) -> ToolResult:
    week_start = _monday(date.today())
    tasks = _tasks_from_diagnostic(fields, week_start)
    return _generate_plan(str(week_start), tasks)


def _monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _tasks_from_diagnostic(fields: dict, week_start: date) -> list[dict]:
    weak_modules = fields.get("weak_modules") or ["资料分析", "言语理解与表达"]
    normalized_weak = [_normalize_subject(item) for item in weak_modules]
    daily_hours = float(fields.get("daily_hours") or 2)
    slots = ["evening"] if daily_hours < 2 else (["afternoon", "evening"] if daily_hours < 4 else ["morning", "afternoon", "evening"])
    minutes = 30 if daily_hours < 2 else (45 if daily_hours < 4 else 60)
    tasks: list[dict] = []
    for offset in range(7):
        day = week_start + timedelta(days=offset)
        primary = normalized_weak[offset % len(normalized_weak)]
        tasks.append({
            "title": f"{primary}专项训练",
            "type": "practice",
            "subject": primary,
            "estimated_minutes": minutes,
            "time_slot": slots[0],
            "date": str(day),
        })
        if len(slots) >= 2:
            review_subject = normalized_weak[(offset + 1) % len(normalized_weak)]
            tasks.append({
                "title": f"{review_subject}错题复盘",
                "type": "review",
                "subject": review_subject,
                "estimated_minutes": max(20, minutes - 15),
                "time_slot": slots[1],
                "date": str(day),
            })
        if len(slots) >= 3 and offset % 2 == 0:
            tasks.append({
                "title": "申论素材积累",
                "type": "study",
                "subject": "申论作文",
                "estimated_minutes": 30,
                "time_slot": slots[2],
                "date": str(day),
            })
    return tasks


def _normalize_subject(subject: str) -> str:
    mapping = {
        "言语理解": "言语理解与表达",
        "申论": "申论作文",
    }
    return mapping.get(str(subject), str(subject))
