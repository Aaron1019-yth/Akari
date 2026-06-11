# Phase 1.5 功能收尾 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 补齐 Phase 1 遗留的 5 个功能欠账：会话列表/切换、长历史摘要、文件删除/重命名、Task 编辑/删除端点、测试 DB 隔离。

**Architecture:** 后端新增 session API + 扩展现有 files/planner 端点，前端 sidebar 接真实 session 数据、文件列表加操作按钮、任务行加编辑/删除。历史摘要在 chat_service 层做，对 AgentLoop 透明。

**Tech Stack:** Python/FastAPI/SQLAlchemy + React/TypeScript + SQLite

---

### Task 1: 测试 DB 隔离

**Why first:** 后面的改动都需要写测试，先确保测试不污染开发数据库。

**Files:**
- Modify: `backend/db/database.py:9-10`
- Modify: `tests/test_backend_smoke.py` (add override)
- Create: `tests/conftest.py`

- [ ] **Step 1: 让 DATABASE_URL 可配置**

`backend/db/database.py` 第 9-10 行改为：

```python
import os

DATA_DIR = Path(__file__).resolve().parents[2] / ".akari"
_database_url = os.getenv("AKARI_DATABASE_URL")
if _database_url:
    DATABASE_URL = _database_url
else:
    DATABASE_URL = f"sqlite:///{DATA_DIR / 'akari.db'}"
```

- [ ] **Step 2: 创建 tests/conftest.py，用临时数据库**

```python
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.db.database import SessionLocal, init_database
from backend.main import app


@pytest.fixture
def client():
    """每个测试用独立的临时数据库。"""
    db_dir = Path(tempfile.mkdtemp())
    db_path = db_dir / "test.db"

    from backend.db import database
    database.DATABASE_URL = f"sqlite:///{db_path}"
    database.engine = database.create_engine(database.DATABASE_URL, connect_args={"check_same_thread": False})
    database.SessionLocal = database.sessionmaker(bind=database.engine, autoflush=False, autocommit=False)
    database.DATA_DIR = db_dir
    init_database()

    yield TestClient(app)

    # cleanup
    import shutil
    shutil.rmtree(db_dir, ignore_errors=True)
```

**注意:** `database.py` 需要把 `engine` 和 `SessionLocal` 从模块级常量变成可替换的变量。更简单的做法是用 FastAPI 的 dependency override：

`tests/conftest.py` 替代方案（更干净）：

```python
import tempfile
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.db import models
from backend.db.database import get_db
from backend.main import app


@pytest.fixture
def client():
    db_dir = Path(tempfile.mkdtemp())
    db_path = db_dir / "test.db"
    database_url = f"sqlite:///{db_path}"

    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    models.Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Also override DATA_DIR for files_service
    import backend.services.files_service as fs
    import backend.services.chat_service as cs
    original_data_dir = backend.db.database.DATA_DIR
    backend.db.database.DATA_DIR = db_dir
    fs.FILES_DIR = db_dir / "uploads"
    fs.INDEX_PATH = fs.FILES_DIR / "index.json"
    cs.SESSIONS_DIR = db_dir / "memory" / "sessions"

    yield TestClient(app)

    app.dependency_overrides.clear()
    backend.db.database.DATA_DIR = original_data_dir
    shutil.rmtree(db_dir, ignore_errors=True)
```

- [ ] **Step 3: 验证测试隔离**

```bash
npm run test:api
```

确认测试通过，且 `.akari/akari.db` 没有被测试修改。

---

### Task 2: Task 编辑 + 删除端点

**Files:**
- Modify: `backend/schemas.py` (extend `TaskPatchRequest`)
- Modify: `backend/services/planner_service.py` (add `delete_task`, extend `update_task`)
- Modify: `backend/api/planner.py` (add `DELETE /task/{task_id}`, extend `PATCH`)

- [ ] **Step 1: 扩展 schemas.py 的 TaskPatchRequest**

在 `backend/schemas.py` 找到 `TaskPatchRequest`，增加可选字段：

```python
class TaskPatchRequest(BaseModel):
    status: TaskStatus | None = None
    actual_minutes: int | None = None
    time_slot: TimeSlot | None = None
    sort_order: int | None = None
    # Phase 1.5 新增
    title: str | None = None
    type: TaskType | None = None
    subject: str | None = None
    estimated_minutes: int | None = None
    date: date | None = None
```

- [ ] **Step 2: 扩展 planner_service.update_task 支持新字段**

`backend/services/planner_service.py` 的 `update_task()` 函数，把字段列表扩展：

```python
def update_task(db: Session, task: models.DailyTask, payload: TaskPatchRequest) -> None:
    for field in ("status", "actual_minutes", "time_slot", "sort_order",
                  "title", "type", "subject", "estimated_minutes", "date"):
        value = getattr(payload, field)
        if value is not None:
            setattr(task, field, value)
    db.commit()
```

- [ ] **Step 3: 添加 delete_task 到 planner_service.py**

```python
def delete_task(db: Session, task_id: str) -> None:
    task = db.get(models.DailyTask, task_id)
    if task is None:
        raise ValueError("Task not found")
    db.delete(task)
    db.commit()
```

- [ ] **Step 4: 添加 DELETE 端点和更新 PATCH 到 planner.py**

`backend/api/planner.py` 新增：

```python
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
```

PATCH 端点保持不变，因为 schema 已扩展。

- [ ] **Step 5: 验证**

```bash
npm run test:api
npm run build
```

---

### Task 3: 文件删除 + 重命名

**Files:**
- Modify: `backend/services/files_service.py`
- Modify: `backend/api/files.py`
- Modify: `desktop/src/react/App.tsx` (file list actions)
- Modify: `desktop/src/react/services/api.ts` (new API calls)

- [ ] **Step 1: files_service.py 添加 delete 和 rename**

```python
def delete_file(file_id: str) -> bool:
    items = _read_index()
    match = next((item for item in items if item.get("file_id") == file_id), None)
    if match is None:
        return False
    file_path = Path(match["file_path"])
    if file_path.exists():
        file_path.unlink()
    items.remove(match)
    _write_index(items)
    return True


def rename_file(file_id: str, new_filename: str) -> dict | None:
    items = _read_index()
    match = next((item for item in items if item.get("file_id") == file_id), None)
    if match is None:
        return None
    old_path = Path(match["file_path"])
    new_filename = _safe_filename(new_filename)
    match["filename"] = new_filename
    new_path = old_path.parent / f"{file_id}_{new_filename}"
    if old_path.exists():
        old_path.rename(new_path)
    match["file_path"] = str(new_path)
    _write_index(items)
    return match
```

- [ ] **Step 2: files.py 添加端点**

`backend/api/files.py` 新增：

```python
from pydantic import BaseModel

class RenameRequest(BaseModel):
    filename: str


@router.delete("/{file_id}")
def delete_file(file_id: str) -> dict:
    ok = files_service.delete_file(file_id)
    if not ok:
        raise HTTPException(status_code=404, detail="File not found")
    return {"ok": True}


@router.patch("/{file_id}")
def rename_file(file_id: str, payload: RenameRequest) -> dict:
    result = files_service.rename_file(file_id, payload.filename)
    if result is None:
        raise HTTPException(status_code=404, detail="File not found")
    return result
```

- [ ] **Step 3: api.ts 添加前端调用**

`desktop/src/react/services/api.ts` 的 `api` 对象新增：

```typescript
deleteFile: (fileId: string) =>
  request<{ ok: boolean }>(`/api/files/${fileId}`, { method: "DELETE" }),
renameFile: (fileId: string, filename: string) =>
  request<ConversationFile>(`/api/files/${fileId}`, {
    method: "PATCH",
    body: JSON.stringify({ filename }),
  }),
```

- [ ] **Step 4: App.tsx 文件列表加删除/重命名**

在文件列表的每个 `file-item` 上增加操作按钮。在 `file-panel` 的 `file-list` 中，每个 `file-item` 改为：

```tsx
<div className="file-item" key={file.file_id}>
  <FileText size={17} />
  <span>{file.filename}</span>
  <button
    className="icon-muted"
    aria-label="删除文件"
    onClick={async (e) => {
      e.stopPropagation();
      await api.deleteFile(file.file_id);
      const payload = await api.getFiles();
      setFiles(payload.files);
    }}
  >
    <X size={14} />
  </button>
</div>
```

- [ ] **Step 5: 验证**

```bash
npm run test:api
npm run build
```

---

### Task 4: 会话列表 API + 前端切换

**Files:**
- Modify: `backend/services/chat_service.py` (add `list_sessions`, `get_session`)
- Create: `backend/api/sessions.py`
- Modify: `backend/main.py` (register router)
- Modify: `desktop/src/react/App.tsx` (sidebar)
- Modify: `desktop/src/react/services/api.ts` (new API calls)
- Modify: `desktop/src/react/styles.css` (session list styles)

- [ ] **Step 1: chat_service.py 添加 session 列表/详情函数**

```python
def list_sessions() -> list[dict]:
    """返回所有 session 的元数据列表。"""
    if not SESSIONS_DIR.exists():
        return []
    sessions: list[dict] = []
    for path in sorted(SESSIONS_DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True):
        sid = path.stem
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
            continue
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
    """返回指定 session 的所有消息。"""
    path = session_path(session_id)
    if not path.exists():
        return []
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
```

- [ ] **Step 2: 创建 backend/api/sessions.py**

```python
from fastapi import APIRouter

from backend.services.chat_service import list_sessions, get_session_messages

router = APIRouter()


@router.get("")
def get_sessions() -> dict:
    return {"sessions": list_sessions()}


@router.get("/{session_id}")
def get_session(session_id: str) -> dict:
    return {"session_id": session_id, "messages": get_session_messages(session_id)}
```

- [ ] **Step 3: main.py 注册 sessions router**

`backend/main.py` 在 `from backend.api import ...` 处加 `sessions`，并在 `app.include_router` 处加：

```python
from backend.api import chat, planner, practice, profile, settings, files, sessions

app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
```

- [ ] **Step 4: 前端 api.ts 添加 session 调用**

```typescript
getSessions: () => request<{ sessions: Array<{ session_id: string; message_count: number; last_message_at: string; preview: string }> }>("/api/sessions"),
getSession: (sessionId: string) => request<{ session_id: string; messages: Array<{ role: string; content: string; created_at: string }> }>(`/api/sessions/${sessionId}`),
```

- [ ] **Step 5: App.tsx 左侧栏接真实 session 数据**

添加 state 和 useEffect：

```tsx
const [sessions, setSessions] = useState<Array<{ session_id: string; message_count: number; last_message_at: string; preview: string }>>([]);
const [activeSessionId, setActiveSessionId] = useState("default");

useEffect(() => {
  api.getSessions().then((data) => setSessions(data.sessions)).catch(() => {});
}, [messages.length]); // refresh when messages change
```

替换硬编码的 session 按钮：

```tsx
{sessions.length === 0 ? (
  <div className="sidebar-empty">还没有对话哦</div>
) : (
  sessions.map((s) => (
    <button
      className={`session ${s.session_id === activeSessionId ? "is-active" : ""}`}
      key={s.session_id}
      onClick={() => {
        setActiveSessionId(s.session_id);
        // Load session messages into chat view
        api.getSession(s.session_id).then((data) => {
          setMessages(data.messages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            created_at: m.created_at,
          })));
        }).catch(() => {});
      }}
    >
      <MessageSquareText size={17} />
      <span>
        {s.preview || s.session_id}
        <small>{s.message_count} 条消息</small>
      </span>
    </button>
  ))
)}
```

新建会话按钮：

```tsx
<button aria-label="新建对话" onClick={() => {
  const newId = `session_${Date.now()}`;
  setActiveSessionId(newId);
  setMessages([]);
  setPlanCard(null);
}}>
  <Plus size={17} />
</button>
```

- [ ] **Step 6: WebSocket 传递真实 session_id**

在 `sendChat()` 中，把 `stream.send(content)` 改为 `stream.send(content, activeSessionId)`。

- [ ] **Step 7: 验证**

```bash
npm run build
npm run test:api
```

---

### Task 5: 长历史摘要/压缩

**Files:**
- Modify: `backend/services/chat_service.py` (add `summarize_and_compact`)

- [ ] **Step 1: 实现摘要逻辑**

在 `chat_service.py` 新增：

```python
from backend.services.llm.client import chat as llm_chat


SUMMARY_THRESHOLD_CHARS = 16000  # ~4K tokens
SUMMARY_TARGET_CHARS = 6000      # ~1.5K tokens to keep recent


def maybe_summarize(session_id: str) -> str | None:
    """
    当 session 历史超过阈值时，用 LLM 压缩旧消息为摘要。
    返回摘要文本，或 None（无需压缩时）。
    """
    path = session_path(session_id)
    if not path.exists():
        return None

    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return None

    if len(raw) < SUMMARY_THRESHOLD_CHARS:
        return None

    messages = load_recent_messages(session_id, max_messages=999, max_chars=1_000_000)
    if len(messages) < 10:
        return None

    # 取前一半做摘要
    split = len(messages) // 2
    old_messages = messages[:split]
    recent_messages = messages[split:]

    # 检查是否已有摘要文件
    summary_path = SESSIONS_DIR / f"{_safe_session_id(session_id)}.summary.txt"
    existing_summary = ""
    if summary_path.exists():
        try:
            existing_summary = summary_path.read_text(encoding="utf-8")
        except OSError:
            pass

    summary_prompt = (
        "用中文简要总结以下对话的关键信息，保留：用户目标、计划要点、薄弱模块、已收集的诊断字段。"
        "不超过 300 字。\n\n"
    )
    if existing_summary:
        summary_prompt += f"已有摘要：{existing_summary}\n\n"
    summary_prompt += "\n".join(
        f"{'用户' if m.role == 'user' else '助手'}: {m.content[:300]}"
        for m in old_messages[-20:]  # 只总结最近20条旧消息
    )

    try:
        summary = asyncio_run(
            llm_chat([Message(role="user", content=summary_prompt)])
        )
    except Exception:
        return existing_summary or None

    if summary:
        summary_path.write_text(summary, encoding="utf-8")

    return summary


def asyncio_run(coro):
    import asyncio
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    return loop.run_until_complete(coro)
```

**问题:** `chat_service.py` 是同步代码，但 LLM 调用是 async。需要处理这个。

更简单的方案：不在 chat_service 层做摘要，而是在 AgentLoop.run() 启动时检查并注入摘要。这样可以利用已有的 async 上下文。

在 `backend/services/agent/loop.py` 的 `run()` 方法中，加载历史消息后检查是否需要摘要：

```python
# After load_recent_messages, before building messages list
summary = _load_or_create_summary(session_id, recent)
if summary:
    messages.append(Message(role="system", content=f"## 对话历史摘要\n{summary}"))
```

在 `chat_service.py` 中加：

```python
SUMMARY_PATH_TEMPLATE = str(SESSIONS_DIR / "{session_id}.summary.txt")


def load_summary(session_id: str) -> str | None:
    path = Path(SUMMARY_PATH_TEMPLATE.format(session_id=_safe_session_id(session_id)))
    if path.exists():
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            pass
    return None


def save_summary(session_id: str, summary: str) -> None:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    path = Path(SUMMARY_PATH_TEMPLATE.format(session_id=_safe_session_id(session_id)))
    path.write_text(summary, encoding="utf-8")
```

在 `loop.py` 中加辅助函数：

```python
from backend.services.chat_service import load_summary, save_summary
from backend.services.llm.client import chat

SUMMARY_CHAR_THRESHOLD = 16000


async def _ensure_summary(session_id: str, messages: list[Message]) -> str | None:
    """如果历史太长，生成/更新摘要。"""
    total_chars = sum(len(m.content or "") for m in messages)
    if total_chars < SUMMARY_CHAR_THRESHOLD:
        return load_summary(session_id)

    # 前一半消息做摘要
    split = len(messages) // 2
    old = messages[:split]

    existing = load_summary(session_id) or ""
    prompt = (
        "用中文简要总结以下对话的关键信息，保留：用户目标、计划要点、薄弱模块、已收集的诊断字段。"
        "不超过 300 字。\n\n"
    )
    if existing:
        prompt += f"已有摘要：{existing}\n\n"
    prompt += "\n".join(
        f"{'用户' if m.role == 'user' else '助手'}: {(m.content or '')[:300]}"
        for m in old[-20:]
    )

    try:
        summary = await chat([Message(role="user", content=prompt)])
    except Exception:
        return existing or None

    if summary:
        save_summary(session_id, summary)
    return summary
```

然后在 `AgentLoop.run()` 中，加载历史后：

```python
summary = await _ensure_summary(session_id, recent)
if summary:
    messages.append(Message(role="system", content=f"## 对话历史摘要\n{summary}"))
```

- [ ] **Step 2: 验证**

```bash
npm run build
npm run test:api
```

手动测试：发送足够多的消息后，检查 `.akari/memory/sessions/{id}.summary.txt` 是否生成。

---

### Verification

全部完成后运行：

```bash
npm run build
npm run test:api
```
