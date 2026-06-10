from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    execute: Any  # async callable(params) → ToolResult

    def schema(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "parameters": self.parameters}


@dataclass
class ToolResult:
    content: str
    details: dict[str, Any] = field(default_factory=dict)
    ok: bool = True
