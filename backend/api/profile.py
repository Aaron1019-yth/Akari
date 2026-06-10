from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.schemas import StudentProfileOut
from backend.services import planner_service

router = APIRouter()


@router.get("", response_model=StudentProfileOut)
def get_profile(db: Session = Depends(get_db)) -> StudentProfileOut:
    goal = planner_service.get_active_goal(db)
    if goal is None or goal.profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return goal.profile
