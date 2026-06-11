import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export const DATA_DIR = path.resolve(
  process.cwd(),
  process.env.AKARI_DATA_DIR || ".akari"
);
const DB_PATH = path.join(DATA_DIR, "akari.db");

// Ensure directory exists before creating database
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      target_score INTEGER NOT NULL,
      current_estimated_score INTEGER NOT NULL DEFAULT 0,
      exam_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL REFERENCES goals(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      target_score INTEGER NOT NULL,
      current_score INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL REFERENCES tracks(id),
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      weight REAL NOT NULL DEFAULT 0,
      correct_rate REAL NOT NULL DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 0,
      proficiency REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS weekly_plans (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL REFERENCES goals(id),
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      focus_areas_json TEXT NOT NULL DEFAULT '[]',
      target_correct_rate REAL NOT NULL DEFAULT 0,
      summary TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS daily_tasks (
      id TEXT PRIMARY KEY,
      weekly_plan_id TEXT NOT NULL REFERENCES weekly_plans(id),
      module_id TEXT NOT NULL REFERENCES modules(id),
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      question_count INTEGER NOT NULL DEFAULT 0,
      estimated_minutes INTEGER NOT NULL DEFAULT 0,
      actual_minutes INTEGER NOT NULL DEFAULT 0,
      time_slot TEXT NOT NULL,
      status TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS practice_sessions (
      id TEXT PRIMARY KEY,
      daily_task_id TEXT NOT NULL REFERENCES daily_tasks(id),
      module_id TEXT NOT NULL REFERENCES modules(id),
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      question_count INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      accuracy REAL NOT NULL,
      duration_seconds INTEGER NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS error_records (
      id TEXT PRIMARY KEY,
      practice_session_id TEXT NOT NULL REFERENCES practice_sessions(id),
      module_id TEXT NOT NULL REFERENCES modules(id),
      question_hash TEXT NOT NULL,
      question_text TEXT NOT NULL,
      user_answer TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      recorded_at TEXT NOT NULL,
      reviewed_count INTEGER NOT NULL DEFAULT 0,
      mastered INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS student_profiles (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL UNIQUE REFERENCES goals(id),
      strengths_json TEXT NOT NULL DEFAULT '[]',
      weaknesses_json TEXT NOT NULL DEFAULT '[]',
      module_proficiencies_json TEXT NOT NULL DEFAULT '{}',
      preferred_time_slots_json TEXT NOT NULL DEFAULT '[]',
      avg_daily_study_minutes INTEGER NOT NULL DEFAULT 0,
      learning_style TEXT NOT NULL DEFAULT '',
      last_updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_feedback (
      id TEXT PRIMARY KEY,
      daily_task_id TEXT NOT NULL REFERENCES daily_tasks(id) ON DELETE CASCADE,
      actual_minutes INTEGER NOT NULL DEFAULT 0,
      difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'ok', 'hard')),
      focus TEXT NOT NULL CHECK (focus IN ('focused', 'normal', 'distracted', 'tired')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_task_feedback_task
      ON task_feedback(daily_task_id);

    CREATE TABLE IF NOT EXISTS learning_artifacts (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL CHECK (source_type IN ('workspace_file', 'chat', 'manual')),
      source_ref TEXT NOT NULL DEFAULT '',
      daily_task_id TEXT REFERENCES daily_tasks(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT '',
      raw_text TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_learning_artifacts_task
      ON learning_artifacts(daily_task_id);

    CREATE INDEX IF NOT EXISTS idx_learning_artifacts_source
      ON learning_artifacts(source_type, source_ref);

    CREATE TABLE IF NOT EXISTS error_candidates (
      id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL REFERENCES learning_artifacts(id) ON DELETE CASCADE,
      daily_task_id TEXT REFERENCES daily_tasks(id) ON DELETE SET NULL,
      module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
      subject TEXT NOT NULL DEFAULT '',
      question_summary TEXT NOT NULL DEFAULT '',
      mistake_summary TEXT NOT NULL DEFAULT '',
      cause TEXT NOT NULL DEFAULT '',
      suggested_fix TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'dismissed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      confirmed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_error_candidates_status
      ON error_candidates(status);

    CREATE INDEX IF NOT EXISTS idx_error_candidates_task
      ON error_candidates(daily_task_id);

    CREATE INDEX IF NOT EXISTS idx_error_candidates_module
      ON error_candidates(module_id);

    CREATE TABLE IF NOT EXISTS study_reviews (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK (scope IN ('daily', 'weekly')),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      stats_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(scope, period_start, period_end)
    );
  `);
}
