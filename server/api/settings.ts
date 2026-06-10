import { Router, Request, Response } from "express";
import { LlmSettingsUpdate } from "../types.js";
import {
  getSettings,
  saveSettings,
  maskKey,
  resolveApiKey,
} from "../services/settings-service.js";

const router = Router();

// GET /api/settings
router.get("/", (_req: Request, res: Response) => {
  const s = getSettings();
  res.json({
    api_key_masked: maskKey(s.apiKey),
    api_key_is_set: Boolean(s.apiKey),
    base_url: s.baseUrl,
    model: s.model,
    tavily_api_key_masked: maskKey(s.tavilyApiKey),
    tavily_api_key_is_set: Boolean(s.tavilyApiKey),
    serper_api_key_masked: maskKey(s.serperApiKey),
    serper_api_key_is_set: Boolean(s.serperApiKey),
    brave_search_api_key_masked: maskKey(s.braveSearchApiKey),
    brave_search_api_key_is_set: Boolean(s.braveSearchApiKey),
    ui_theme: s.uiTheme,
  });
});

// PUT /api/settings
router.put("/", (req: Request, res: Response) => {
  const parsed = LlmSettingsUpdate.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  const payload = parsed.data;
  const current = getSettings();
  const newApiKey = resolveApiKey(payload.api_key, current.apiKey);
  const newTavilyKey = resolveApiKey(payload.tavily_api_key, current.tavilyApiKey);
  const newSerperKey = resolveApiKey(payload.serper_api_key, current.serperApiKey);
  const newBraveKey = resolveApiKey(payload.brave_search_api_key, current.braveSearchApiKey);

  saveSettings({
    apiKey: newApiKey,
    baseUrl: payload.base_url,
    model: payload.model,
    tavilyApiKey: newTavilyKey,
    serperApiKey: newSerperKey,
    braveSearchApiKey: newBraveKey,
    uiTheme: payload.ui_theme,
  });

  const s = getSettings();
  res.json({
    api_key_masked: maskKey(s.apiKey),
    api_key_is_set: Boolean(s.apiKey),
    base_url: s.baseUrl,
    model: s.model,
    tavily_api_key_masked: maskKey(s.tavilyApiKey),
    tavily_api_key_is_set: Boolean(s.tavilyApiKey),
    serper_api_key_masked: maskKey(s.serperApiKey),
    serper_api_key_is_set: Boolean(s.serperApiKey),
    brave_search_api_key_masked: maskKey(s.braveSearchApiKey),
    brave_search_api_key_is_set: Boolean(s.braveSearchApiKey),
    ui_theme: s.uiTheme,
  });
});

export default router;
