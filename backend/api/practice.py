from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.db.database import get_db
from backend.schemas import ErrorBatchRequest, ErrorBatchResponse, PracticeSessionRequest, PracticeSessionResponse
from backend.services import practice_service

router = APIRouter()


@router.post("/practice/session", response_model=PracticeSessionResponse)
def create_practice_session(payload: PracticeSessionRequest, db: Session = Depends(get_db)) -> PracticeSessionResponse:
    try:
        return practice_service.create_practice_session(db, payload)
    except practice_service.PracticeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/errors/batch", response_model=ErrorBatchResponse)
def create_error_batch(payload: ErrorBatchRequest, db: Session = Depends(get_db)) -> ErrorBatchResponse:
    try:
        return practice_service.create_error_batch(db, payload)
    except practice_service.PracticeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
