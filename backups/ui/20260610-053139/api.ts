import type {
  ChatRequest,
  ChatResponse,
  ConversationFile,
  GeneratePlanRequest,
  GoalTree,
  PlanCardPayload,
  TaskCreateRequest,
  TaskStatus,
  TimeSlot,
  UiTheme
} from "../../../../shared/exam-schema";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

type LlmSettings = {
  api_key_masked: string;
  api_key_is_set: boolean;
  base_url: string;
  model: string;
  tavily_api_key_masked: string;
  tavily_api_key_is_set: boolean;
  serper_api_key_masked: string;
  serper_api_key_is_set: boolean;
  brave_search_api_key_masked: string;
  brave_search_api_key_is_set: boolean;
  ui_theme: UiTheme;
};

type LlmSettingsUpdate = {
  api_key: string;
  base_url: string;
  model: string;
  tavily_api_key: string;
  serper_api_key: string;
  brave_search_api_key: string;
  ui_theme: UiTheme;
};

type WsEvent = {
  type: "text_delta" | "tool_start" | "tool_end" | "turn_end" | "error" | "plan_card" | "file_list";
  delta?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  ok?: boolean;
  summary?: string;
  message?: string;
  card?: PlanCardPayload;
  files?: ConversationFile[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

type ChatStreamCallbacks = {
  onToken: (delta: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (name: string, ok: boolean, summary: string) => void;
  onPlanCard?: (card: PlanCardPayload) => void;
  onFileList?: (files: ConversationFile[]) => void;
  onTurnEnd?: () => void;
  onError?: (message: string) => void;
};

export function createChatStream(callbacks: ChatStreamCallbacks) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocol}://${window.location.host}/api/chat/ws`);
  const pending: string[] = [];
  let finished = false;

  ws.onopen = () => {
    while (pending.length && ws.readyState === WebSocket.OPEN) {
      ws.send(pending.shift()!);
    }
  };

  ws.onmessage = (event) => {
    const e = JSON.parse(event.data) as WsEvent;
    switch (e.type) {
      case "text_delta":
        callbacks.onToken(e.delta!);
        break;
      case "tool_start":
        callbacks.onToolStart?.(e.name!, e.arguments || {});
        break;
      case "tool_end":
        callbacks.onToolEnd?.(e.name!, e.ok ?? true, e.summary || "");
        break;
      case "plan_card":
        if (e.card) callbacks.onPlanCard?.(e.card);
        break;
      case "file_list":
        callbacks.onFileList?.(e.files || []);
        break;
      case "turn_end":
        finished = true;
        callbacks.onTurnEnd?.();
        break;
      case "error":
        finished = true;
        callbacks.onError?.(e.message || "未知错误");
        break;
    }
  };

  ws.onerror = () => callbacks.onError?.("WebSocket 连接失败");
  ws.onclose = () => {
    if (!finished) callbacks.onError?.("WebSocket 连接已关闭");
  };

  return {
    send: (text: string, sessionId = "default") => {
      const payload = JSON.stringify({ type: "prompt", text, session_id: sessionId });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else if (ws.readyState === WebSocket.CONNECTING) {
        pending.push(payload);
      } else {
        callbacks.onError?.("WebSocket 尚未连接");
      }
    },
    abort: () => {
      const payload = JSON.stringify({ type: "abort" });
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    },
    close: () => ws.close(),
  };
}

async function uploadFile(file: File, signal?: AbortSignal): Promise<ConversationFile> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/files/upload", {
    method: "POST",
    body: form,
    signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed: ${response.status}`);
  }
  return response.json() as Promise<ConversationFile>;
}

export const api = {
  getGoal: () => request<GoalTree | null>("/api/planner/goal"),
  generatePlan: (payload: GeneratePlanRequest) =>
    request<GoalTree>("/api/planner/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  patchTask: (taskId: string, payload: { status?: TaskStatus; actual_minutes?: number; time_slot?: TimeSlot; sort_order?: number }) =>
    request<GoalTree>(`/api/planner/task/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  createTask: (payload: TaskCreateRequest) =>
    request<GoalTree>("/api/planner/task", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  sendChat: (payload: ChatRequest) =>
    request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  uploadFile,
  getFiles: () => request<{ files: ConversationFile[] }>("/api/files"),
  adaptPlan: () => request<GoalTree>("/api/planner/adapt", { method: "POST" }),
  getSettings: () => request<LlmSettings>("/api/settings"),
  updateSettings: (payload: LlmSettingsUpdate) =>
    request<LlmSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
};
