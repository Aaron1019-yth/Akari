from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select

from backend.db.database import SessionLocal
from backend.db.models import DailyTask, Goal, Module
from backend.schemas import TaskCreateRequest, TaskPatchRequest
from backend.services.planner_service import (
    build_goal_tree, get_active_goal, create_task as svc_create_task, update_task as svc_update_task,
)
from backend.services.tools.base import Tool, ToolResult


def _db():
    return SessionLocal()


def _format(task: DailyTask) -> str:
    slot = {"morning": "上午", "afternoon": "下午", "evening": "晚上"}.get(task.time_slot, task.time_slot)
    status = {"pending": "待开始", "in_progress": "进行中", "completed": "已完成", "skipped": "已跳过"}.get(task.status, task.status)
    actual = f" 实际{task.actual_minutes}分钟" if task.actual_minutes else ""
    return f"- [{status}] {task.title} ({slot} 预计{task.estimated_minutes}分钟{actual}) [{task.id}]"


def create_planner_tools() -> list[Tool]:
    return [
        Tool(
            name="get_planner_context",
            description="获取当前备考全局上下文：目标、考试日期、剩余天数、科目、薄弱模块、本周进度。WHEN 用户问整体进度、备考状态、复习规划。",
            parameters={"type": "object", "properties": {}, "required": []},
            execute=_get_planner_context,
        ),
        Tool(
            name="get_today_tasks",
            description="获取今日/指定日期任务列表，含完成状态和实际用时。WHEN 用户问今天学了什么、还有什么任务。",
            parameters={
                "type": "object",
                "properties": {"date": {"type": "string", "description": "YYYY-MM-DD，默认今天"}},
                "required": [],
            },
            execute=lambda date=None: _get_today_tasks(date),
        ),
        Tool(
            name="get_week_tasks",
            description="获取本周任务，按天分组。WHEN 用户问本周安排、周进度。",
            parameters={
                "type": "object",
                "properties": {"week_start": {"type": "string", "description": "周一日期 YYYY-MM-DD"}},
                "required": ["week_start"],
            },
            execute=lambda week_start: _get_week_tasks(week_start),
        ),
        Tool(
            name="create_task",
            description="在当前计划中创建新任务。WHEN 用户说加任务、明天想学xxx、帮我安排。创建前先检查该时段是否已有任务。",
            parameters={
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "任务标题，≤15字"},
                    "date": {"type": "string", "description": "YYYY-MM-DD"},
                    "time_slot": {"type": "string", "enum": ["morning", "afternoon", "evening"]},
                    "subject": {"type": "string", "description": "科目"},
                    "estimated_minutes": {"type": "integer", "description": "预计分钟，默认60"},
                },
                "required": ["title", "date"],
            },
            execute=lambda title, date, time_slot="morning", subject="综合", estimated_minutes=60:
                _create_task(title, date, time_slot, subject, estimated_minutes),
        ),
        Tool(
            name="update_task",
            description="更新任务状态/实际用时/时段。WHEN 用户说完成/跳过/改用时/调整时段。需要 task_id。",
            parameters={
                "type": "object",
                "properties": {
                    "task_id": {"type": "string", "description": "任务ID，从中括号 [id] 获取"},
                    "status": {"type": "string", "enum": ["pending", "in_progress", "completed", "skipped"]},
                    "actual_minutes": {"type": "integer", "description": "实际用时（分钟）"},
                    "time_slot": {"type": "string", "enum": ["morning", "afternoon", "evening"]},
                },
                "required": ["task_id"],
            },
            execute=lambda task_id, status=None, actual_minutes=None, time_slot=None:
                _update_task(task_id, status, actual_minutes, time_slot),
        ),
        Tool(
            name="get_module_stats",
            description="获取各模块正确率/熟练度/题目数统计。WHEN 用户问哪个模块弱、正确率、薄弱项。",
            parameters={"type": "object", "properties": {}, "required": []},
            execute=_get_module_stats,
        ),
    ]


def _get_planner_context() -> ToolResult:
    db = _db()
    try:
        goal = get_active_goal(db)
        if goal is None:
            return ToolResult(content="当前没有活跃的备考目标。引导用户生成第一周计划。", details={"goal": None})
        tree = build_goal_tree(db, goal)
        tasks = tree.weekly_plan.tasks if tree.weekly_plan else []
        completed = sum(1 for t in tasks if t.status == "completed")
        total = len(tasks)
        days_left = max(0, (goal.exam_date - date.today()).days)
        weak = [m for t in tree.tracks for m in t.modules if m.correct_rate < 0.6]
        weak_str = ", ".join(f"{m.name}({m.correct_rate:.0%})" for m in weak) if weak else "无"
        content = (
            f"当前备考状态:\n"
            f"目标: {goal.title} | 目标分数: {goal.target_score}分 | 考试: {goal.exam_date} | 剩余 {days_left} 天\n"
            f"本周: {completed}/{total} 完成 ({round(completed/max(total,1)*100)}%)\n"
            f"薄弱模块: {weak_str}"
        )
        return ToolResult(content=content, details={"goal_id": goal.id, "days_left": days_left})
    finally:
        db.close()


def _get_today_tasks(query_date: str | None = None) -> ToolResult:
    db = _db()
    try:
        day = date.fromisoformat(query_date) if query_date else date.today()
        tasks = db.scalars(
            select(DailyTask).where(DailyTask.date == day).order_by(DailyTask.time_slot, DailyTask.sort_order)
        ).all()
        if not tasks:
            return ToolResult(content=f"{day} 暂无任务。", details={"date": str(day), "tasks": []})
        lines = [f"{day} 任务（共{len(tasks)}项）:"]
        for t in tasks:
            lines.append(_format(t))
        return ToolResult(content="\n".join(lines), details={"date": str(day), "tasks": [t.id for t in tasks]})
    finally:
        db.close()


def _get_week_tasks(week_start: str) -> ToolResult:
    db = _db()
    try:
        start = date.fromisoformat(week_start)
        end = start + timedelta(days=6)
        tasks = db.scalars(
            select(DailyTask).where(DailyTask.date >= start, DailyTask.date <= end).order_by(DailyTask.date, DailyTask.time_slot, DailyTask.sort_order)
        ).all()
        if not tasks:
            return ToolResult(content=f"{week_start} 周暂无任务。", details={"week_start": week_start, "tasks": []})
        by_day: dict[str, list[DailyTask]] = {}
        for t in tasks:
            by_day.setdefault(str(t.date), []).append(t)
        lines = [f"{week_start} ~ {end} 周任务:"]
        for day_str, day_tasks in by_day.items():
            lines.append(f"\n{day_str}:")
            for t in day_tasks:
                lines.append(_format(t))
        return ToolResult(content="\n".join(lines), details={"week_start": week_start})
    finally:
        db.close()


def _create_task(title: str, task_date: str, time_slot: str, subject: str, estimated_minutes: int) -> ToolResult:
    db = _db()
    try:
        goal = get_active_goal(db)
        if goal is None:
            return ToolResult(content="没有活跃的备考目标，无法创建任务。请先生成计划。", ok=False)
        payload = TaskCreateRequest(
            title=title[:15], type="practice", subject=subject,
            estimated_minutes=estimated_minutes, time_slot=time_slot,
            date=date.fromisoformat(task_date), question_count=0,
        )
        task = svc_create_task(db, goal, payload)
        return ToolResult(content=f"已创建: {task.title} ({task.date} {task.time_slot}) [{task.id}]", details={"task_id": task.id})
    except Exception as exc:
        return ToolResult(content=f"创建失败: {exc}", ok=False)
    finally:
        db.close()


def _update_task(task_id: str, status: str | None = None, actual_minutes: int | None = None, time_slot: str | None = None) -> ToolResult:
    db = _db()
    try:
        task = db.scalar(select(DailyTask).where(DailyTask.id == task_id))
        if task is None:
            return ToolResult(content=f"任务 {task_id} 未找到。", ok=False)
        payload = TaskPatchRequest(status=status, actual_minutes=actual_minutes, time_slot=time_slot)
        svc_update_task(db, task, payload)
        return ToolResult(content=f"已更新: {task.title} (状态:{task.status}) [{task.id}]", details={"task_id": task.id, "status": task.status})
    except Exception as exc:
        return ToolResult(content=f"更新失败: {exc}", ok=False)
    finally:
        db.close()


def _get_module_stats() -> ToolResult:
    db = _db()
    try:
        goal = get_active_goal(db)
        if goal is None:
            return ToolResult(content="无活跃目标。", details={"modules": []})
        modules = [m for track in goal.tracks for m in track.modules]
        if not modules:
            return ToolResult(content="暂无模块数据。", details={"modules": []})
        lines = ["模块统计:"]
        for m in sorted(modules, key=lambda x: x.correct_rate):
            icon = "🟢" if m.correct_rate >= 0.7 else ("🟡" if m.correct_rate >= 0.5 else "🔴")
            lines.append(f"  {icon} {m.name}: 正确率{m.correct_rate:.0%} | 熟练度{m.proficiency:.0%} | {m.total_questions}题")
        return ToolResult(content="\n".join(lines), details={"modules": [{"name": m.name, "correct_rate": m.correct_rate} for m in modules]})
    finally:
        db.close()
