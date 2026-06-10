from __future__ import annotations

from fastapi import APIRouter

from backend.schemas import LlmSettingsOut, LlmSettingsUpdate
from backend.services.settings_service import (
    get_settings,
    save_settings,
    mask_key,
    resolve_api_key,
    LlmSettings,
)

router = APIRouter()


@router.get("/settings", response_model=LlmSettingsOut)
def _get_settings() -> LlmSettingsOut:
    s = get_settings()
    return LlmSettingsOut(
        api_key_masked=mask_key(s.api_key),
        api_key_is_set=bool(s.api_key),
        base_url=s.base_url,
        model=s.model,
        tavily_api_key_masked=mask_key(s.tavily_api_key),
        tavily_api_key_is_set=bool(s.tavily_api_key),
        serper_api_key_masked=mask_key(s.serper_api_key),
        serper_api_key_is_set=bool(s.serper_api_key),
        brave_search_api_key_masked=mask_key(s.brave_search_api_key),
        brave_search_api_key_is_set=bool(s.brave_search_api_key),
        ui_theme=s.ui_theme,
    )


@router.put("/settings", response_model=LlmSettingsOut)
def _update_settings(payload: LlmSettingsUpdate) -> LlmSettingsOut:
    current = get_settings()
    new_api_key = resolve_api_key(payload.api_key, current.api_key)
    new_tavily_key = resolve_api_key(payload.tavily_api_key, current.tavily_api_key)
    new_serper_key = resolve_api_key(payload.serper_api_key, current.serper_api_key)
    new_brave_key = resolve_api_key(payload.brave_search_api_key, current.brave_search_api_key)
    s = LlmSettings(
        api_key=new_api_key,
        base_url=payload.base_url,
        model=payload.model,
        tavily_api_key=new_tavily_key,
        serper_api_key=new_serper_key,
        brave_search_api_key=new_brave_key,
        ui_theme=payload.ui_theme,
    )
    save_settings(s)
    return LlmSettingsOut(
        api_key_masked=mask_key(s.api_key),
        api_key_is_set=bool(s.api_key),
        base_url=s.base_url,
        model=s.model,
        tavily_api_key_masked=mask_key(s.tavily_api_key),
        tavily_api_key_is_set=bool(s.tavily_api_key),
        serper_api_key_masked=mask_key(s.serper_api_key),
        serper_api_key_is_set=bool(s.serper_api_key),
        brave_search_api_key_masked=mask_key(s.brave_search_api_key),
        brave_search_api_key_is_set=bool(s.brave_search_api_key),
        ui_theme=s.ui_theme,
    )
