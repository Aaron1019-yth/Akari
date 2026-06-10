from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from backend.services.agent.context import build_system_prompt
from backend.services.chat_service import append_message, load_recent_messages, load_summary, save_summary, session_path
from backend.services.files_service import list_files
from backend.services.llm.client import chat, chat_stream
from backend.services.llm.schemas import Message, ToolCall
from backend.services.tools.document import create_document_tools
from backend.services.tools.generate_plan import create_generate_plan_tool, validate_generated_plan
from backend.services.tools.planner import create_planner_tools
from backend.services.tools.registry import ToolRegistry
from backend.services.tools.web import create_web_tools

MAX_ROUNDS = 8
SUMMARY_CHAR_THRESHOLD = 64000


def _should_summarize(session_id: str) -> bool:
    path = session_path(session_id)
    try:
        return path.exists() and path.stat().st_size > SUMMARY_CHAR_THRESHOLD
    except OSError:
        return False


def _fire_summary(session_id: str) -> None:
    if _should_summarize(session_id):
        asyncio.create_task(_generate_summary_in_background(session_id))


async def _generate_summary_in_background(session_id: str) -> None:
    """Fire-and-forget: summarize older messages for the next turn. Never raises."""
    try:
        messages = load_recent_messages(session_id, max_messages=999, max_chars=1_000_000)
        if not messages:
            return
        split = len(messages) // 2
        old = messages[:split]
        if len(old) < 5:
            return

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
        summary = await chat([Message(role="user", content=prompt)])
        if summary:
            save_summary(session_id, summary)
    except Exception:
        pass  # Background task must never crash


class AgentLoop:
    def __init__(self) -> None:
        self._tools = ToolRegistry()
        for t in [*create_planner_tools(), *create_web_tools(), *create_document_tools(), create_generate_plan_tool()]:
            self._tools.register(t)

    async def run(self, user_message: str, *,
                  session_id: str = "default",
                  route_context: str = "",
                  abort_event: asyncio.Event | None = None) -> AsyncIterator[dict[str, Any]]:
        """
        Yield WebSocket event dicts:
          {"type": "text_delta", "delta": "..."}
          {"type": "tool_start", "name": str, "arguments": dict}
          {"type": "tool_end", "name": str, "ok": bool, "summary": str}
          {"type": "turn_end", "usage": {"prompt_tokens": int, "completion_tokens": int, "total_tokens": int}}
          {"type": "error", "message": str}
        """
        if abort_event is None:
            abort_event = asyncio.Event()

        append_message(session_id, "user", user_message)
        messages: list[Message] = [Message(role="system", content=build_system_prompt())]
        recent = load_recent_messages(session_id)
        if recent:
            messages.extend(recent[:-1])

        # Always inject existing summary (fast path — no LLM call)
        existing_summary = load_summary(session_id)
        if existing_summary:
            messages.append(Message(role="system", content=f"## 对话历史摘要\n{existing_summary}"))

        file_context = _build_file_context()
        if file_context:
            messages.append(Message(role="system", content=file_context))
        if route_context:
            messages.append(Message(role="system", content=route_context))
        messages.append(Message(role="user", content=user_message))
        schemas = self._tools.schemas()
        last_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        visible_reply_parts: list[str] = []

        for _round in range(MAX_ROUNDS):
            if abort_event.is_set():
                yield {"type": "error", "message": "已中断"}
                return

            text_parts: list[str] = []
            tool_calls: list[ToolCall] = []

            try:
                stream = chat_stream(messages, schemas)
            except Exception as exc:
                yield {"type": "error", "message": f"LLM 调用失败: {exc}"}
                return

            try:
                async for chunk in stream:
                    if abort_event.is_set():
                        yield {"type": "error", "message": "已中断"}
                        return

                    if chunk["type"] == "text_delta":
                        text_parts.append(chunk["delta"])
                        visible_reply_parts.append(chunk["delta"])
                        yield {"type": "text_delta", "delta": chunk["delta"]}

                    elif chunk["type"] == "tool_call":
                        tool_calls.append(chunk["call"])

                    elif chunk["type"] == "done":
                        last_usage = {
                            "prompt_tokens": chunk["usage"].prompt_tokens,
                            "completion_tokens": chunk["usage"].completion_tokens,
                            "total_tokens": chunk["usage"].total_tokens,
                        }
            except Exception as exc:
                yield {"type": "error", "message": f"LLM 调用失败: {exc}"}
                return

            if not tool_calls:
                append_message(session_id, "assistant", "".join(visible_reply_parts))
                yield {"type": "turn_end", "usage": last_usage}
                _fire_summary(session_id)
                return

            messages.append(Message(role="assistant", content="".join(text_parts) or "", tool_calls=tool_calls))

            for tc in tool_calls:
                if abort_event.is_set():
                    return

                yield {"type": "tool_start", "name": tc.name, "arguments": tc.arguments}
                if tc.name == "generate_plan":
                    _, validation_error = validate_generated_plan(tc.arguments)
                    if validation_error:
                        content = f"generate_plan 调用失败：{validation_error}。请修正后重新调用。"
                        yield {"type": "tool_end", "name": tc.name, "ok": False, "summary": content[:200]}
                        messages.append(Message(role="tool", content=content, tool_call_id=tc.id, name=tc.name))
                        continue
                result = await self._tools.execute(tc.name, tc.arguments)
                yield {"type": "tool_end", "name": tc.name, "ok": result.ok, "summary": result.content[:200]}
                if tc.name == "generate_plan" and result.ok and result.details.get("plan_card"):
                    yield {"type": "plan_card", "card": result.details["plan_card"]}
                messages.append(Message(role="tool", content=result.content, tool_call_id=tc.id, name=tc.name))

        append_message(session_id, "assistant", "".join(visible_reply_parts))
        yield {"type": "turn_end", "usage": last_usage}
        _fire_summary(session_id)


def _build_file_context() -> str:
    files = list_files()[:8]
    if not files:
        return ""
    lines = ["# 当前会话文件", "用户上传或会话生成的文件如下。需要读取内容时调用 read_document，并使用 file_path。"]
    for item in files:
        lines.append(f"- {item.get('filename')} | file_id={item.get('file_id')} | file_path={item.get('file_path')}")
    return "\n".join(lines)
