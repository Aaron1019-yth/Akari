import { randomUUID } from "crypto";
import { db } from "../db.js";
import {
  buildGoalTree,
  getActiveGoal,
} from "./planner-service.js";
import { syncActivePlanDocument } from "./plan-document-service.js";
import type {
  DailyTaskRow,
  ErrorCandidateGenerateRequest,
  ErrorCandidateOut,
  ErrorCandidatePatchRequest,
  ErrorCandidateRow,
  GoalTree,
  LearningArtifactOut,
  LearningArtifactRequest,
  LearningArtifactRow,
  ModuleRow,
  StudyReviewOut,
  StudyReviewRow,
  TaskFeedbackOut,
  TaskFeedbackRequest,
  TaskFeedbackRow,
  WeeklyReviewRequest,
} from "../types.js";

export class FeedbackError extends Error {}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function taskFeedbackToOut(row: TaskFeedbackRow): TaskFeedbackOut {
  return {
    id: row.id,
    daily_task_id: row.daily_task_id,
    actual_minutes: row.actual_minutes,
    difficulty: row.difficulty as TaskFeedbackOut["difficulty"],
    focus: row.focus as TaskFeedbackOut["focus"],
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function artifactToOut(row: LearningArtifactRow): LearningArtifactOut {
  return {
    id: row.id,
    source_type: row.source_type as LearningArtifactOut["source_type"],
    source_ref: row.source_ref,
    daily_task_id: row.daily_task_id,
    title: row.title,
    raw_text: row.raw_text,
    metadata: parseJsonObject(row.metadata_json),
    created_at: row.created_at,
  };
}

function candidateToOut(row: ErrorCandidateRow): ErrorCandidateOut {
  return {
    id: row.id,
    artifact_id: row.artifact_id,
    daily_task_id: row.daily_task_id,
    module_id: row.module_id,
    subject: row.subject,
    question_summary: row.question_summary,
    mistake_summary: row.mistake_summary,
    cause: row.cause,
    suggested_fix: row.suggested_fix,
    confidence: row.confidence,
    status: row.status as ErrorCandidateOut["status"],
    created_at: row.created_at,
    updated_at: row.updated_at,
    confirmed_at: row.confirmed_at,
  };
}

function reviewToOut(row: StudyReviewRow): StudyReviewOut {
  return {
    id: row.id,
    scope: row.scope as StudyReviewOut["scope"],
    period_start: row.period_start,
    period_end: row.period_end,
    summary: row.summary,
    stats: parseJsonObject(row.stats_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getTask(taskId: string): DailyTaskRow {
  const task = db.prepare("SELECT * FROM daily_tasks WHERE id = ?").get(taskId) as DailyTaskRow | undefined;
  if (!task) throw new FeedbackError("Task not found");
  return task;
}

function getArtifact(artifactId: string): LearningArtifactRow {
  const artifact = db.prepare("SELECT * FROM learning_artifacts WHERE id = ?").get(artifactId) as LearningArtifactRow | undefined;
  if (!artifact) throw new FeedbackError("Artifact not found");
  return artifact;
}

function latestFeedbackForTasks(taskIds: string[]): TaskFeedbackOut[] {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map(() => "?").join(", ");
  const rows = db.prepare(
    `SELECT tf.*
     FROM task_feedback tf
     JOIN (
       SELECT daily_task_id, MAX(updated_at) AS max_updated_at
       FROM task_feedback
       WHERE daily_task_id IN (${placeholders})
       GROUP BY daily_task_id
     ) latest
       ON latest.daily_task_id = tf.daily_task_id
      AND latest.max_updated_at = tf.updated_at
     ORDER BY tf.updated_at DESC`
  ).all(...taskIds) as TaskFeedbackRow[];
  return rows.map(taskFeedbackToOut);
}

export function saveTaskFeedback(
  taskId: string,
  payload: TaskFeedbackRequest
): { feedback: TaskFeedbackOut; goal: GoalTree } {
  const now = nowIso();
  const feedbackId = id("feedback");

  const row = db.transaction(() => {
    getTask(taskId);
    db.prepare(
      `INSERT INTO task_feedback
         (id, daily_task_id, actual_minutes, difficulty, focus, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      feedbackId,
      taskId,
      payload.actual_minutes,
      payload.difficulty,
      payload.focus,
      payload.note,
      now,
      now,
    );

    db.prepare(
      "UPDATE daily_tasks SET actual_minutes = ?, status = 'completed' WHERE id = ?"
    ).run(payload.actual_minutes, taskId);

    return db.prepare("SELECT * FROM task_feedback WHERE id = ?").get(feedbackId) as TaskFeedbackRow;
  })();

  const goal = getActiveGoal();
  if (!goal) throw new FeedbackError("Active goal not found");
  syncActivePlanDocument();
  return { feedback: taskFeedbackToOut(row), goal: buildGoalTree(goal) };
}

function createLearningArtifactRow(payload: LearningArtifactRequest): LearningArtifactRow {
  if (payload.daily_task_id) getTask(payload.daily_task_id);
  const artifactId = id("artifact");
  const now = nowIso();
  db.prepare(
    `INSERT INTO learning_artifacts
       (id, source_type, source_ref, daily_task_id, title, raw_text, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    artifactId,
    payload.source_type,
    payload.source_ref,
    payload.daily_task_id ?? null,
    payload.title,
    payload.raw_text,
    JSON.stringify(payload.metadata),
    now,
  );
  return db.prepare("SELECT * FROM learning_artifacts WHERE id = ?").get(artifactId) as LearningArtifactRow;
}

export function createLearningArtifact(payload: LearningArtifactRequest): LearningArtifactOut {
  return artifactToOut(createLearningArtifactRow(payload));
}

function modulesForActiveGoal(): ModuleRow[] {
  const goal = getActiveGoal();
  if (!goal) return [];
  return db.prepare(
    `SELECT m.*
     FROM modules m
     JOIN tracks t ON m.track_id = t.id
     WHERE t.goal_id = ?
     ORDER BY t.sort_order, m.sort_order`
  ).all(goal.id) as ModuleRow[];
}

function inferModule(text: string, dailyTaskId: string | null): ModuleRow | undefined {
  if (dailyTaskId) {
    const task = db.prepare("SELECT * FROM daily_tasks WHERE id = ?").get(dailyTaskId) as DailyTaskRow | undefined;
    if (task) {
      const module = db.prepare("SELECT * FROM modules WHERE id = ?").get(task.module_id) as ModuleRow | undefined;
      if (module) return module;
    }
  }

  const modules = modulesForActiveGoal();
  return modules.find((module) => text.includes(module.name)) || modules[0];
}

const CAUSE_RULES = [
  { keyword: "计算", cause: "计算过程不稳" },
  { keyword: "审题", cause: "审题不稳" },
];

function inferCause(text: string): string {
  return CAUSE_RULES.find((rule) => text.includes(rule.keyword))?.cause ?? "需要进一步复盘错因";
}

export function generateErrorCandidate(payload: ErrorCandidateGenerateRequest): ErrorCandidateOut {
  const artifact = payload.artifact_id ? getArtifact(payload.artifact_id) : createLearningArtifactRow({
    source_type: "manual",
    source_ref: "",
    daily_task_id: payload.daily_task_id ?? null,
    title: "手动错题材料",
    raw_text: payload.text ?? "",
    metadata: {},
  });

  const text = [artifact.title, artifact.raw_text, payload.text, payload.hint].filter(Boolean).join("\n");
  const dailyTaskId = payload.daily_task_id ?? artifact.daily_task_id;
  if (dailyTaskId) getTask(dailyTaskId);
  const module = inferModule(text, dailyTaskId);
  const now = nowIso();
  const candidateId = id("candidate");
  const questionSummary = text.trim().slice(0, 120) || "待补充题目摘要";
  const cause = inferCause(text);

  db.prepare(
    `INSERT INTO error_candidates
       (id, artifact_id, daily_task_id, module_id, subject, question_summary,
        mistake_summary, cause, suggested_fix, confidence, status, created_at, updated_at, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    candidateId,
    artifact.id,
    dailyTaskId ?? null,
    module?.id ?? null,
    module?.name ?? "",
    questionSummary,
    payload.hint || "用户提交了需要归因的错题材料",
    cause,
    module ? `复盘${module.name}相关基础方法，并做同类题巩固。` : "补充题目信息后再复盘同类题。",
    module ? 0.65 : 0.35,
    "pending",
    now,
    now,
    null,
  );

  const row = db.prepare("SELECT * FROM error_candidates WHERE id = ?").get(candidateId) as ErrorCandidateRow;
  return candidateToOut(row);
}

export function listErrorCandidates(status?: string): ErrorCandidateOut[] {
  const rows = status
    ? db.prepare("SELECT * FROM error_candidates WHERE status = ? ORDER BY updated_at DESC").all(status) as ErrorCandidateRow[]
    : db.prepare("SELECT * FROM error_candidates ORDER BY updated_at DESC").all() as ErrorCandidateRow[];
  return rows.map(candidateToOut);
}

export function updateErrorCandidate(
  candidateId: string,
  payload: ErrorCandidatePatchRequest
): ErrorCandidateOut {
  const existing = db.prepare("SELECT * FROM error_candidates WHERE id = ?").get(candidateId) as ErrorCandidateRow | undefined;
  if (!existing) throw new FeedbackError("Candidate not found");
  if (payload.daily_task_id) getTask(payload.daily_task_id);
  if (payload.module_id) {
    const module = db.prepare("SELECT * FROM modules WHERE id = ?").get(payload.module_id) as ModuleRow | undefined;
    if (!module) throw new FeedbackError("Module not found");
  }

  const now = nowIso();
  const fieldMap: [string, unknown][] = [
    ["status", payload.status],
    ["daily_task_id", payload.daily_task_id],
    ["module_id", payload.module_id],
    ["subject", payload.subject],
    ["question_summary", payload.question_summary],
    ["mistake_summary", payload.mistake_summary],
    ["cause", payload.cause],
    ["suggested_fix", payload.suggested_fix],
    ["confidence", payload.confidence],
  ];
  const setClauses = ["updated_at = ?"];
  const values: unknown[] = [now];

  for (const [column, value] of fieldMap) {
    if (value !== undefined) {
      setClauses.push(`${column} = ?`);
      values.push(value);
    }
  }

  if (payload.status === "confirmed") {
    setClauses.push("confirmed_at = COALESCE(confirmed_at, ?)");
    values.push(now);
  } else if (payload.status === "pending" || payload.status === "dismissed") {
    setClauses.push("confirmed_at = NULL");
  }

  values.push(candidateId);
  db.prepare(`UPDATE error_candidates SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
  const row = db.prepare("SELECT * FROM error_candidates WHERE id = ?").get(candidateId) as ErrorCandidateRow;
  return candidateToOut(row);
}

export function getDailyFeedback(date: string): {
  date: string;
  tasks: DailyTaskRow[];
  feedback: TaskFeedbackOut[];
  confirmed_errors: ErrorCandidateOut[];
  stats: Record<string, unknown>;
  review: StudyReviewOut | null;
} {
  const tasks = db.prepare(
    `SELECT dt.* FROM daily_tasks dt
     JOIN weekly_plans wp ON wp.id = dt.weekly_plan_id
     JOIN goals g ON g.id = wp.goal_id
     WHERE dt.date = ? AND g.status = 'active'
     ORDER BY
       CASE dt.time_slot WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'evening' THEN 2 END,
       dt.sort_order`
  ).all(date) as DailyTaskRow[];
  const feedback = latestFeedbackForTasks(tasks.map((task) => task.id));
  const confirmedRows = db.prepare(
    `SELECT ec.*
     FROM error_candidates ec
     LEFT JOIN daily_tasks dt ON dt.id = ec.daily_task_id
     LEFT JOIN weekly_plans wp ON wp.id = dt.weekly_plan_id
     LEFT JOIN goals g ON g.id = wp.goal_id
     WHERE ec.status = 'confirmed'
       AND (g.status = 'active' OR dt.id IS NULL)
       AND (dt.date = ? OR substr(ec.confirmed_at, 1, 10) = ?)
     ORDER BY ec.confirmed_at DESC`
  ).all(date, date) as ErrorCandidateRow[];
  const confirmedErrors = confirmedRows.map(candidateToOut);
  const reviewRow = db.prepare(
    "SELECT * FROM study_reviews WHERE scope = 'daily' AND period_start = ? AND period_end = ?"
  ).get(date, date) as StudyReviewRow | undefined;
  const topCauses = [...new Set(confirmedErrors.map((candidate) => candidate.cause).filter(Boolean))].slice(0, 5);

  return {
    date,
    tasks,
    feedback,
    confirmed_errors: confirmedErrors,
    stats: {
      completed_count: tasks.filter((task) => task.status === "completed").length,
      total_count: tasks.length,
      actual_minutes: feedback.reduce((sum, item) => sum + item.actual_minutes, 0),
      hard_count: feedback.filter((item) => item.difficulty === "hard").length,
      confirmed_error_count: confirmedErrors.length,
      top_causes: topCauses,
    },
    review: reviewRow ? reviewToOut(reviewRow) : null,
  };
}

export function createWeeklyReview(payload: WeeklyReviewRequest): StudyReviewOut {
  const existing = db.prepare(
    "SELECT * FROM study_reviews WHERE scope = 'weekly' AND period_start = ? AND period_end = ?"
  ).get(payload.week_start, payload.week_end) as StudyReviewRow | undefined;
  if (existing && !payload.regenerate) return reviewToOut(existing);

  const tasks = db.prepare(
    `SELECT dt.* FROM daily_tasks dt
     JOIN weekly_plans wp ON wp.id = dt.weekly_plan_id
     JOIN goals g ON g.id = wp.goal_id
     WHERE dt.date >= ? AND dt.date <= ? AND g.status = 'active'
     ORDER BY dt.date, dt.sort_order`
  ).all(payload.week_start, payload.week_end) as DailyTaskRow[];
  const feedback = latestFeedbackForTasks(tasks.map((task) => task.id));
  const confirmed = db.prepare(
    `SELECT ec.*
     FROM error_candidates ec
     LEFT JOIN daily_tasks dt ON dt.id = ec.daily_task_id
     LEFT JOIN weekly_plans wp ON wp.id = dt.weekly_plan_id
     LEFT JOIN goals g ON g.id = wp.goal_id
     WHERE ec.status = 'confirmed'
       AND (g.status = 'active' OR dt.id IS NULL)
       AND (dt.date BETWEEN ? AND ? OR substr(ec.confirmed_at, 1, 10) BETWEEN ? AND ?)
     ORDER BY ec.confirmed_at DESC`
  ).all(payload.week_start, payload.week_end, payload.week_start, payload.week_end) as ErrorCandidateRow[];
  const confirmedErrors = confirmed.map(candidateToOut);
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const actualMinutes = feedback.reduce((sum, item) => sum + item.actual_minutes, 0);
  const topCauses = [...new Set(confirmedErrors.map((candidate) => candidate.cause).filter(Boolean))].slice(0, 5);
  const topSubjects = [...new Set(confirmedErrors.map((candidate) => candidate.subject).filter(Boolean))].slice(0, 5);
  const stats = {
    completion_rate: total ? Math.round((completed / total) * 100) / 100 : 0,
    completed_count: completed,
    total_count: total,
    actual_minutes: actualMinutes,
    confirmed_error_count: confirmedErrors.length,
    top_subjects: topSubjects,
    top_causes: topCauses,
  };
  const summary = `本周完成 ${completed}/${total} 个任务，实际学习 ${actualMinutes} 分钟，确认 ${confirmedErrors.length} 条错题归因。`
    + (topCauses.length ? ` 高频原因：${topCauses.join("、")}。` : "");
  const now = nowIso();

  if (existing) {
    db.prepare(
      `UPDATE study_reviews
       SET summary = ?, stats_json = ?, updated_at = ?
       WHERE id = ?`
    ).run(summary, JSON.stringify(stats), now, existing.id);
    const row = db.prepare("SELECT * FROM study_reviews WHERE id = ?").get(existing.id) as StudyReviewRow;
    return reviewToOut(row);
  }

  const reviewId = id("review");
  db.prepare(
    `INSERT INTO study_reviews
       (id, scope, period_start, period_end, summary, stats_json, created_at, updated_at)
     VALUES (?, 'weekly', ?, ?, ?, ?, ?, ?)`
  ).run(reviewId, payload.week_start, payload.week_end, summary, JSON.stringify(stats), now, now);
  const row = db.prepare("SELECT * FROM study_reviews WHERE id = ?").get(reviewId) as StudyReviewRow;
  return reviewToOut(row);
}

export function getWeeklyReview(weekStart: string): StudyReviewOut | null {
  const row = db.prepare(
    "SELECT * FROM study_reviews WHERE scope = 'weekly' AND period_start = ?"
  ).get(weekStart) as StudyReviewRow | undefined;
  return row ? reviewToOut(row) : null;
}
