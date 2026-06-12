# Akari V2 Feedback Design

> 过程归档：本文件已合并进 `../../V2-design.md`，当前事实以根目录权威文档和代码为准。

Last updated: 2026-06-11

V2 turns normal study activity into structured feedback. The product should avoid a separate daily form as the primary workflow; feedback is captured where the user already is: task cards, uploaded materials, and chat.

## MVP Goal

Users leave learning traces while completing tasks, uploading question materials, and asking questions. Akari converts those traces into task feedback and confirmed error attribution, then generates daily and weekly reviews.

## Core Workflow

1. User completes a task in the workbench.
2. The completed task card asks for lightweight feedback:
   - actual minutes
   - difficulty: easy / ok / hard
   - focus: focused / normal / distracted / tired
   - optional note
3. User uploads a wrong-question image/document or asks about a question in chat.
4. Agent extracts a candidate attribution:
   - source: upload / chat / manual
   - related task, if known
   - module and subject
   - question summary
   - user's mistake
   - likely cause
   - suggested fix
5. User confirms or edits the candidate before it is saved.
6. Daily and weekly summaries aggregate task feedback, study time, completion rate, confirmed error records, and repeated causes.

## Data Model Direction

Extend `DailyTask` with completion feedback instead of creating a detached daily diary first:

```ts
export type TaskDifficulty = "easy" | "ok" | "hard";
export type TaskFocus = "focused" | "normal" | "distracted" | "tired";

export interface TaskCompletionFeedback {
  difficulty: TaskDifficulty;
  focus: TaskFocus;
  note: string;
  recorded_at: string;
}
```

Persisting this can be done with nullable columns on `daily_tasks` or a separate `task_feedback` table. Prefer a separate table if feedback history or edits matter; prefer task columns if V2 needs the smallest surface.

The existing `error_records` table is practice-session-centric. V2 needs a more flexible source model because wrong-question evidence may come from chat or workspace uploads. Options:

- Add nullable source fields to `error_records`.
- Or introduce `learning_artifacts` and `error_candidates`, then confirm into `error_records`.

For MVP correctness, the second option is cleaner:

```text
learning_artifacts
  id
  source_type         upload | chat | manual
  source_ref          workspace path, session id/message id, or free-form ref
  daily_task_id       nullable
  raw_text            extracted or user-provided text
  created_at

error_candidates
  id
  artifact_id
  daily_task_id       nullable
  module_id           nullable until user confirms
  question_summary
  mistake_summary
  cause
  suggested_fix
  confidence
  status              pending | confirmed | dismissed
  created_at
  confirmed_at
```

Confirmed candidates can either become rows in `error_records` or remain in `error_candidates` with `status = confirmed`. Do not require `practice_session_id` for V2 wrong-question intake unless the user is explicitly recording a practice session.

## DB Schema Contract

V2 should use additive schema only. Do not rewrite V1 tables or require destructive migrations.

### `task_feedback`

One row per task feedback submission. For V2 MVP, the latest row per task is the active feedback; keeping history gives us room to audit edits later.

```sql
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
```

Implementation note: when feedback is saved, also update `daily_tasks.actual_minutes` and usually `daily_tasks.status = 'completed'` so existing V1 plan surfaces keep working.

### `learning_artifacts`

Raw study evidence from uploads, workspace files, chat, or manual text.

```sql
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
```

For images, V2 MVP should store the uploaded image in the workspace first, then create a `learning_artifacts` row with `source_type = 'workspace_file'` and `source_ref = '<relative workspace path>'`. If the configured LLM cannot read images, `raw_text` can be user-provided text extracted manually.

### `error_candidates`

Editable AI attribution output. This is the review queue; it is not final learning truth until confirmed.

```sql
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
```

### `study_reviews`

Cached daily/weekly review text generated from confirmed data. This keeps the UI fast and gives the user a stable report they can revisit.

```sql
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
```

## Shared Types Contract

Add these to `shared/exam-schema.ts` after V2 implementation starts, then mirror request schemas in `server/types.ts`.

```ts
export type TaskDifficulty = "easy" | "ok" | "hard";
export type TaskFocus = "focused" | "normal" | "distracted" | "tired";
export type LearningArtifactSource = "workspace_file" | "chat" | "manual";
export type ErrorCandidateStatus = "pending" | "confirmed" | "dismissed";
export type StudyReviewScope = "daily" | "weekly";

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
```

## API Direction

Initial endpoints:

```text
PATCH /api/planner/task/:taskId/feedback
POST  /api/feedback/artifacts
POST  /api/feedback/candidates/generate
GET   /api/feedback/candidates?status=pending
PATCH /api/feedback/candidates/:candidateId
GET   /api/feedback/daily?date=YYYY-MM-DD
POST  /api/feedback/weekly
GET   /api/feedback/weekly?week_start=YYYY-MM-DD
```

`POST /api/feedback/candidates/generate` should accept an artifact id or direct text. For uploaded images, V2 can start by accepting files already present in workspace and using the configured LLM vision capability only if available. If vision is unavailable, the UI should ask the user to paste the question text.

### Request / Response Contract

#### `PATCH /api/planner/task/:taskId/feedback`

Request:

```json
{
  "actual_minutes": 45,
  "difficulty": "hard",
  "focus": "normal",
  "note": "数量关系速度还是慢"
}
```

Response:

```json
{
  "feedback": {
    "id": "feedback_xxx",
    "daily_task_id": "task_xxx",
    "actual_minutes": 45,
    "difficulty": "hard",
    "focus": "normal",
    "note": "数量关系速度还是慢",
    "created_at": "2026-06-11T10:00:00.000Z",
    "updated_at": "2026-06-11T10:00:00.000Z"
  },
  "goal": { "...": "GoalTree" }
}
```

#### `POST /api/feedback/artifacts`

Request:

```json
{
  "source_type": "workspace_file",
  "source_ref": "wrong-questions/2026-06-11.png",
  "daily_task_id": "task_xxx",
  "title": "资料分析错题截图",
  "raw_text": "",
  "metadata": {
    "mime": "image/png"
  }
}
```

Response:

```json
{
  "artifact": {
    "id": "artifact_xxx",
    "source_type": "workspace_file",
    "source_ref": "wrong-questions/2026-06-11.png",
    "daily_task_id": "task_xxx",
    "title": "资料分析错题截图",
    "raw_text": "",
    "metadata": { "mime": "image/png" },
    "created_at": "2026-06-11T10:00:00.000Z"
  }
}
```

#### `POST /api/feedback/candidates/generate`

Request:

```json
{
  "artifact_id": "artifact_xxx",
  "daily_task_id": "task_xxx",
  "hint": "这道题我计算错了，帮我归因"
}
```

Response:

```json
{
  "candidate": {
    "id": "candidate_xxx",
    "artifact_id": "artifact_xxx",
    "daily_task_id": "task_xxx",
    "module_id": "module_xxx",
    "subject": "资料分析",
    "question_summary": "增长率比较题，涉及基期量计算",
    "mistake_summary": "把同比增长率方向看反",
    "cause": "审题不稳 + 公式迁移混乱",
    "suggested_fix": "复盘基期量/现期量公式，做 5 道同类限时题",
    "confidence": 0.74,
    "status": "pending",
    "created_at": "2026-06-11T10:00:00.000Z",
    "updated_at": "2026-06-11T10:00:00.000Z",
    "confirmed_at": null
  }
}
```

#### `PATCH /api/feedback/candidates/:candidateId`

Used for confirm, edit, or dismiss.

Request:

```json
{
  "status": "confirmed",
  "module_id": "module_xxx",
  "subject": "资料分析",
  "question_summary": "增长率比较题",
  "mistake_summary": "公式套反",
  "cause": "公式理解不稳",
  "suggested_fix": "建立公式卡片并做同类题"
}
```

Response:

```json
{
  "candidate": { "...": "ErrorCandidate" }
}
```

#### `GET /api/feedback/daily?date=YYYY-MM-DD`

Response:

```json
{
  "date": "2026-06-11",
  "tasks": [],
  "feedback": [],
  "confirmed_errors": [],
  "stats": {
    "completed_count": 4,
    "total_count": 6,
    "actual_minutes": 180,
    "hard_count": 2,
    "top_causes": ["公式理解不稳", "审题不稳"]
  },
  "review": null
}
```

#### `POST /api/feedback/weekly`

Request:

```json
{
  "week_start": "2026-06-08",
  "week_end": "2026-06-14",
  "regenerate": false
}
```

Response:

```json
{
  "review": {
    "id": "review_xxx",
    "scope": "weekly",
    "period_start": "2026-06-08",
    "period_end": "2026-06-14",
    "summary": "本周资料分析暴露出公式迁移问题...",
    "stats": {
      "completion_rate": 0.72,
      "actual_minutes": 760,
      "confirmed_error_count": 8,
      "top_subjects": ["资料分析", "数量关系"],
      "top_causes": ["公式理解不稳", "时间分配不合理"]
    },
    "created_at": "2026-06-11T10:00:00.000Z",
    "updated_at": "2026-06-11T10:00:00.000Z"
  }
}
```

## Frontend Direction

- Add a completion feedback popover or inline expansion on task completion.
- Keep the task card compact after feedback is saved.
- Add an "analyze wrong question" action in chat and workspace preview.
- Show AI attribution as an editable confirmation card before saving.
- Add a simple review surface in the workbench for daily and weekly summaries.

## Implementation Steps

1. Add shared V2 types and server Zod schemas.
2. Add DB tables in `server/db.ts` with additive `CREATE TABLE IF NOT EXISTS` statements.
3. Add `server/services/feedback-service.ts` for task feedback, artifact creation, candidate CRUD, aggregation, and review caching.
4. Add `server/api/feedback.ts` and mount it under `/api/feedback`.
5. Extend planner task feedback endpoint, either in `server/api/planner.ts` or as a feedback route that also updates tasks.
6. Add backend tests for task feedback, artifact creation, candidate confirm/dismiss, and daily aggregation.
7. Add frontend API client types/methods.
8. Add task completion feedback UI.
9. Add candidate confirmation card in chat/workspace flows.
10. Add daily/weekly review surface.

## Safety Boundary

AI extraction must not silently write to the final error dataset. Every candidate attribution needs one of:

- user confirm
- user edit then confirm
- user dismiss

This keeps casual questions, uncertain OCR, and hallucinated module attribution from polluting weekly reports.

## V2 Non-Goals

- No autonomous full-history mining without user confirmation.
- No custom OCR or model training.
- No question-generation Agent.
- No radar charts or trend dashboards.
- No essay grading.
- No V3 adaptive plan diff or automatic next-week rewrite.
