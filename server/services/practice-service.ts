import { createHash, randomUUID } from "crypto";
import { db } from "../db.js";
import type {
  PracticeSessionRequest,
  ErrorBatchRequest,
  PracticeSessionRow,
  DailyTaskRow,
  ModuleRow,
} from "../types.js";
import { recalculateModule, recalculateProfile, serializeProfile } from "./profile-service.js";
import { getActiveGoal, buildGoalTree } from "./planner-service.js";

export class PracticeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PracticeError";
  }
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function hashQuestion(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export function createPracticeSession(data: PracticeSessionRequest) {
  if (data.correct_count > data.question_count) {
    throw new PracticeError("correct_count cannot exceed question_count");
  }

  const task = db.prepare("SELECT * FROM daily_tasks WHERE id = ?").get(data.daily_task_id) as DailyTaskRow | undefined;
  const module = db.prepare("SELECT * FROM modules WHERE id = ?").get(data.module_id) as ModuleRow | undefined;
  if (!task || !module) {
    throw new PracticeError("Task or module not found");
  }
  if (task.module_id !== module.id) {
    throw new PracticeError("Task does not belong to module");
  }

  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - data.duration_seconds * 1000);
  const accuracy = Math.round((data.correct_count / data.question_count) * 10000) / 10000;
  const sessionId = id("session");

  db.prepare(`INSERT INTO practice_sessions (id, daily_task_id, module_id, started_at, ended_at, question_count, correct_count, accuracy, duration_seconds, tags_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    sessionId, task.id, module.id, startedAt.toISOString(), endedAt.toISOString(),
    data.question_count, data.correct_count, accuracy, data.duration_seconds,
    JSON.stringify(data.tags ?? []),
  );

  const actualMinutes = Math.max(task.actual_minutes, Math.round(data.duration_seconds / 60));
  db.prepare("UPDATE daily_tasks SET actual_minutes = ? WHERE id = ?").run(actualMinutes, task.id);
  if (task.type === "practice" || task.type === "mock_exam") {
    db.prepare("UPDATE daily_tasks SET status = 'completed' WHERE id = ?").run(task.id);
  }

  recalculateModule(module.id);
  const goal = getActiveGoal();
  const profile = goal ? recalculateProfile(goal) : null;

  const updatedTask = db.prepare("SELECT * FROM daily_tasks WHERE id = ?").get(task.id) as DailyTaskRow;
  const updatedModule = db.prepare("SELECT * FROM modules WHERE id = ?").get(module.id) as ModuleRow;

  return {
    session: {
      id: sessionId,
      daily_task_id: task.id,
      module_id: module.id,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      question_count: data.question_count,
      correct_count: data.correct_count,
      accuracy,
      duration_seconds: data.duration_seconds,
      tags: data.tags ?? [],
    },
    task: updatedTask,
    module: updatedModule,
    profile: serializeProfile(profile),
  };
}

export function createErrorBatch(data: ErrorBatchRequest) {
  const session = db.prepare("SELECT * FROM practice_sessions WHERE id = ?").get(data.practice_session_id) as PracticeSessionRow | undefined;
  if (!session) {
    throw new PracticeError("Practice session not found");
  }

  let created = 0;
  let skipped = 0;
  const touchedModules = new Set<string>();

  for (const item of data.errors) {
    const qHash = hashQuestion(item.question_text);
    const existing = db.prepare(
      "SELECT id FROM error_records WHERE practice_session_id = ? AND question_hash = ?"
    ).get(data.practice_session_id, qHash);
    if (existing) {
      skipped++;
      continue;
    }
    db.prepare(`INSERT INTO error_records (id, practice_session_id, module_id, question_hash, question_text, user_answer, correct_answer, explanation, tags_json, recorded_at, reviewed_count, mastered)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id("error"), data.practice_session_id, item.module_id, qHash, item.question_text,
      item.user_answer, item.correct_answer, item.explanation ?? "",
      JSON.stringify(item.tags ?? []), new Date().toISOString(), 0, 0,
    );
    touchedModules.add(item.module_id);
    created++;
  }

  let profile = null;
  for (const moduleId of touchedModules) {
    recalculateModule(moduleId);
  }
  if (touchedModules.size > 0) {
    const goal = getActiveGoal();
    if (goal) {
      profile = recalculateProfile(goal);
    }
  }

  return {
    created_count: created,
    skipped_count: skipped,
    profile: serializeProfile(profile),
  };
}
