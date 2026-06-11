import { z } from "zod";

// ── Literal types ──

export const GoalStatus = z.enum(["active", "completed", "paused", "archived"]);
export type GoalStatus = z.infer<typeof GoalStatus>;

export const TrackType = z.enum(["xingce", "shenlun", "interview"]);
export type TrackType = z.infer<typeof TrackType>;

export const TaskType = z.enum(["study", "practice", "mock_exam", "review", "essay"]);
export type TaskType = z.infer<typeof TaskType>;

export const TimeSlot = z.enum(["morning", "afternoon", "evening"]);
export type TimeSlot = z.infer<typeof TimeSlot>;

export const TaskStatus = z.enum(["pending", "in_progress", "completed", "skipped"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const UiTheme = z.enum(["agent_warm_paper", "akari_cool", "classic_beige"]);
export type UiTheme = z.infer<typeof UiTheme>;

export const TaskDifficulty = z.enum(["easy", "ok", "hard"]);
export type TaskDifficulty = z.infer<typeof TaskDifficulty>;

export const TaskFocus = z.enum(["focused", "normal", "distracted", "tired"]);
export type TaskFocus = z.infer<typeof TaskFocus>;

export const LearningArtifactSource = z.enum(["workspace_file", "chat", "manual"]);
export type LearningArtifactSource = z.infer<typeof LearningArtifactSource>;

export const ErrorCandidateStatus = z.enum(["pending", "confirmed", "dismissed"]);
export type ErrorCandidateStatus = z.infer<typeof ErrorCandidateStatus>;

export const StudyReviewScope = z.enum(["daily", "weekly"]);
export type StudyReviewScope = z.infer<typeof StudyReviewScope>;

// ── DB row interfaces (exact column shape from SQLite) ──

export interface GoalRow {
  id: string;
  title: string;
  description: string;
  target_score: number;
  current_estimated_score: number;
  exam_date: string;
  created_at: string;
  status: string;
}

export interface TrackRow {
  id: string;
  goal_id: string;
  type: string;
  title: string;
  target_score: number;
  current_score: number;
  sort_order: number;
}

export interface ModuleRow {
  id: string;
  track_id: string;
  name: string;
  sort_order: number;
  weight: number;
  correct_rate: number;
  total_questions: number;
  proficiency: number;
}

export interface WeeklyPlanRow {
  id: string;
  goal_id: string;
  week_start: string;
  week_end: string;
  focus_areas_json: string;
  target_correct_rate: number;
  summary: string;
}

export interface DailyTaskRow {
  id: string;
  weekly_plan_id: string;
  module_id: string;
  date: string;
  title: string;
  type: string;
  subject: string;
  question_count: number;
  estimated_minutes: number;
  actual_minutes: number;
  time_slot: string;
  status: string;
  sort_order: number;
}

export interface PracticeSessionRow {
  id: string;
  daily_task_id: string;
  module_id: string;
  started_at: string;
  ended_at: string;
  question_count: number;
  correct_count: number;
  accuracy: number;
  duration_seconds: number;
  tags_json: string;
}

export interface ErrorRecordRow {
  id: string;
  practice_session_id: string;
  module_id: string;
  question_hash: string;
  question_text: string;
  user_answer: string;
  correct_answer: string;
  explanation: string;
  tags_json: string;
  recorded_at: string;
  reviewed_count: number;
  mastered: number;
}

export interface StudentProfileRow {
  id: string;
  goal_id: string;
  strengths_json: string;
  weaknesses_json: string;
  module_proficiencies_json: string;
  preferred_time_slots_json: string;
  avg_daily_study_minutes: number;
  learning_style: string;
  last_updated: string;
}

export interface TaskFeedbackRow {
  id: string;
  daily_task_id: string;
  actual_minutes: number;
  difficulty: string;
  focus: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface LearningArtifactRow {
  id: string;
  source_type: string;
  source_ref: string;
  daily_task_id: string | null;
  title: string;
  raw_text: string;
  metadata_json: string;
  created_at: string;
}

export interface ErrorCandidateRow {
  id: string;
  artifact_id: string;
  daily_task_id: string | null;
  module_id: string | null;
  subject: string;
  question_summary: string;
  mistake_summary: string;
  cause: string;
  suggested_fix: string;
  confidence: number;
  status: string;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

export interface StudyReviewRow {
  id: string;
  scope: string;
  period_start: string;
  period_end: string;
  summary: string;
  stats_json: string;
  created_at: string;
  updated_at: string;
}

// ── Request schemas ──

export const GeneratePlanRequest = z.object({
  target_score: z.number().int().min(1).max(300),
  exam_date: z.string(),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
});
export type GeneratePlanRequest = z.infer<typeof GeneratePlanRequest>;

export const TaskPatchRequest = z.object({
  status: TaskStatus.optional(),
  actual_minutes: z.number().int().min(0).optional(),
  time_slot: TimeSlot.optional(),
  sort_order: z.number().int().optional(),
  title: z.string().min(1).optional(),
  type: TaskType.optional(),
  subject: z.string().optional(),
  estimated_minutes: z.number().int().min(0).optional(),
  date: z.string().optional(),
});
export type TaskPatchRequest = z.infer<typeof TaskPatchRequest>;

export const TaskCreateRequest = z.object({
  title: z.string().min(1),
  type: TaskType,
  subject: z.string(),
  estimated_minutes: z.number().int().min(0),
  question_count: z.number().int().min(0).default(0),
  time_slot: TimeSlot,
  date: z.string().optional(),
  module_id: z.string().optional(),
});
export type TaskCreateRequest = z.infer<typeof TaskCreateRequest>;

export const PracticeSessionRequest = z.object({
  daily_task_id: z.string(),
  module_id: z.string(),
  question_count: z.number().int().positive(),
  correct_count: z.number().int().min(0),
  duration_seconds: z.number().int().min(0),
  tags: z.array(z.string()).default([]),
});
export type PracticeSessionRequest = z.infer<typeof PracticeSessionRequest>;

export const ErrorInput = z.object({
  module_id: z.string(),
  question_text: z.string(),
  user_answer: z.string(),
  correct_answer: z.string(),
  explanation: z.string().default(""),
  tags: z.array(z.string()).default([]),
});
export type ErrorInput = z.infer<typeof ErrorInput>;

export const ErrorBatchRequest = z.object({
  practice_session_id: z.string(),
  errors: z.array(ErrorInput),
});
export type ErrorBatchRequest = z.infer<typeof ErrorBatchRequest>;

export const TaskFeedbackRequest = z.object({
  actual_minutes: z.number().int().min(0),
  difficulty: TaskDifficulty,
  focus: TaskFocus,
  note: z.string().default(""),
});
export type TaskFeedbackRequest = z.infer<typeof TaskFeedbackRequest>;

export const LearningArtifactRequest = z.object({
  source_type: LearningArtifactSource,
  source_ref: z.string().default(""),
  daily_task_id: z.string().nullable().optional(),
  title: z.string().default(""),
  raw_text: z.string().default(""),
  metadata: z.record(z.unknown()).default({}),
});
export type LearningArtifactRequest = z.infer<typeof LearningArtifactRequest>;

export const ErrorCandidateGenerateRequest = z.object({
  artifact_id: z.string().optional(),
  daily_task_id: z.string().optional(),
  text: z.string().optional(),
  hint: z.string().default(""),
}).refine((value) => Boolean(value.artifact_id || value.text), {
  message: "artifact_id or text is required",
});
export type ErrorCandidateGenerateRequest = z.infer<typeof ErrorCandidateGenerateRequest>;

export const ErrorCandidatePatchRequest = z.object({
  status: ErrorCandidateStatus.optional(),
  daily_task_id: z.string().nullable().optional(),
  module_id: z.string().nullable().optional(),
  subject: z.string().optional(),
  question_summary: z.string().optional(),
  mistake_summary: z.string().optional(),
  cause: z.string().optional(),
  suggested_fix: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type ErrorCandidatePatchRequest = z.infer<typeof ErrorCandidatePatchRequest>;

export const WeeklyReviewRequest = z.object({
  week_start: z.string(),
  week_end: z.string(),
  regenerate: z.boolean().default(false),
});
export type WeeklyReviewRequest = z.infer<typeof WeeklyReviewRequest>;

export const ChatRequest = z.object({
  session_id: z.string().default("default"),
  message: z.string().min(1),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const LlmSettingsUpdate = z.object({
  api_key: z.string().default(""),
  base_url: z.string(),
  model: z.string(),
  tavily_api_key: z.string().default(""),
  serper_api_key: z.string().default(""),
  brave_search_api_key: z.string().default(""),
  ui_theme: UiTheme.default("agent_warm_paper"),
  workspace_path: z.string().default(""),
});
export type LlmSettingsUpdate = z.infer<typeof LlmSettingsUpdate>;

// ── Output schemas (for future route use) ──

export const ModuleOut = z.object({
  id: z.string(),
  track_id: z.string(),
  name: z.string(),
  sort_order: z.number().int(),
  weight: z.number(),
  correct_rate: z.number(),
  total_questions: z.number().int(),
  proficiency: z.number(),
});
export type ModuleOut = z.infer<typeof ModuleOut>;

export const TrackOut = z.object({
  id: z.string(),
  goal_id: z.string(),
  type: TrackType,
  title: z.string(),
  target_score: z.number().int(),
  current_score: z.number().int(),
  sort_order: z.number().int(),
  modules: z.array(ModuleOut).default([]),
});
export type TrackOut = z.infer<typeof TrackOut>;

export const DailyTaskOut = z.object({
  id: z.string(),
  weekly_plan_id: z.string(),
  module_id: z.string(),
  date: z.string(),
  title: z.string(),
  type: TaskType,
  subject: z.string(),
  question_count: z.number().int(),
  estimated_minutes: z.number().int(),
  actual_minutes: z.number().int(),
  time_slot: TimeSlot,
  status: TaskStatus,
  sort_order: z.number().int(),
});
export type DailyTaskOut = z.infer<typeof DailyTaskOut>;

export const WeeklyPlanOut = z.object({
  id: z.string(),
  goal_id: z.string(),
  week_start: z.string(),
  week_end: z.string(),
  focus_areas: z.array(z.string()),
  target_correct_rate: z.number(),
  summary: z.string(),
  tasks: z.array(DailyTaskOut),
});
export type WeeklyPlanOut = z.infer<typeof WeeklyPlanOut>;

export const StudentProfileOut = z.object({
  id: z.string(),
  goal_id: z.string(),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  module_proficiencies: z.record(z.string(), z.number()).default({}),
  preferred_time_slots: z.array(z.string()).default([]),
  avg_daily_study_minutes: z.number().int(),
  learning_style: z.string(),
  last_updated: z.string(),
});
export type StudentProfileOut = z.infer<typeof StudentProfileOut>;

export const GoalTree = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  target_score: z.number().int(),
  current_estimated_score: z.number().int(),
  exam_date: z.string(),
  created_at: z.string(),
  status: GoalStatus,
  tracks: z.array(TrackOut),
  weekly_plan: WeeklyPlanOut.nullable(),
  profile: StudentProfileOut.nullable(),
});
export type GoalTree = z.infer<typeof GoalTree>;

export const ChatMessageOut = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  created_at: z.string(),
});
export type ChatMessageOut = z.infer<typeof ChatMessageOut>;

export const ChatResponse = z.object({
  session_id: z.string(),
  message: ChatMessageOut,
});
export type ChatResponse = z.infer<typeof ChatResponse>;

export const PracticeSessionOut = z.object({
  id: z.string(),
  daily_task_id: z.string(),
  module_id: z.string(),
  started_at: z.string(),
  ended_at: z.string(),
  question_count: z.number().int(),
  correct_count: z.number().int(),
  accuracy: z.number(),
  duration_seconds: z.number().int(),
  tags: z.array(z.string()),
});
export type PracticeSessionOut = z.infer<typeof PracticeSessionOut>;

export const PracticeSessionResponse = z.object({
  session: PracticeSessionOut,
  task: DailyTaskOut,
  module: ModuleOut,
  profile: StudentProfileOut.nullable(),
});
export type PracticeSessionResponse = z.infer<typeof PracticeSessionResponse>;

export const ErrorBatchResponse = z.object({
  created_count: z.number().int(),
  skipped_count: z.number().int(),
  profile: StudentProfileOut.nullable(),
});
export type ErrorBatchResponse = z.infer<typeof ErrorBatchResponse>;

export const TaskFeedbackOut = z.object({
  id: z.string(),
  daily_task_id: z.string(),
  actual_minutes: z.number().int(),
  difficulty: TaskDifficulty,
  focus: TaskFocus,
  note: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TaskFeedbackOut = z.infer<typeof TaskFeedbackOut>;

export const LearningArtifactOut = z.object({
  id: z.string(),
  source_type: LearningArtifactSource,
  source_ref: z.string(),
  daily_task_id: z.string().nullable(),
  title: z.string(),
  raw_text: z.string(),
  metadata: z.record(z.unknown()),
  created_at: z.string(),
});
export type LearningArtifactOut = z.infer<typeof LearningArtifactOut>;

export const ErrorCandidateOut = z.object({
  id: z.string(),
  artifact_id: z.string(),
  daily_task_id: z.string().nullable(),
  module_id: z.string().nullable(),
  subject: z.string(),
  question_summary: z.string(),
  mistake_summary: z.string(),
  cause: z.string(),
  suggested_fix: z.string(),
  confidence: z.number(),
  status: ErrorCandidateStatus,
  created_at: z.string(),
  updated_at: z.string(),
  confirmed_at: z.string().nullable(),
});
export type ErrorCandidateOut = z.infer<typeof ErrorCandidateOut>;

export const StudyReviewOut = z.object({
  id: z.string(),
  scope: StudyReviewScope,
  period_start: z.string(),
  period_end: z.string(),
  summary: z.string(),
  stats: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});
export type StudyReviewOut = z.infer<typeof StudyReviewOut>;

export const PlanVersionSummaryOut = z.object({
  goal_id: z.string(),
  title: z.string(),
  status: GoalStatus,
  created_at: z.string(),
  exam_date: z.string(),
  week_start: z.string().nullable(),
  week_end: z.string().nullable(),
  task_count: z.number().int(),
  completed_count: z.number().int(),
  estimated_minutes: z.number().int(),
  actual_minutes: z.number().int(),
  document_path: z.string(),
});
export type PlanVersionSummaryOut = z.infer<typeof PlanVersionSummaryOut>;

export const LlmSettingsOut = z.object({
  api_key_masked: z.string(),
  api_key_is_set: z.boolean(),
  base_url: z.string(),
  model: z.string(),
  tavily_api_key_masked: z.string().default(""),
  tavily_api_key_is_set: z.boolean().default(false),
  serper_api_key_masked: z.string().default(""),
  serper_api_key_is_set: z.boolean().default(false),
  brave_search_api_key_masked: z.string().default(""),
  brave_search_api_key_is_set: z.boolean().default(false),
  ui_theme: UiTheme.default("agent_warm_paper"),
});
export type LlmSettingsOut = z.infer<typeof LlmSettingsOut>;

export const PlanCardPayload = z.object({
  has_plan: z.boolean(),
  title: z.string(),
  message: z.string().optional(),
  week_start: z.string().optional(),
  week_end: z.string().optional(),
  completed_count: z.number().int().optional(),
  total_count: z.number().int().optional(),
  completion_rate: z.number(),
  tasks_today: z.array(DailyTaskOut),
});
export type PlanCardPayload = z.infer<typeof PlanCardPayload>;

export const ConversationFile = z.object({
  file_id: z.string(),
  filename: z.string(),
  file_path: z.string(),
  size: z.number().int(),
  uploaded_at: z.string(),
});
export type ConversationFile = z.infer<typeof ConversationFile>;
