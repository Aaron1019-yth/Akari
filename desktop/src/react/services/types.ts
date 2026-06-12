import type {
  FileNode,
  ErrorCandidate,
  ErrorCandidateStatus,
  GoalTree,
  LearningArtifact,
  LearningArtifactSource,
  PdfReviewReport,
  PlanVersionSummary,
  PlanCardPayload,
  StudyReview,
  TaskDifficulty,
  TaskFeedback,
  TaskFocus,
  TaskStatus,
  TimeSlot,
  UiTheme
} from "../../../../shared/exam-schema";

// Frontend API client DTOs and WebSocket transport types.

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type LlmSettings = {
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
  workspace_path: string;
};

export type LlmSettingsUpdate = {
  api_key: string;
  base_url: string;
  model: string;
  tavily_api_key: string;
  serper_api_key: string;
  brave_search_api_key: string;
  ui_theme: UiTheme;
  workspace_path: string;
};

export type WsEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; name: string; arguments?: Record<string, unknown> }
  | { type: "tool_end"; name: string; ok?: boolean; summary?: string }
  | { type: "turn_end"; usage?: TokenUsage }
  | { type: "error"; message?: string }
  | { type: "plan_card"; card?: PlanCardPayload }
  | { type: "file_list"; files?: FileNode[] };

export type ChatStreamCallbacks = {
  onToken: (delta: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolEnd?: (name: string, ok: boolean, summary: string) => void;
  onPlanCard?: (card: PlanCardPayload) => void;
  onFileList?: (files: FileNode[]) => void;
  onTurnEnd?: () => void;
  onError?: (message: string) => void;
};

export type ChatStreamClient = {
  send: (text: string, sessionId?: string, displayText?: string) => void;
  abort: () => void;
  close: () => void;
};

export type PatchTaskPayload = {
  status?: TaskStatus;
  actual_minutes?: number;
  date?: string;
  time_slot?: TimeSlot;
  sort_order?: number;
  title?: string;
  type?: string;
  subject?: string;
};

export type TaskFeedbackPayload = {
  actual_minutes: number;
  difficulty: TaskDifficulty;
  focus: TaskFocus;
  note: string;
};

export type TaskFeedbackResponse = {
  feedback: TaskFeedback;
  goal: GoalTree;
};

export type ManualPlanPayload = {
  title: string;
  description: string;
  target_score: number;
  exam_date: string;
};

export type GoalPatchPayload = {
  title?: string;
  description?: string;
  target_score?: number;
  exam_date?: string;
};

export type PlanVersionsResponse = {
  versions: PlanVersionSummary[];
};

export type PlanRestoreResponse = {
  goal: GoalTree;
  document_path: string;
};

export type PlanArchiveResponse = {
  goal: GoalTree | null;
  versions: PlanVersionSummary[];
  document_path: string;
};

export type PlanDeleteResponse = {
  ok: boolean;
  deleted_goal_id: string;
  deleted_document_paths: string[];
  versions: PlanVersionSummary[];
};

export type PlanDocumentSyncResponse = {
  document_path: string;
};

export type LearningArtifactPayload = {
  source_type: LearningArtifactSource;
  source_ref?: string;
  daily_task_id?: string | null;
  title?: string;
  raw_text?: string;
  metadata?: Record<string, unknown>;
};

export type LearningArtifactResponse = {
  artifact: LearningArtifact;
};

export type ErrorCandidateGeneratePayload = {
  artifact_id?: string;
  daily_task_id?: string;
  text?: string;
  hint?: string;
};

export type ErrorCandidateResponse = {
  candidate: ErrorCandidate;
};

export type ErrorCandidateExtractPayload = {
  artifact_id: string;
  daily_task_id?: string | null;
  hint?: string;
};

export type ErrorCandidateExtractResponse = {
  artifact: LearningArtifact;
  candidates: ErrorCandidate[];
};

export type PdfReviewAnalyzePayload = {
  artifact_id: string;
  hint?: string;
};

export type PdfReviewAnalyzeResponse = {
  artifact: LearningArtifact;
  review: StudyReview;
  report: PdfReviewReport;
};

export type ErrorCandidatesResponse = {
  candidates: ErrorCandidate[];
};

export type ErrorCandidatePatchPayload = {
  status?: ErrorCandidateStatus;
  daily_task_id?: string | null;
  module_id?: string | null;
  subject?: string;
  question_type?: string;
  review_kind?: string;
  question_text?: string;
  user_answer?: string;
  correct_answer?: string;
  choice_reason?: string;
  question_summary?: string;
  mistake_summary?: string;
  cause?: string;
  suggested_fix?: string;
  confidence?: number;
};

export type DailyFeedbackResponse = {
  date: string;
  tasks: unknown[];
  feedback: TaskFeedback[];
  confirmed_errors: ErrorCandidate[];
  stats: {
    completed_count?: number;
    total_count?: number;
    actual_minutes?: number;
    hard_count?: number;
    confirmed_error_count?: number;
    pdf_review_count?: number;
    top_causes?: string[];
  };
  review: StudyReview | null;
};

export type WeeklyReviewPayload = {
  week_start: string;
  week_end: string;
  regenerate?: boolean;
};

export type WeeklyReviewResponse = {
  review: StudyReview | null;
};

export type WorkspaceTreeResponse = {
  tree: FileNode[];
  workspace_path: string;
};

export type WorkspaceFileResponse = {
  content: string;
  mime: string;
  truncated: boolean;
};

export type WorkspaceFileMutationResponse = {
  ok: boolean;
  tree: FileNode[];
};

export type WorkspaceUploadResponse = {
  file: FileNode;
  tree: FileNode[];
  workspace_path: string;
};

export type WorkspaceInfoResponse = {
  workspace_path: string;
};

export type SessionSummary = {
  session_id: string;
  message_count: number;
  last_message_at: string;
  preview: string;
};

export type SessionsResponse = {
  sessions: SessionSummary[];
};

export type SessionMessage = {
  role: string;
  content: string;
  created_at: string;
};

export type SessionMessagesResponse = {
  session_id: string;
  messages: SessionMessage[];
};

export type DeleteSessionResponse = {
  ok: boolean;
};
