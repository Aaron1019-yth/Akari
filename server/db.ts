import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export const DATA_DIR = path.resolve(process.cwd(), ".akari");
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
  `);
}
