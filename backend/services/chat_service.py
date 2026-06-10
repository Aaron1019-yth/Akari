import json
from datetime import UTC, datetime
from pathlib import Path

from backend.schemas import ChatMessageOut, ChatRequest, ChatResponse
from backend.services.llm.schemas import Message

SESSIONS_DIR = Path(__file__).resolve().parents[2] / ".akari" / "memory" / "sessions"


def _safe_session_id(session_id: str) -> str:
    return "".join(char for char in session_id if char.isalnum() or char in ("-", "_")) or "default"


def session_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{_safe_session_id(session_id)}.jsonl"


def _read_messages(path: Path) -> list[dict]:
    """Read all user/assistant messages from a JSONL session file."""
    messages: list[dict] = []
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if item.get("role") in {"user", "assistant"} and item.get("content"):
                messages.append(item)
    except OSError:
        return []
    return messages


def append_message(session_id: str, role: str, content: str, created_at: datetime | None = None) -> None:
    if not content.strip():
        return
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    path = session_path(session_id)
    payload = {
        "role": role,
        "content": content,
        "created_at": (created_at or datetime.now(UTC).replace(tzinfo=None)).isoformat(),
    }
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(payload, ensure_ascii=False) + "\n")


def load_recent_messages(session_id: str, *, max_messages: int = 18, max_chars: int = 12000) -> list[Message]:
    path = session_path(session_id)
    rows = _read_messages(path)
    if not rows:
        return []

    selected: list[dict] = []
    total = 0
    for item in reversed(rows[-max_messages:]):
        content = str(item.get("content") or "")
        if total + len(content) > max_chars and selected:
            break
        selected.append(item)
        total += len(content)
    selected.reverse()
    return [Message(role=item["role"], content=str(item["content"])) for item in selected]


def _summary_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{_safe_session_id(session_id)}.summary.txt"


def load_summary(session_id: str) -> str | None:
    path = _summary_path(session_id)
    if path.exists():
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            pass
    return None


def save_summary(session_id: str, summary: str) -> None:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    _summary_path(session_id).write_text(summary, encoding="utf-8")


def list_sessions() -> list[dict]:
    """Return metadata for all session files, newest first."""
    if not SESSIONS_DIR.exists():
        return []
    sessions: list[dict] = []
    for path in sorted(SESSIONS_DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True):
        sid = path.stem
        messages = _read_messages(path)
        if not messages:
            continue
        first_user = next((m for m in messages if m["role"] == "user"), None)
        preview = (first_user["content"] if first_user else "")[:60]
        sessions.append({
            "session_id": sid,
            "message_count": len(messages),
            "last_message_at": messages[-1].get("created_at", ""),
            "preview": preview,
        })
    return sessions


def get_session_messages(session_id: str) -> list[dict]:
    """Return all messages for a session."""
    return _read_messages(session_path(session_id))


def reply(payload: ChatRequest) -> ChatResponse:
    now = datetime.now(UTC).replace(tzinfo=None)
    append_message(payload.session_id, "user", payload.message, now)

    content = (
        "我已经收到。当前 MVP 先把对话写入本地会话记录，后续会接入答疑官 Agent 和 DeepSeek。"
        f"\n\n你刚才说：{payload.message}"
    )
    assistant_time = datetime.now(UTC).replace(tzinfo=None)
    append_message(payload.session_id, "assistant", content, assistant_time)

    return ChatResponse(
        session_id=payload.session_id,
        message=ChatMessageOut(role="assistant", content=content, created_at=assistant_time),
    )
