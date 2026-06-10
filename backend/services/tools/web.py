from __future__ import annotations

import html
import ipaddress
import json
import re
import socket
from urllib.parse import quote_plus, urlparse

import httpx

from backend.services.settings_service import get_settings
from backend.services.tools.base import Tool, ToolResult


def create_web_tools() -> list[Tool]:
    return [
        Tool(
            name="web_search",
            description="搜索互联网获取实时信息。WHEN 需要查找最新资料、验证事实时使用。",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "max_results": {"type": "integer", "default": 5},
                },
                "required": ["query"],
            },
            execute=_web_search,
        ),
        Tool(
            name="web_fetch",
            description="获取指定 URL 的网页内容。WHEN 需要阅读搜索结果中的具体文章时使用。",
            parameters={
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "max_length": {"type": "integer", "default": 8000},
                },
                "required": ["url"],
            },
            execute=_web_fetch,
        ),
    ]


async def _web_search(query: str, max_results: int = 5) -> ToolResult:
    providers = (_search_tavily, _search_serper, _search_brave)
    for provider in providers:
        result = await provider(query, max_results)
        if result is not None:
            return result

    return ToolResult(
        content=(
            "未配置可用搜索 provider。可设置 TAVILY_API_KEY、SERPER_API_KEY 或 BRAVE_SEARCH_API_KEY，"
            f"也可以直接提供要读取的 URL。\n搜索词: {query}"
        ),
        details={"results": [], "provider": None},
        ok=False,
    )


async def _search_tavily(query: str, max_results: int) -> ToolResult | None:
    key = get_settings().tavily_api_key
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": key, "query": query, "max_results": max_results},
            )
            response.raise_for_status()
            payload = response.json()
        return _format_results(payload.get("results", [])[:max_results], "tavily")
    except Exception:
        return None


async def _search_serper(query: str, max_results: int) -> ToolResult | None:
    key = get_settings().serper_api_key
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": key, "Content-Type": "application/json"},
                json={"q": query, "num": max_results},
            )
            response.raise_for_status()
            payload = response.json()
        results = [
            {"title": item.get("title"), "url": item.get("link"), "snippet": item.get("snippet")}
            for item in payload.get("organic", [])[:max_results]
        ]
        return _format_results(results, "serper")
    except Exception:
        return None


async def _search_brave(query: str, max_results: int) -> ToolResult | None:
    key = get_settings().brave_search_api_key
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                headers={"X-Subscription-Token": key, "Accept": "application/json"},
                params={"q": query, "count": max_results},
            )
            response.raise_for_status()
            payload = response.json()
        results = [
            {"title": item.get("title"), "url": item.get("url"), "snippet": item.get("description")}
            for item in payload.get("web", {}).get("results", [])[:max_results]
        ]
        return _format_results(results, "brave")
    except Exception:
        return None


def _format_results(results: list[dict], provider: str) -> ToolResult:
    if not results:
        return ToolResult(content="没有搜索结果。", details={"results": [], "provider": provider})
    lines = []
    normalized = []
    for index, item in enumerate(results, 1):
        title = item.get("title") or item.get("url") or "Untitled"
        url = item.get("url") or ""
        snippet = item.get("content") or item.get("snippet") or ""
        lines.append(f"{index}. **{title}**\n   {url}\n   {snippet}")
        normalized.append({"title": title, "url": url, "snippet": snippet})
    return ToolResult(content="\n".join(lines), details={"results": normalized, "provider": provider})


def _is_private_host(hostname: str) -> bool:
    try:
        addresses = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return True
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return True
    return False


async def _web_fetch(url: str, max_length: int = 8000) -> ToolResult:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return ToolResult(content="URL 必须是完整的 http(s) 地址。", ok=False)
    if _is_private_host(parsed.hostname):
        return ToolResult(content="出于安全限制，不能读取内网或本机地址。", ok=False)

    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
        response = await client.get(url, headers={"User-Agent": "Akari/0.1"})
    ctype = response.headers.get("content-type", "")
    if "application/json" in ctype:
        text = json.dumps(response.json(), ensure_ascii=False, indent=2)
    else:
        raw = response.text
        text = _html_to_text(raw) if "html" in ctype or "<html" in raw[:500].lower() else raw
    truncated = len(text) > max_length
    text = text[:max_length]
    if truncated:
        text += "\n\n[内容已截断]"
    return ToolResult(content=text, details={"url": url, "status_code": response.status_code, "truncated": truncated})


def _html_to_text(raw: str) -> str:
    raw = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw)
    raw = re.sub(r"(?i)<br\s*/?>", "\n", raw)
    raw = re.sub(r"(?i)</(p|div|h[1-6]|li)>", "\n", raw)
    raw = re.sub(r"<[^>]+>", " ", raw)
    return re.sub(r"\n{3,}", "\n\n", html.unescape(raw)).strip()
