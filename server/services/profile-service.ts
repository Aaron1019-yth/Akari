import { db } from "../db.js";
import type { ModuleRow, StudentProfileRow } from "../types.js";
import { randomUUID } from "crypto";

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

function parseJsonDict(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// ── Public API ──

export interface ProfileOut {
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

export function serializeProfile(profile: StudentProfileRow | undefined | null): ProfileOut | null {
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

/** Recalculate module correct_rate & proficiency from practice sessions. */
export function recalculateModule(module: ModuleRow): void {
  const sessions = db.prepare(
    "SELECT question_count, correct_count, accuracy, started_at FROM practice_sessions WHERE module_id = ? ORDER BY started_at DESC"
  ).all(module.id) as { question_count: number; correct_count: number; accuracy: number; started_at: string }[];

  let totalQuestions = 0;
  let totalCorrect = 0;
  for (const s of sessions) {
    totalQuestions += s.question_count;
    totalCorrect += s.correct_count;
  }
  const correctRate = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;

  // Consistency from recent 5 sessions
  let consistency = 0.5;
  const recent = sessions.slice(0, 5);
  if (recent.length >= 2) {
    const accuracies = recent.map((s) => s.accuracy);
    const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    const variance = accuracies.reduce((sum, a) => sum + (a - mean) ** 2, 0) / accuracies.length;
    const stdev = Math.sqrt(variance);
    consistency = Math.max(0, 1 - stdev);
  }

  // Recency
  let recency = 0;
  if (sessions.length > 0) {
    const days = Math.floor((Date.now() - new Date(sessions[0].started_at + "Z").getTime()) / 86400000);
    recency = Math.max(0, 1 - days / 30);
  }

  const proficiency = Math.round((correctRate * 0.6 + consistency * 0.2 + recency * 0.2) * 10000) / 10000;

  db.prepare(
    "UPDATE modules SET total_questions = ?, correct_rate = ?, proficiency = ? WHERE id = ?"
  ).run(totalQuestions, Math.round(correctRate * 10000) / 10000, proficiency, module.id);
}

/** Recalculate all module stats + student profile for a goal. Creates profile row if missing. */
export function recalculateProfile(goalId: string): StudentProfileRow {
  const trackRows = db.prepare(
    "SELECT * FROM tracks WHERE goal_id = ? ORDER BY sort_order"
  ).all(goalId) as { id: string }[];

  const allModules: ModuleRow[] = [];
  for (const track of trackRows) {
    const modules = db.prepare(
      "SELECT * FROM modules WHERE track_id = ? ORDER BY sort_order"
    ).all(track.id) as ModuleRow[];
    allModules.push(...modules);
  }

  // Recalculate each module
  for (const mod of allModules) {
    recalculateModule(mod);
  }

  // Reload modules after recalculation
  const updatedModules: ModuleRow[] = [];
  for (const track of trackRows) {
    const modules = db.prepare(
      "SELECT * FROM modules WHERE track_id = ? ORDER BY sort_order"
    ).all(track.id) as ModuleRow[];
    updatedModules.push(...modules);
  }

  const proficiencies: Record<string, number> = {};
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  for (const m of updatedModules) {
    proficiencies[m.id] = m.proficiency;
    if (m.proficiency >= 0.7) strengths.push(m.name);
    if (m.proficiency < 0.4) weaknesses.push(m.name);
  }

  const avgRow = db.prepare(
    "SELECT AVG(actual_minutes) as avg_minutes FROM daily_tasks WHERE actual_minutes > 0"
  ).get() as { avg_minutes: number | null } | undefined;
  const avgMinutes = Math.round(avgRow?.avg_minutes ?? 0);

  let profile = db.prepare(
    "SELECT * FROM student_profiles WHERE goal_id = ?"
  ).get(goalId) as StudentProfileRow | undefined;

  const now = new Date().toISOString();

  if (profile) {
    db.prepare(
      `UPDATE student_profiles
       SET strengths_json = ?, weaknesses_json = ?, module_proficiencies_json = ?,
           avg_daily_study_minutes = ?, last_updated = ?
       WHERE id = ?`
    ).run(
      JSON.stringify(strengths),
      JSON.stringify(weaknesses),
      JSON.stringify(proficiencies),
      avgMinutes,
      now,
      profile.id,
    );
  } else {
    const profileId = `profile_${randomUUID().replace(/-/g, "")}`;
    db.prepare(
      `INSERT INTO student_profiles
         (id, goal_id, strengths_json, weaknesses_json, module_proficiencies_json,
          preferred_time_slots_json, avg_daily_study_minutes, learning_style, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
  }

  return db.prepare("SELECT * FROM student_profiles WHERE goal_id = ?").get(goalId) as StudentProfileRow;
}
