from fastapi import APIRouter

from backend.services.chat_service import list_sessions, get_session_messages

router = APIRouter()


@router.get("")
def get_sessions() -> dict:
    return {"sessions": list_sessions()}


@router.get("/{session_id}")
def get_session(session_id: str) -> dict:
    return {"session_id": session_id, "messages": get_session_messages(session_id)}
