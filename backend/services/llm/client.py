from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from backend.services.llm.schemas import Message, ToolCall, TokenUsage
from backend.services.settings_service import get_settings


def _get_config() -> tuple[str, str, str]:
    s = get_settings()
    return s.base_url, s.api_key, s.model


def _body(messages: list[Message], tools: list[dict] | None, *, model: str, **kw: Any) -> dict[str, Any]:
    b: dict[str, Any] = {
        "model": model,
        "messages": [_msg_to_dict(m) for m in messages],
        **kw,
    }
    if tools:
        b["tools"] = [{"type": "function", "function": t} for t in tools]
        b["tool_choice"] = kw.get("tool_choice", "auto")
    return b


def _msg_to_dict(m: Message) -> dict[str, Any]:
    d: dict[str, Any] = {"role": m.role}
    if m.content is not None:
        d["content"] = m.content
    if m.tool_calls:
        d["tool_calls"] = [
            {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.name,
                    "arguments": json.dumps(tc.arguments, ensure_ascii=False),
                },
            }
            for tc in m.tool_calls
        ]
    if m.tool_call_id:
        d["tool_call_id"] = m.tool_call_id
    if m.name:
        d["name"] = m.name
    return d


async def chat(messages: list[Message], tools: list[dict] | None = None,
               temperature: float = 0.7, max_tokens: int = 4096) -> str:
    """Non-streaming chat → return assistant text."""
    base_url, api_key, model = _get_config()
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=_body(messages, tools, model=model, temperature=temperature, max_tokens=max_tokens),
        )
        r.raise_for_status()
        data = r.json()
    return data["choices"][0]["message"].get("content") or ""


async def chat_stream(
    messages: list[Message],
    tools: list[dict] | None = None,
    *,
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> AsyncIterator[dict[str, Any]]:
    """
    Streaming chat → yield:
      {"type": "text_delta", "delta": "..."}
      {"type": "tool_call", "call": ToolCall}
      {"type": "done", "usage": TokenUsage}
    """
    base_url, api_key, model = _get_config()
    async with httpx.AsyncClient(timeout=300) as client:
        body = _body(messages, tools, model=model, temperature=temperature, max_tokens=max_tokens)
        body["stream"] = True
        body["stream_options"] = {"include_usage": True}

        async with client.stream(
            "POST", f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=body,
        ) as resp:
            resp.raise_for_status()
            tool_acc: dict[int, dict[str, str]] = {}
            usage = TokenUsage()

            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                s = line[6:]
                if s.strip() == "[DONE]":
                    break
                try:
                    chunk = json.loads(s)
                except json.JSONDecodeError:
                    continue

                if "usage" in chunk and chunk["usage"]:
                    u = chunk["usage"]
                    usage = TokenUsage(
                        prompt_tokens=u.get("prompt_tokens", 0),
                        completion_tokens=u.get("completion_tokens", 0),
                        total_tokens=u.get("total_tokens", 0),
                    )

                choices = chunk.get("choices", [])
                if not choices:
                    continue
                delta = choices[0].get("delta", {})
                finish = choices[0].get("finish_reason") or ""

                if delta.get("content"):
                    yield {"type": "text_delta", "delta": delta["content"]}

                for tc in delta.get("tool_calls") or []:
                    idx = tc.get("index", 0)
                    if idx not in tool_acc:
                        tool_acc[idx] = {"id": tc.get("id", ""), "name": "", "arguments": ""}
                    if tc.get("id"):
                        tool_acc[idx]["id"] = tc["id"]
                    if tc.get("function", {}).get("name"):
                        tool_acc[idx]["name"] = tc["function"]["name"]
                    if tc.get("function", {}).get("arguments"):
                        tool_acc[idx]["arguments"] += tc["function"]["arguments"]

                if finish in ("tool_calls", "stop") and tool_acc:
                    for _i, acc in tool_acc.items():
                        try:
                            args = json.loads(acc["arguments"])
                        except json.JSONDecodeError:
                            args = {}
                        yield {"type": "tool_call", "call": ToolCall(id=acc["id"], name=acc["name"], arguments=args)}
                    tool_acc.clear()

    yield {"type": "done", "usage": usage}
