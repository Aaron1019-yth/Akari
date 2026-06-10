from __future__ import annotations

import asyncio
import json
import traceback
from datetime import datetime as dt

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.schemas import ChatMessageOut, ChatRequest, ChatResponse
from backend.db.database import SessionLocal
from backend.services.agent.loop import AgentLoop
from backend.services.chat_service import append_message
from backend.services.files_service import list_files
from backend.services.intent import Intent, IntentClassifier, clear_session_state
from backend.services.llm.client import chat
from backend.services.llm.schemas import Message
from backend.services.planner_service import build_plan_card
from backend.services.tools.generate_plan import generate_plan_from_diagnostic

router = APIRouter()


# ── legacy non-streaming POST (keeps smoke test working) ──

@router.post("", response_model=ChatResponse)
async def chat_rest(payload: ChatRequest) -> ChatResponse:
    system_prompt = (
        "你是 Akari，一个公考备考助手。帮用户制定学习计划、跟踪进度、分析薄弱模块。"
        "回复简洁，不要客套。"
    )
    messages = [
        Message(role="system", content=system_prompt),
        Message(role="user", content=payload.message),
    ]
    reply = await chat(messages)
    return ChatResponse(
        session_id=payload.session_id,
        message=ChatMessageOut(role="assistant", content=reply, created_at=dt.now()),
    )


# ── WebSocket streaming ──

@router.websocket("/ws")
async def chat_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    agent = AgentLoop()
    classifier = IntentClassifier()
    abort_event = asyncio.Event()
    current_task: asyncio.Task | None = None

    async def _run(text: str, session_id: str = "default") -> None:
        abort_event.clear()
        try:
            decision = classifier.classify(text, session_id=session_id)
            if decision.intent == Intent.QUERY_PLAN:
                append_message(session_id, "user", text)
                db = SessionLocal()
                try:
                    await websocket.send_json({"type": "plan_card", "card": build_plan_card(db)})
                finally:
                    db.close()
                reply = "我把当前计划放到右侧了。"
                append_message(session_id, "assistant", reply)
                await websocket.send_json({"type": "text_delta", "delta": reply})
                await websocket.send_json({"type": "turn_end", "usage": {}})
                return
            if decision.intent == Intent.PLAN:
                append_message(session_id, "user", text)
                result = generate_plan_from_diagnostic(decision.pending_fields)
                if result.ok:
                    clear_session_state(session_id)
                    card = result.details.get("plan_card")
                    if card:
                        await websocket.send_json({"type": "plan_card", "card": card})
                    reply = _plan_created_reply(decision.pending_fields, result.content)
                    append_message(session_id, "assistant", reply)
                    await websocket.send_json({"type": "text_delta", "delta": reply})
                    await websocket.send_json({"type": "file_list", "files": list_files()})
                    await websocket.send_json({"type": "turn_end", "usage": {}})
                    return
                await websocket.send_json({"type": "error", "message": result.content})
                return

            route_context = _route_context(decision)
            async for event in agent.run(text, session_id=session_id, route_context=route_context, abort_event=abort_event):
                if event.get("type") == "turn_end":
                    await websocket.send_json({"type": "file_list", "files": list_files()})
                await websocket.send_json(event)
        except Exception:
            traceback.print_exc()
            try:
                await websocket.send_json({"type": "error", "message": "Agent 内部错误"})
            except Exception:
                pass

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            t = msg.get("type", "")

            if t == "prompt":
                text = (msg.get("text") or "").strip()
                session_id = (msg.get("session_id") or "default").strip() or "default"
                if not text:
                    await websocket.send_json({"type": "error", "message": "消息为空"})
                    continue
                if current_task and not current_task.done():
                    abort_event.set()
                    current_task.cancel()
                    try:
                        await current_task
                    except asyncio.CancelledError:
                        pass
                current_task = asyncio.create_task(_run(text, session_id=session_id))

            elif t == "abort":
                abort_event.set()
                if current_task and not current_task.done():
                    current_task.cancel()
                    try:
                        await current_task
                    except asyncio.CancelledError:
                        pass
                await websocket.send_json({"type": "turn_end", "usage": {}})

            elif t == "steer":
                pass  # reserved

            else:
                await websocket.send_json({"type": "error", "message": f"Unknown type: {t}"})

    except WebSocketDisconnect:
        abort_event.set()
        if current_task and not current_task.done():
            current_task.cancel()
            try:
                await current_task
            except asyncio.CancelledError:
                pass


def _route_context(decision) -> str:
    if decision.intent != Intent.ASK:
        return ""
    fields = {key: value for key, value in decision.pending_fields.items() if value}
    return (
        "# 对话路由提示\n"
        "用户正在建立备考计划，但信息还不完整。不要直接生成计划。"
        "请先自然回应用户这句话，然后只追问一个最关键的缺失信息。"
        "不要像表单，不要提到 IntentClassifier、路由或内部状态。\n"
        f"- 当前缺失字段: {decision.missing_field}\n"
        f"- 建议追问: {decision.question}\n"
        f"- 已收集字段: {json.dumps(fields, ensure_ascii=False)}"
    )


def _plan_created_reply(fields: dict, tool_summary: str) -> str:
    weak = "、".join(fields.get("weak_modules") or []) or "基础模块"
    hours = fields.get("daily_hours")
    hours_text = f"每天约 {hours} 小时" if hours else "按当前可用时间"
    return (
        f"计划已经生成好了，我放到右侧「我的规划」里了。\n\n"
        f"这版先按{hours_text}来排，重点照顾 {weak}。"
        f"{tool_summary} 接下来你可以先照今天任务跑一轮，觉得太满或太松再告诉我，我会继续调。"
    )
