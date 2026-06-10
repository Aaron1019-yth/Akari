from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict

from backend.db.database import DATA_DIR

CONFIG_PATH = DATA_DIR / "config.json"

_DEFAULTS = {
    "api_key": os.getenv("DEEPSEEK_API_KEY", ""),
    "base_url": os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
    "model": os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
    "tavily_api_key": os.getenv("TAVILY_API_KEY", ""),
    "serper_api_key": os.getenv("SERPER_API_KEY", ""),
    "brave_search_api_key": os.getenv("BRAVE_SEARCH_API_KEY", ""),
    "ui_theme": os.getenv("AKARI_UI_THEME", "agent_warm_paper"),
}


@dataclass
class LlmSettings:
    api_key: str = ""
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-v4-flash"
    tavily_api_key: str = ""
    serper_api_key: str = ""
    brave_search_api_key: str = ""
    ui_theme: str = "agent_warm_paper"


_cache: LlmSettings | None = None


def _load_from_file() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def get_settings() -> LlmSettings:
    global _cache
    if _cache is not None:
        return _cache

    file_data = _load_from_file()
    merged = {**_DEFAULTS, **{k: v for k, v in file_data.items() if v}}
    _cache = LlmSettings(**merged)
    return _cache


def save_settings(s: LlmSettings) -> None:
    global _cache
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(asdict(s), indent=2, ensure_ascii=False))
    _cache = s


def reload_settings() -> LlmSettings:
    global _cache
    _cache = None
    return get_settings()


def mask_key(key: str) -> str:
    if len(key) <= 6:
        return "***" if key else ""
    return key[:3] + "..." + key[-3:]


def resolve_api_key(incoming: str, current_key: str) -> str:
    """Handle partial update: masked or empty value means unchanged."""
    if not incoming or incoming == mask_key(current_key):
        return current_key
    return incoming
