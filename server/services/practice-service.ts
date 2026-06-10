import { createHash, randomUUID } from "crypto";
import { db } from "../db.js";
import type {
  PracticeSessionRequest,
  PracticeSessionResponse,
  ErrorBatchRequest,
  ErrorBatchResponse,
  PracticeSessionRow,
  DailyTaskRow,
  DailyTaskOut,
  ModuleRow,
  ModuleOut,
} from "../types.js";
import {
  recalculateModule,
  recalculateProfile,
  serializeProfile,
} from "./profile-service.js";

export class PracticeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PracticeError";
  }
}

function genId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function hashQuestion(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export function createPracticeSession(
  data: PracticeSessionRequest,
): PracticeSessionResponse {
  if (data.correct_count > data.question_count) {
    throw new PracticeError("correct_count cannot exceed question_count");
  }

  const task = db
    .prepare("SELECT * FROM daily_tasks WHERE id = ?")
    .get(data.daily_task_id) as DailyTaskRow | undefined;
  const mod = db
    .prepare("SELECT * FROM modules WHERE id = ?")
    .get(data.module_id) as ModuleRow | undefined;

  if (!task || !mod) {
    throw new PracticeError("Task or module not found");
  }
  if (task.module_id !== mod.id) {
    throw new PracticeError("Task does not belong to module");
  }

  const endedAt = new Date();
  const startedAt = new Date(
    endedAt.getTime() - data.duration_seconds * 1000,
  );

  const sessionId = genId("session");
  const accuracy =
    Math.round(
      (data.correct_count / data.question_count) * 10000,
    ) / 10000;

  db.prepare(
    `INSERT INTO practice_sessions
       (id, daily_task_id, module_id, started_at, ended_at,
        question_count, correct_count, accuracy, duration_seconds, tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sessionId,
    task.id,
    mod.id,
    startedAt.toISOString(),
    endedAt.toISOString(),
    data.question_count,
    data.correct_count,
    accuracy,
    data.duration_seconds,
    JSON.stringify(data.tags ?? []),
  );

  // Update task actual_minutes and status in one query
  const newActualMinutes = Math.max(
    task.actual_minutes,
    Math.round(data.duration_seconds / 60),
  );
  let taskStatus = task.status;
  if (task.type === "practice" || task.type === "mock_exam") {
    taskStatus = "completed";
  }

  db.prepare(
    "UPDATE daily_tasks SET actual_minutes = ?, status = ? WHERE id = ?",
  ).run(newActualMinutes, taskStatus, task.id);

  // Recalculate module proficiency, then profile for the owning goal
  recalculateModule(mod.id);

  const track = db
    .prepare("SELECT goal_id FROM tracks WHERE id = ?")
    .get(mod.track_id) as { goal_id: string } | undefined;
  if (!track) {
    throw new PracticeError("Track not found");
  }
  const profileRow = recalculateProfile(track.goal_id);

  // Read back updated rows (matches Python db.refresh)
  const updatedSession = db
    .prepare("SELECT * FROM practice_sessions WHERE id = ?")
    .get(sessionId) as PracticeSessionRow;
  const updatedTask = db
    .prepare("SELECT * FROM daily_tasks WHERE id = ?")
    .get(task.id) as DailyTaskRow;
  const updatedModule = db
    .prepare("SELECT * FROM modules WHERE id = ?")
    .get(mod.id) as ModuleRow;

  return {
    session: {
      id: updatedSession.id,
      daily_task_id: updatedSession.daily_task_id,
      module_id: updatedSession.module_id,
      started_at: updatedSession.started_at,
      ended_at: updatedSession.ended_at,
      question_count: updatedSession.question_count,
      correct_count: updatedSession.correct_count,
      accuracy: updatedSession.accuracy,
      duration_seconds: updatedSession.duration_seconds,
      tags: JSON.parse(updatedSession.tags_json) as string[],
    },
    task: updatedTask as DailyTaskOut,
    module: updatedModule as ModuleOut,
    profile: serializeProfile(profileRow),
  };
}

export function createErrorBatch(
  data: ErrorBatchRequest,
): ErrorBatchResponse {
  const session = db
    .prepare("SELECT * FROM practice_sessions WHERE id = ?")
    .get(data.practice_session_id) as PracticeSessionRow | undefined;
  if (!session) {
    throw new PracticeError("Practice session not found");
  }

  let created = 0;
  let skipped = 0;
  const touchedModules = new Set<string>();

  for (const item of data.errors) {
    const qHash = hashQuestion(item.question_text);
    const existing = db
      .prepare(
        "SELECT id FROM error_records WHERE practice_session_id = ? AND question_hash = ?",
      )
      .get(data.practice_session_id, qHash) as { id: string } | undefined;

    if (existing) {
      skipped++;
      continue;
    }

    db.prepare(
      `INSERT INTO error_records
         (id, practice_session_id, module_id, question_hash, question_text,
          user_answer, correct_answer, explanation, tags_json, recorded_at,
          reviewed_count, mastered)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      genId("error"),
      data.practice_session_id,
      item.module_id,
      qHash,
      item.question_text,
      item.user_answer,
      item.correct_answer,
      item.explanation ?? "",
      JSON.stringify(item.tags ?? []),
      new Date().toISOString(),
      0,
      0,
    );

    touchedModules.add(item.module_id);
    created++;
  }

  // Find the goal through any touched module (matches Python behavior)
  let goalId: string | null = null;
  for (const moduleId of touchedModules) {
    const row = db
      .prepare(
        `SELECT t.goal_id FROM modules m
         JOIN tracks t ON m.track_id = t.id
         WHERE m.id = ?`,
      )
      .get(moduleId) as { goal_id: string } | undefined;
    if (row) {
      goalId = row.goal_id;
    }
  }

  const profile =
    goalId !== null
      ? serializeProfile(recalculateProfile(goalId))
      : null;

  return {
    created_count: created,
    skipped_count: skipped,
    profile,
  };
}
