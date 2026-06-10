from __future__ import annotations

from typing import Any

from backend.services.tools.base import Tool, ToolResult


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def schemas(self) -> list[dict[str, Any]]:
        return [t.schema() for t in self._tools.values()]

    async def execute(self, name: str, params: dict[str, Any]) -> ToolResult:
        tool = self._tools.get(name)
        if tool is None:
            return ToolResult(content=f"Unknown tool: {name}", ok=False)
        try:
            result = tool.execute(**params)
            if hasattr(result, "__await__"):
                result = await result
            return result if isinstance(result, ToolResult) else ToolResult(content=str(result))
        except Exception as exc:
            return ToolResult(content=f"Tool error: {exc}", ok=False)
