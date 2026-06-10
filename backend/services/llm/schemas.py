from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant" | "tool"
    content: str | None = None
    tool_call_id: str | None = None
    name: str | None = None
    tool_calls: list["ToolCall"] = field(default_factory=list)


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
