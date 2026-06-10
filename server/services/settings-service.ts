import fs from "fs";
import path from "path";
import { DATA_DIR } from "../db.js";

const CONFIG_PATH = path.join(DATA_DIR, "config.json");

const DEFAULTS: Record<string, string> = {
  api_key: process.env["DEEPSEEK_API_KEY"] || "",
  base_url: process.env["DEEPSEEK_BASE_URL"] || "https://api.deepseek.com",
  model: process.env["DEEPSEEK_MODEL"] || "deepseek-v4-flash",
  tavily_api_key: process.env["TAVILY_API_KEY"] || "",
  serper_api_key: process.env["SERPER_API_KEY"] || "",
  brave_search_api_key: process.env["BRAVE_SEARCH_API_KEY"] || "",
  ui_theme: process.env["AKARI_UI_THEME"] || "agent_warm_paper",
  workspace_path: process.env["AKARI_WORKSPACE_PATH"] || "",
};

export interface LlmSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  tavilyApiKey: string;
  serperApiKey: string;
  braveSearchApiKey: string;
  uiTheme: string;
  workspacePath: string;
}

let cache: LlmSettings | null = null;

export function getSettings(): LlmSettings {
  if (cache) return cache;
  const fileData: Record<string, string> = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      Object.assign(fileData, JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")));
    } catch {
      /* ignore corrupt config */
    }
  }
  cache = {
    apiKey: fileData["api_key"] || DEFAULTS["api_key"]!,
    baseUrl: fileData["base_url"] || DEFAULTS["base_url"]!,
    model: fileData["model"] || DEFAULTS["model"]!,
    tavilyApiKey: fileData["tavily_api_key"] || DEFAULTS["tavily_api_key"]!,
    serperApiKey: fileData["serper_api_key"] || DEFAULTS["serper_api_key"]!,
    braveSearchApiKey: fileData["brave_search_api_key"] || DEFAULTS["brave_search_api_key"]!,
    uiTheme: fileData["ui_theme"] || DEFAULTS["ui_theme"]!,
    workspacePath: fileData["workspace_path"] || DEFAULTS["workspace_path"]!,
  };
  return cache;
}

export function saveSettings(s: LlmSettings): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(
    CONFIG_PATH,
    JSON.stringify(
      {
        api_key: s.apiKey,
        base_url: s.baseUrl,
        model: s.model,
        tavily_api_key: s.tavilyApiKey,
        serper_api_key: s.serperApiKey,
        brave_search_api_key: s.braveSearchApiKey,
        ui_theme: s.uiTheme,
        workspace_path: s.workspacePath,
      },
      null,
      2,
    ),
  );
  cache = s;
}

export function reloadSettings(): LlmSettings {
  cache = null;
  return getSettings();
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 6) return "***";
  return key.slice(0, 3) + "..." + key.slice(-3);
}

export function resolveApiKey(incoming: string, currentKey: string): string {
  if (!incoming || incoming === maskKey(currentKey)) return currentKey;
  return incoming;
}
