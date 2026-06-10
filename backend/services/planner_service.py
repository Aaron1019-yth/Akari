import json
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import models
from backend.schemas import (
    DailyTaskOut,
    GeneratePlanRequest,
    GoalTree,
    ModuleOut,
    StudentProfileOut,
    TaskCreateRequest,
    TaskPatchRequest,
    TrackOut,
    WeeklyPlanOut,
)
from backend.services import profile_service


TRACKS = [
    ("xingce", "行测", 100, ["言语理解与表达", "资料分析", "判断推理", "数量关系", "常识判断"]),
    ("shenlun", "申论", 50, ["归纳概括", "综合分析", "提出对策", "贯彻执行", "申论作文"]),
    ("interview", "面试", 0, ["结构化表达", "政策理解", "现场应变"]),
]


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def get_active_goal(db: Session) -> models.Goal | None:
    return db.scalar(select(models.Goal).where(models.Goal.status == "active").limit(1))


def _week_bounds(day: date) -> tuple[date, date]:
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=6)


def _serialize_weekly_plan(plan: models.WeeklyPlan | None) -> WeeklyPlanOut | None:
    if plan is None:
        return None
    tasks = sorted(plan.tasks, key=lambda task: (task.date, task.time_slot, task.sort_order))
    return WeeklyPlanOut(
        id=plan.id,
        goal_id=plan.goal_id,
        week_start=plan.week_start,
        week_end=plan.week_end,
        focus_areas=json.loads(plan.focus_areas_json or "[]"),
        target_correct_rate=plan.target_correct_rate,
        summary=plan.summary,
        tasks=[DailyTaskOut.model_validate(task) for task in tasks],
    )


def build_plan_card(db: Session) -> dict:
    goal = get_active_goal(db)
    if goal is None:
        return {
            "has_plan": False,
            "title": "暂无计划",
            "message": "告诉我你的目标，我来帮你制定第一周计划。",
            "tasks_today": [],
            "completion_rate": 0,
        }
    tree = build_goal_tree(db, goal)
    plan = tree.weekly_plan
    if plan is None:
        return {
            "has_plan": False,
            "title": goal.title,
            "message": "当前目标还没有本周计划。",
            "tasks_today": [],
            "completion_rate": 0,
        }
    today = date.today()
    tasks = plan.tasks
    completed = sum(1 for task in tasks if task.status == "completed")
    today_tasks = [task.model_dump(mode="json") for task in tasks if task.date == today]
    return {
        "has_plan": True,
        "title": goal.title,
        "week_start": str(plan.week_start),
        "week_end": str(plan.week_end),
        "completed_count": completed,
        "total_count": len(tasks),
        "completion_rate": round(completed / max(len(tasks), 1) * 100),
        "tasks_today": today_tasks,
    }


def build_goal_tree(db: Session, goal: models.Goal) -> GoalTree:
    week_start, week_end = _week_bounds(date.today())
    weekly_plan = db.scalar(
        select(models.WeeklyPlan)
        .where(
            models.WeeklyPlan.goal_id == goal.id,
            models.WeeklyPlan.week_start <= week_start,
            models.WeeklyPlan.week_end >= week_end,
        )
        .limit(1)
    )
    tracks = sorted(goal.tracks, key=lambda track: track.sort_order)
    return GoalTree(
        id=goal.id,
        title=goal.title,
        description=goal.description,
        target_score=goal.target_score,
        current_estimated_score=goal.current_estimated_score,
        exam_date=goal.exam_date,
        created_at=goal.created_at,
        status=goal.status,
        tracks=[
            TrackOut(
                **TrackOut.model_validate(track).model_dump(exclude={"modules"}),
                modules=[ModuleOut.model_validate(module) for module in sorted(track.modules, key=lambda item: item.sort_order)],
            )
            for track in tracks
        ],
        weekly_plan=_serialize_weekly_plan(weekly_plan),
        profile=profile_service.serialize_profile(goal.profile),
    )


def generate_initial_plan(db: Session, payload: GeneratePlanRequest) -> GoalTree:
    existing = get_active_goal(db)
    if existing is not None:
        existing.status = "archived"

    goal = models.Goal(
        id=_id("goal"),
        title="Akari 公考备考计划",
        description="以行测和申论为主线的第一阶段学习计划。",
        target_score=payload.target_score,
        current_estimated_score=0,
        exam_date=payload.exam_date,
        created_at=datetime.now(UTC).replace(tzinfo=None),
        status="active",
    )
    db.add(goal)

    module_by_name: dict[str, models.Module] = {}
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
            module = models.Module(
                id=_id("module"),
                track_id=track.id,
                name=name,
                sort_order=module_index,
                weight=round(1 / len(module_names), 4),
                correct_rate=0,
                total_questions=0,
                proficiency=0.35 if name in payload.weaknesses else 0.55,
            )
            db.add(module)
            module_by_name[name] = module

    week_start, week_end = _week_bounds(date.today())
    focus = payload.weaknesses or ["资料分析", "言语理解与表达"]
    weekly_plan = models.WeeklyPlan(
        id=_id("week"),
        goal_id=goal.id,
        week_start=week_start,
        week_end=week_end,
        focus_areas_json=json.dumps(focus, ensure_ascii=False),
        target_correct_rate=0.72,
        summary="第一周先建立节奏：每天一组行测练习，穿插申论素材和复盘。",
    )
    db.add(weekly_plan)
    db.flush()

    primary_modules = [module_by_name.get(name) for name in focus if module_by_name.get(name)]
    fallback_modules = [module_by_name["资料分析"], module_by_name["言语理解与表达"], module_by_name["判断推理"]]
    plan_modules = primary_modules or fallback_modules
    slots = ["morning", "afternoon", "evening"]
    for offset in range(7):
        module = plan_modules[offset % len(plan_modules)]
        db.add(
            models.DailyTask(
                id=_id("task"),
                weekly_plan_id=weekly_plan.id,
                module_id=module.id,
                date=week_start + timedelta(days=offset),
                title=f"{module.name}专项训练",
                type="practice",
                subject=module.name,
                question_count=25 if module.name != "申论作文" else 1,
                estimated_minutes=35 if module.name != "申论作文" else 60,
                actual_minutes=0,
                time_slot=slots[offset % len(slots)],
                status="pending",
                sort_order=offset,
            )
        )

    profile = profile_service.recalculate_profile(db, goal)
    profile.strengths_json = json.dumps(payload.strengths, ensure_ascii=False)
    profile.weaknesses_json = json.dumps(payload.weaknesses, ensure_ascii=False)
    db.commit()
    db.refresh(goal)
    return build_goal_tree(db, goal)


def get_tasks_for_date(db: Session, day: date) -> list[models.DailyTask]:
    return db.scalars(select(models.DailyTask).where(models.DailyTask.date == day).order_by(models.DailyTask.time_slot, models.DailyTask.sort_order)).all()


def update_task(db: Session, task: models.DailyTask, payload: TaskPatchRequest) -> None:
    for field in ("status", "actual_minutes", "time_slot", "sort_order",
                  "title", "type", "subject", "estimated_minutes", "date"):
        value = getattr(payload, field)
        if value is not None:
            setattr(task, field, value)
    db.commit()


def delete_task(db: Session, task_id: str) -> None:
    task = db.get(models.DailyTask, task_id)
    if task is None:
        raise ValueError("Task not found")
    db.delete(task)
    db.commit()


def create_task(db: Session, goal: models.Goal, payload: TaskCreateRequest) -> models.DailyTask:
    week_start, week_end = _week_bounds(payload.date or date.today())
    weekly_plan = db.scalar(
        select(models.WeeklyPlan)
        .where(
            models.WeeklyPlan.goal_id == goal.id,
            models.WeeklyPlan.week_start <= week_start,
            models.WeeklyPlan.week_end >= week_end,
        )
        .limit(1)
    )
    if weekly_plan is None:
        weekly_plan = models.WeeklyPlan(
            id=_id("week"),
            goal_id=goal.id,
            week_start=week_start,
            week_end=week_end,
            focus_areas_json="[]",
            target_correct_rate=0.72,
            summary="手动添加的本周计划。",
        )
        db.add(weekly_plan)
        db.flush()

    modules = [module for track in goal.tracks for module in track.modules]
    module = None
    if payload.module_id:
        module = db.get(models.Module, payload.module_id)
    if module is None:
        module = next((item for item in modules if item.name == payload.subject), None)
    if module is None:
        module = modules[0]

    max_order = max((task.sort_order for task in weekly_plan.tasks if task.date == (payload.date or date.today())), default=-1)
    task = models.DailyTask(
        id=_id("task"),
        weekly_plan_id=weekly_plan.id,
        module_id=module.id,
        date=payload.date or date.today(),
        title=payload.title,
        type=payload.type,
        subject=payload.subject,
        question_count=payload.question_count,
        estimated_minutes=payload.estimated_minutes,
        actual_minutes=0,
        time_slot=payload.time_slot,
        status="pending",
        sort_order=max_order + 1,
    )
    db.add(task)
    db.commit()
    return task


def adapt_next_week(db: Session, goal: models.Goal) -> None:
    next_start, next_end = _week_bounds(date.today() + timedelta(days=7))
    weak_modules = [module for track in goal.tracks for module in track.modules if module.correct_rate < 0.72]
    focus_modules = weak_modules[:3] or [module for track in goal.tracks for module in track.modules][:3]
    plan = models.WeeklyPlan(
        id=_id("week"),
        goal_id=goal.id,
        week_start=next_start,
        week_end=next_end,
        focus_areas_json=json.dumps([module.name for module in focus_modules], ensure_ascii=False),
        target_correct_rate=0.74,
        summary="根据最近表现自动增加薄弱模块任务密度。",
    )
    db.add(plan)
    db.flush()
    for offset in range(7):
        module = focus_modules[offset % len(focus_modules)]
        db.add(
            models.DailyTask(
                id=_id("task"),
                weekly_plan_id=plan.id,
                module_id=module.id,
                date=next_start + timedelta(days=offset),
                title=f"{module.name}巩固训练",
                type="practice",
                subject=module.name,
                question_count=30,
                estimated_minutes=40,
                actual_minutes=0,
                time_slot=["morning", "afternoon", "evening"][offset % 3],
                status="pending",
                sort_order=offset,
            )
        )
    db.commit()
