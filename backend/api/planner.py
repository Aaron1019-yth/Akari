from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.db import models
from backend.services import planner_service
from backend.schemas import (
    GoalTree,
    GeneratePlanRequest,
    TaskCreateRequest,
    TaskPatchRequest,
    TodayTasksResponse,
)

router = APIRouter()


@router.get("/goal", response_model=GoalTree | None)
def get_goal(db: Session = Depends(get_db)) -> GoalTree | None:
    goal = planner_service.get_active_goal(db)
    if goal is None:
        return None
    return planner_service.build_goal_tree(db, goal)


@router.post("/generate", response_model=GoalTree)
def generate_plan(payload: GeneratePlanRequest, db: Session = Depends(get_db)) -> GoalTree:
    return planner_service.generate_initial_plan(db, payload)


@router.get("/today", response_model=TodayTasksResponse)
def get_today(db: Session = Depends(get_db)) -> TodayTasksResponse:
    tasks = planner_service.get_tasks_for_date(db, date.today())
    return TodayTasksResponse(date=date.today(), tasks=tasks)


@router.patch("/task/{task_id}", response_model=GoalTree)
def patch_task(task_id: str, payload: TaskPatchRequest, db: Session = Depends(get_db)) -> GoalTree:
    task = db.get(models.DailyTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    planner_service.update_task(db, task, payload)
    goal = planner_service.get_active_goal(db)
    if goal is None:
        raise HTTPException(status_code=404, detail="Active goal not found")
    return planner_service.build_goal_tree(db, goal)


@router.post("/task", response_model=GoalTree)
def create_task(payload: TaskCreateRequest, db: Session = Depends(get_db)) -> GoalTree:
    goal = planner_service.get_active_goal(db)
    if goal is None:
        raise HTTPException(status_code=404, detail="Active goal not found")
    planner_service.create_task(db, goal, payload)
    return planner_service.build_goal_tree(db, goal)


@router.delete("/task/{task_id}", response_model=GoalTree)
def delete_task(task_id: str, db: Session = Depends(get_db)) -> GoalTree:
    try:
        planner_service.delete_task(db, task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    goal = planner_service.get_active_goal(db)
    if goal is None:
        raise HTTPException(status_code=404, detail="Active goal not found")
    return planner_service.build_goal_tree(db, goal)


@router.post("/adapt", response_model=GoalTree)
def adapt_plan(db: Session = Depends(get_db)) -> GoalTree:
    goal = planner_service.get_active_goal(db)
    if goal is None:
        raise HTTPException(status_code=404, detail="Active goal not found")
    planner_service.adapt_next_week(db, goal)
    return planner_service.build_goal_tree(db, goal)
