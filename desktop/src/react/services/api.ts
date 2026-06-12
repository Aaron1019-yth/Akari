import type {
  ChatRequest,
  ChatResponse,
  GeneratePlanRequest,
  GoalTree,
  TaskCreateRequest
} from "../../../../shared/exam-schema";
import type {
  ChatStreamCallbacks,
  ChatStreamClient,
  DailyFeedbackResponse,
  DeleteSessionResponse,
  ErrorCandidateExtractPayload,
  ErrorCandidateExtractResponse,
  ErrorCandidateGeneratePayload,
  ErrorCandidatePatchPayload,
  ErrorCandidateResponse,
  PdfReviewAnalyzePayload,
  PdfReviewAnalyzeResponse,
  ErrorCandidatesResponse,
  LearningArtifactPayload,
  LearningArtifactResponse,
  LlmSettings,
  LlmSettingsUpdate,
  ManualPlanPayload,
  GoalPatchPayload,
  PatchTaskPayload,
  PlanArchiveResponse,
  PlanDeleteResponse,
  PlanDocumentSyncResponse,
  PlanRestoreResponse,
  PlanVersionsResponse,
  SessionMessagesResponse,
  SessionsResponse,
  TaskFeedbackPayload,
  TaskFeedbackResponse,
  WorkspaceFileMutationResponse,
  WorkspaceFileResponse,
  WorkspaceInfoResponse,
  WorkspaceTreeResponse,
  WorkspaceUploadResponse,
  WeeklyReviewPayload,
  WeeklyReviewResponse,
  WsEvent
} from "./types";

function apiBase(): string {
  // In production Electron (loadFile), page origin is file:// — need absolute backend URL.
  // In dev, page is served from http://127.0.0.1:5173 and Vite proxies /api to backend.
  return window.location.protocol === "file:" ? "http://127.0.0.1:8742" : "";
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiBase() + path, {
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

export function createChatStream(callbacks: ChatStreamCallbacks): ChatStreamClient {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.protocol === "file:" ? "127.0.0.1:8742" : window.location.host;
  const url = `${protocol}://${host}/api/chat/ws`;

  let ws: WebSocket;
  let finished = false;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  const pending: string[] = [];

  function connect() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      while (pending.length && ws.readyState === WebSocket.OPEN) {
        ws.send(pending.shift()!);
      }
    };

    ws.onmessage = (event) => {
      const e = JSON.parse(event.data) as WsEvent;
      switch (e.type) {
        case "text_delta":
          callbacks.onToken(e.delta);
          break;
        case "tool_start":
          callbacks.onToolStart?.(e.name, e.arguments || {});
          break;
        case "tool_end":
          callbacks.onToolEnd?.(e.name, e.ok ?? true, e.summary || "");
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

    ws.onerror = () => {
      // onclose will fire after this, handle reconnection there
    };

    ws.onclose = () => {
      if (finished) return;
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
        setTimeout(connect, delay);
      } else {
        callbacks.onError?.("WebSocket 连接失败，已达到最大重连次数");
      }
    };
  }

  connect();

  return {
    send: (text: string, sessionId = "default", displayText?: string) => {
      const payload = JSON.stringify({ type: "prompt", text, session_id: sessionId, display_text: displayText });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      } else if (ws.readyState === WebSocket.CONNECTING) {
        pending.push(payload);
      } else {
        callbacks.onError?.("WebSocket 尚未连接");
      }
    },
    abort: () => {
      finished = true; // prevent reconnect after intentional abort
      const payload = JSON.stringify({ type: "abort" });
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    },
    close: () => {
      finished = true;
      ws.close();
    },
  };
}

export const api = {
  getGoal: () => request<GoalTree | null>("/api/planner/goal"),
  getPlanVersions: () => request<PlanVersionsResponse>("/api/planner/versions"),
  restorePlanVersion: (goalId: string) =>
    request<PlanRestoreResponse>(`/api/planner/versions/${encodeURIComponent(goalId)}/restore`, {
      method: "POST",
    }),
  archivePlanVersion: (goalId: string) =>
    request<PlanArchiveResponse>(`/api/planner/versions/${encodeURIComponent(goalId)}/archive`, {
      method: "POST",
    }),
  deletePlanVersion: (goalId: string) =>
    request<PlanDeleteResponse>(`/api/planner/versions/${encodeURIComponent(goalId)}`, {
      method: "DELETE",
    }),
  syncPlanDocument: () =>
    request<PlanDocumentSyncResponse>("/api/planner/document/sync", {
      method: "POST",
    }),
  generatePlan: (payload: GeneratePlanRequest) =>
    request<GoalTree>("/api/planner/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createManualPlan: (payload: ManualPlanPayload) =>
    request<GoalTree>("/api/planner/manual", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  patchGoal: (payload: GoalPatchPayload) =>
    request<GoalTree>("/api/planner/goal", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  patchTask: (taskId: string, payload: PatchTaskPayload) =>
    request<GoalTree>(`/api/planner/task/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  saveTaskFeedback: (taskId: string, payload: TaskFeedbackPayload) =>
    request<TaskFeedbackResponse>(`/api/planner/task/${taskId}/feedback`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteTask: (taskId: string) => request<GoalTree>(`/api/planner/task/${taskId}`, { method: "DELETE" }),
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
  getWorkspaceTree: (dir = "") =>
    request<WorkspaceTreeResponse>(`/api/workspace/tree?dir=${encodeURIComponent(dir)}`),
  getWorkspaceFile: (filePath: string) =>
    request<WorkspaceFileResponse>(`/api/workspace/file?path=${encodeURIComponent(filePath)}`),
  createWorkspaceFile: (filePath: string, content: string) =>
    request<WorkspaceFileMutationResponse>("/api/workspace/file", {
      method: "POST",
      body: JSON.stringify({ path: filePath, content }),
    }),
  uploadWorkspaceFile: (file: File, signal?: AbortSignal, options?: { target?: "review" }) => {
    const form = new FormData();
    form.append("file", file);
    if (options?.target) form.append("target", options.target);
    return fetch(apiBase() + "/api/workspace/upload", {
      method: "POST",
      body: form,
      signal,
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed: ${res.status}`);
      }
      return res.json() as Promise<WorkspaceUploadResponse>;
    });
  },
  deleteWorkspaceFile: (filePath: string) =>
    request<WorkspaceFileMutationResponse>(`/api/workspace/file?path=${encodeURIComponent(filePath)}`, {
      method: "DELETE",
    }),
  renameWorkspaceFile: (oldPath: string, newPath: string) =>
    request<WorkspaceFileMutationResponse>("/api/workspace/file", {
      method: "PATCH",
      body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
    }),
  getWorkspaceInfo: () =>
    request<WorkspaceInfoResponse>("/api/workspace/info"),
  createLearningArtifact: (payload: LearningArtifactPayload) =>
    request<LearningArtifactResponse>("/api/feedback/artifacts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  generateErrorCandidate: (payload: ErrorCandidateGeneratePayload) =>
    request<ErrorCandidateResponse>("/api/feedback/candidates/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  extractErrorCandidates: (payload: ErrorCandidateExtractPayload) =>
    request<ErrorCandidateExtractResponse>("/api/feedback/candidates/extract", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  analyzePdfReview: (payload: PdfReviewAnalyzePayload) =>
    request<PdfReviewAnalyzeResponse>("/api/feedback/artifacts/analyze-pdf-review", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getErrorCandidates: (status?: "pending" | "confirmed" | "dismissed") =>
    request<ErrorCandidatesResponse>(`/api/feedback/candidates${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  updateErrorCandidate: (candidateId: string, payload: ErrorCandidatePatchPayload) =>
    request<ErrorCandidateResponse>(`/api/feedback/candidates/${encodeURIComponent(candidateId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  getDailyFeedback: (date: string) =>
    request<DailyFeedbackResponse>(`/api/feedback/daily?date=${encodeURIComponent(date)}`),
  generateDailyReviewDocument: (date: string) =>
    request<{ path: string }>("/api/feedback/daily/document", {
      method: "POST",
      body: JSON.stringify({ date }),
    }),
  getWeeklyReview: (weekStart: string) =>
    request<WeeklyReviewResponse>(`/api/feedback/weekly?week_start=${encodeURIComponent(weekStart)}`),
  createWeeklyReview: (payload: WeeklyReviewPayload) =>
    request<WeeklyReviewResponse>("/api/feedback/weekly", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adaptPlan: () => request<GoalTree>("/api/planner/adapt", { method: "POST" }),
  getSessions: () => request<SessionsResponse>("/api/sessions"),
  getSessionMessages: (sessionId: string) => request<SessionMessagesResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`),
  deleteSession: async (sessionId: string) => {
    const encoded = encodeURIComponent(sessionId);
    try {
      return await request<DeleteSessionResponse>(`/api/sessions/${encoded}`, { method: "DELETE" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("Cannot DELETE")) throw err;
      return request<DeleteSessionResponse>(`/api/sessions/${encoded}/delete`, { method: "POST" });
    }
  },
  getSettings: () => request<LlmSettings>("/api/settings"),
  updateSettings: (payload: LlmSettingsUpdate) =>
    request<LlmSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
};
