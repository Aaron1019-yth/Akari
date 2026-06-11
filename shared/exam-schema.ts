export type GoalStatus = "active" | "completed" | "paused" | "archived";
export type TrackType = "xingce" | "shenlun" | "interview";
export type TaskType = "study" | "practice" | "mock_exam" | "review" | "essay";
export type TimeSlot = "morning" | "afternoon" | "evening";
export type TaskStatus = "pending" | "in_progress" | "completed" | "skipped";
export type UiTheme = "agent_warm_paper" | "akari_cool" | "classic_beige";
export type TaskDifficulty = "easy" | "ok" | "hard";
export type TaskFocus = "focused" | "normal" | "distracted" | "tired";
export type LearningArtifactSource = "workspace_file" | "chat" | "manual";
export type ErrorCandidateStatus = "pending" | "confirmed" | "dismissed";
export type StudyReviewScope = "daily" | "weekly";

export interface Module {
  id: string;
  track_id: string;
  name: string;
  sort_order: number;
  weight: number;
  correct_rate: number;
  total_questions: number;
  proficiency: number;
}

export interface Track {
  id: string;
  goal_id: string;
  type: TrackType;
  title: string;
  target_score: number;
  current_score: number;
  sort_order: number;
  modules: Module[];
}

export interface DailyTask {
  id: string;
  weekly_plan_id: string;
  module_id: string;
  date: string;
  title: string;
  type: TaskType;
  subject: string;
  question_count: number;
  estimated_minutes: number;
  actual_minutes: number;
  time_slot: TimeSlot;
  status: TaskStatus;
  sort_order: number;
}

export interface TaskFeedback {
  id: string;
  daily_task_id: string;
  actual_minutes: number;
  difficulty: TaskDifficulty;
  focus: TaskFocus;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface LearningArtifact {
  id: string;
  source_type: LearningArtifactSource;
  source_ref: string;
  daily_task_id: string | null;
  title: string;
  raw_text: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ErrorCandidate {
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
  status: ErrorCandidateStatus;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

export interface StudyReview {
  id: string;
  scope: StudyReviewScope;
  period_start: string;
  period_end: string;
  summary: string;
  stats: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PlanVersionSummary {
  goal_id: string;
  title: string;
  status: GoalStatus;
  created_at: string;
  exam_date: string;
  week_start: string | null;
  week_end: string | null;
  task_count: number;
  completed_count: number;
  estimated_minutes: number;
  actual_minutes: number;
  document_path: string;
}

export interface WeeklyPlan {
  id: string;
  goal_id: string;
  week_start: string;
  week_end: string;
  focus_areas: string[];
  target_correct_rate: number;
  summary: string;
  tasks: DailyTask[];
}

export interface StudentProfile {
  id: string;
  goal_id: string;
  strengths: string[];
  weaknesses: string[];
  module_proficiencies: Record<string, number>;
  preferred_time_slots: string[];
  avg_daily_study_minutes: number;
  learning_style: string;
  last_updated: string;
}

export interface GoalTree {
  id: string;
  title: string;
  description: string;
  target_score: number;
  current_estimated_score: number;
  exam_date: string;
  created_at: string;
  status: GoalStatus;
  tracks: Track[];
  weekly_plan: WeeklyPlan | null;
  profile: StudentProfile | null;
}

export interface GeneratePlanRequest {
  target_score: number;
  exam_date: string;
  strengths: string[];
  weaknesses: string[];
}

export interface TaskCreateRequest {
  title: string;
  type: TaskType;
  subject: string;
  estimated_minutes: number;
  question_count?: number;
  time_slot: TimeSlot;
  date?: string;
  module_id?: string;
}

export interface ChatRequest {
  session_id: string;
  message: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatResponse {
  session_id: string;
  message: ChatMessage;
}

export interface FileNode {
  name: string;
  type: "file" | "directory";
  path: string;
  size: number;
  modified_at: string;
  children: FileNode[] | null;
}

export interface PlanCardPayload {
  has_plan: boolean;
  title: string;
  message?: string;
  week_start?: string;
  week_end?: string;
  completed_count?: number;
  total_count?: number;
  completion_rate: number;
  tasks_today: DailyTask[];
}
