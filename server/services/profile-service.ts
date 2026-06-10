import { randomUUID } from "crypto";
import { db } from "../db.js";
import type {
  StudentProfileRow,
  StudentProfileOut,
  PracticeSessionRow,
  ModuleRow,
} from "../types.js";

// ── JSON helpers ──

function parseJsonList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonDict(
  raw: string | null | undefined,
): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// ── Population standard deviation (matches Python statistics.pstdev) ──

function pstdev(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

// ── Public API ──

export function serializeProfile(
  profile: StudentProfileRow | undefined | null,
): StudentProfileOut | null {
  if (!profile) return null;
  return {
    id: profile.id,
    goal_id: profile.goal_id,
    strengths: parseJsonList(profile.strengths_json),
    weaknesses: parseJsonList(profile.weaknesses_json),
    module_proficiencies: parseJsonDict(profile.module_proficiencies_json),
    preferred_time_slots: parseJsonList(profile.preferred_time_slots_json),
    avg_daily_study_minutes: profile.avg_daily_study_minutes,
    learning_style: profile.learning_style,
    last_updated: profile.last_updated,
  };
}

export function recalculateModule(moduleId: string): void {
  const sessions = db
    .prepare(
      "SELECT * FROM practice_sessions WHERE module_id = ? ORDER BY started_at DESC",
    )
    .all(moduleId) as PracticeSessionRow[];

  const totalQuestions = sessions.reduce(
    (sum, s) => sum + s.question_count,
    0,
  );
  const totalCorrect = sessions.reduce(
    (sum, s) => sum + s.correct_count,
    0,
  );
  const correctRate =
    totalQuestions > 0 ? totalCorrect / totalQuestions : 0;

  // Consistency: 1 - pstdev of last 5 session accuracies
  const recent = sessions.slice(0, 5);
  let consistency = 0.5;
  if (recent.length >= 2) {
    consistency = Math.max(
      0,
      1 - pstdev(recent.map((s) => s.accuracy)),
    );
  }

  // Recency: decays linearly over 30 days since last session
  let recency = 0;
  if (sessions.length > 0) {
    const now = new Date();
    const startedAt = new Date(sessions[0].started_at);
    const days = Math.floor(
      (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    recency = Math.max(0, 1 - days / 30);
  }

  const proficiency =
    Math.round(
      (correctRate * 0.6 + consistency * 0.2 + recency * 0.2) * 10000,
    ) / 10000;

  db.prepare(
    "UPDATE modules SET total_questions = ?, correct_rate = ?, proficiency = ? WHERE id = ?",
  ).run(
    totalQuestions,
    Math.round(correctRate * 10000) / 10000,
    proficiency,
    moduleId,
  );
}

export function recalculateProfile(goalId: string): StudentProfileRow {
  const modules = db
    .prepare(
      `SELECT m.* FROM modules m
       JOIN tracks t ON m.track_id = t.id
       WHERE t.goal_id = ?`,
    )
    .all(goalId) as ModuleRow[];

  const proficiencies: Record<string, number> = {};
  for (const m of modules) {
    proficiencies[m.id] = m.proficiency;
  }

  const strengths = modules
    .filter((m) => m.proficiency >= 0.7)
    .map((m) => m.name);
  const weaknesses = modules
    .filter((m) => m.proficiency < 0.4)
    .map((m) => m.name);

  const avgRow = db
    .prepare(
      "SELECT AVG(actual_minutes) AS avg_minutes FROM daily_tasks WHERE actual_minutes > 0",
    )
    .get() as { avg_minutes: number | null } | undefined;
  const avgMinutes = Math.floor(avgRow?.avg_minutes ?? 0);

  const now = new Date().toISOString();

  const existing = db
    .prepare("SELECT * FROM student_profiles WHERE goal_id = ?")
    .get(goalId) as StudentProfileRow | undefined;

  if (!existing) {
    const profileId = `profile_${randomUUID().replace(/-/g, "")}`;
    db.prepare(
      `INSERT INTO student_profiles
         (id, goal_id, strengths_json, weaknesses_json, module_proficiencies_json,
          preferred_time_slots_json, avg_daily_study_minutes, learning_style, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      profileId,
      goalId,
      JSON.stringify(strengths),
      JSON.stringify(weaknesses),
      JSON.stringify(proficiencies),
      "[]",
      avgMinutes,
      "steady",
      now,
    );
  } else {
    db.prepare(
      `UPDATE student_profiles
       SET strengths_json = ?, weaknesses_json = ?, module_proficiencies_json = ?,
           avg_daily_study_minutes = ?, last_updated = ?
       WHERE id = ?`,
    ).run(
      JSON.stringify(strengths),
      JSON.stringify(weaknesses),
      JSON.stringify(proficiencies),
      avgMinutes,
      now,
      existing.id,
    );
  }

  return db
    .prepare("SELECT * FROM student_profiles WHERE goal_id = ?")
    .get(goalId) as StudentProfileRow;
}
