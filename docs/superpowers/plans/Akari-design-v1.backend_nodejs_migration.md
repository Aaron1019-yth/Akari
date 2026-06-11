# Backend Node.js/TypeScript 迁移计划

> **Goal:** 将 Python/FastAPI 后端重写为 Node.js/TypeScript，API 路径、WebSocket 协议、数据库 schema 完全不变

**Architecture:** Express + `ws`（共用端口）+ better-sqlite3（裸 SQL）+ Zod（校验）+ fetch（HTTP 客户端）。前端零改动。

**Tech Stack:** TypeScript 5.9, Express, ws, better-sqlite3, Zod, tsx, Vitest

---

### Task 1: 项目脚手架 + 数据库层

**Files:**
- Create: `server/main.ts`
- Create: `server/db.ts`
- Create: `server/types.ts`
- Modify: `package.json`

- [ ] **Step 1: 创建 `server/main.ts` — Express + WebSocket 入口**

```typescript
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { initDatabase } from "./db";

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", name: "Akari" });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/api/chat/ws" });

initDatabase();

const PORT = parseInt(process.env.PORT || "8742", 10);
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Akari API running on http://127.0.0.1:${PORT}`);
});

export { app, wss };
```

- [ ] **Step 2: 创建 `server/db.ts` — better-sqlite3 连接 + 建表**

```typescript
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export const DATA_DIR = path.resolve(process.cwd(), ".akari");
const DB_PATH = path.join(DATA_DIR, "akari.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initDatabase(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      target_score INTEGER NOT NULL, current_estimated_score INTEGER NOT NULL DEFAULT 0,
      exam_date TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id),
      type TEXT NOT NULL, title TEXT NOT NULL, target_score INTEGER NOT NULL,
      current_score INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY, track_id TEXT NOT NULL REFERENCES tracks(id),
      name TEXT NOT NULL, sort_order INTEGER NOT NULL, weight REAL NOT NULL DEFAULT 0,
      correct_rate REAL NOT NULL DEFAULT 0, total_questions INTEGER NOT NULL DEFAULT 0,
      proficiency REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS weekly_plans (
      id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id),
      week_start TEXT NOT NULL, week_end TEXT NOT NULL,
      focus_areas_json TEXT NOT NULL DEFAULT '[]',
      target_correct_rate REAL NOT NULL DEFAULT 0, summary TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS daily_tasks (
      id TEXT PRIMARY KEY, weekly_plan_id TEXT NOT NULL REFERENCES weekly_plans(id),
      module_id TEXT NOT NULL REFERENCES modules(id), date TEXT NOT NULL,
      title TEXT NOT NULL, type TEXT NOT NULL, subject TEXT NOT NULL,
      question_count INTEGER NOT NULL DEFAULT 0, estimated_minutes INTEGER NOT NULL DEFAULT 0,
      actual_minutes INTEGER NOT NULL DEFAULT 0, time_slot TEXT NOT NULL,
      status TEXT NOT NULL, sort_order INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id TEXT PRIMARY KEY, daily_task_id TEXT NOT NULL REFERENCES daily_tasks(id),
      module_id TEXT NOT NULL REFERENCES modules(id),
      started_at TEXT NOT NULL, ended_at TEXT NOT NULL,
      question_count INTEGER NOT NULL, correct_count INTEGER NOT NULL,
      accuracy REAL NOT NULL, duration_seconds INTEGER NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS error_records (
      id TEXT PRIMARY KEY, practice_session_id TEXT NOT NULL REFERENCES practice_sessions(id),
      module_id TEXT NOT NULL REFERENCES modules(id),
      question_hash TEXT NOT NULL, question_text TEXT NOT NULL,
      user_answer TEXT NOT NULL, correct_answer TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]',
      recorded_at TEXT NOT NULL, reviewed_count INTEGER NOT NULL DEFAULT 0,
      mastered INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS student_profiles (
      id TEXT PRIMARY KEY, goal_id TEXT NOT NULL UNIQUE REFERENCES goals(id),
      strengths_json TEXT NOT NULL DEFAULT '[]', weaknesses_json TEXT NOT NULL DEFAULT '[]',
      module_proficiencies_json TEXT NOT NULL DEFAULT '{}',
      preferred_time_slots_json TEXT NOT NULL DEFAULT '[]',
      avg_daily_study_minutes INTEGER NOT NULL DEFAULT 0,
      learning_style TEXT NOT NULL DEFAULT '', last_updated TEXT NOT NULL
    );
  `);
}
```

- [ ] **Step 3: 创建 `server/types.ts` — Zod schemas**

```typescript
import { z } from "zod";

// Literal types
export const GoalStatus = z.enum(["active", "completed", "paused", "archived"]);
export const TrackType = z.enum(["xingce", "shenlun", "interview"]);
export const TaskType = z.enum(["study", "practice", "mock_exam", "review", "essay"]);
export const TimeSlot = z.enum(["morning", "afternoon", "evening"]);
export const TaskStatus = z.enum(["pending", "in_progress", "completed", "skipped"]);
export const UiTheme = z.enum(["agent_warm_paper", "akari_cool", "classic_beige"]);

// Request schemas
export const GeneratePlanRequest = z.object({
  target_score: z.number().int().min(1).max(300),
  exam_date: z.string(),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
});

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

export const PracticeSessionRequest = z.object({
  daily_task_id: z.string(),
  module_id: z.string(),
  question_count: z.number().int().positive(),
  correct_count: z.number().int().min(0),
  duration_seconds: z.number().int().min(0),
  tags: z.array(z.string()).default([]),
});

export const ErrorInput = z.object({
  module_id: z.string(),
  question_text: z.string(),
  user_answer: z.string(),
  correct_answer: z.string(),
  explanation: z.string().default(""),
  tags: z.array(z.string()).default([]),
});

export const ErrorBatchRequest = z.object({
  practice_session_id: z.string(),
  errors: z.array(ErrorInput),
});

export const ChatRequest = z.object({
  session_id: z.string().default("default"),
  message: z.string().min(1),
});

export const LlmSettingsUpdate = z.object({
  api_key: z.string().default(""),
  base_url: z.string(),
  model: z.string(),
  tavily_api_key: z.string().default(""),
  serper_api_key: z.string().default(""),
  brave_search_api_key: z.string().default(""),
  ui_theme: UiTheme.default("agent_warm_paper"),
});

// DB row types
export interface GoalRow {
  id: string; title: string; description: string; target_score: number;
  current_estimated_score: number; exam_date: string; created_at: string; status: string;
}
export interface TrackRow {
  id: string; goal_id: string; type: string; title: string;
  target_score: number; current_score: number; sort_order: number;
}
export interface ModuleRow {
  id: string; track_id: string; name: string; sort_order: number;
  weight: number; correct_rate: number; total_questions: number; proficiency: number;
}
export interface WeeklyPlanRow {
  id: string; goal_id: string; week_start: string; week_end: string;
  focus_areas_json: string; target_correct_rate: number; summary: string;
}
export interface DailyTaskRow {
  id: string; weekly_plan_id: string; module_id: string; date: string;
  title: string; type: string; subject: string; question_count: number;
  estimated_minutes: number; actual_minutes: number; time_slot: string;
  status: string; sort_order: number;
}
// ... (remaining row types as needed)
```

- [ ] **Step 4: 安装依赖**

```bash
npm install express ws better-sqlite3 zod uuid
npm install -D @types/express @types/ws @types/better-sqlite3 @types/uuid tsx vitest supertest @types/supertest
```

- [ ] **Step 5: 更新 `package.json` scripts**

```json
"dev:api": "tsx --watch server/main.ts",
"test:api": "vitest run"
```

- [ ] **Step 6: 验证启动**

Run: `npm run dev:api`
Expected: `Akari API running on http://127.0.0.1:8742`
Test: `curl http://127.0.0.1:8742/api/health` → `{"status":"ok","name":"Akari"}`

- [ ] **Step 7: Commit**

```bash
git add server/ package.json package-lock.json
git commit -m "feat: scaffold Express + SQLite backend"
```

---

### Task 2: LLM 客户端 + Tool Registry

**Files:**
- Create: `server/services/llm-types.ts`
- Create: `server/services/llm-client.ts`
- Create: `server/services/tool-registry.ts`

- [ ] **Step 1: 创建 LLM 类型**

```typescript
// server/services/llm-types.ts
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string | null;
  name?: string | null;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<{ content: string; details?: Record<string, unknown>; ok?: boolean }>;
}

export interface StreamChunk {
  type: "text_delta" | "tool_call" | "done";
  delta?: string;
  call?: ToolCall;
  usage?: TokenUsage;
}
```

- [ ] **Step 2: 创建 LLM 客户端**

```typescript
// server/services/llm-client.ts
import { getSettings } from "./settings-service";
import { Message, ToolCall, TokenUsage, StreamChunk } from "./llm-types";
import { createHash } from "crypto";

// Cache prefix for KV-cache optimization
function systemFingerprint(messages: Message[], tools: object[] | null): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ msgs: messages.map(m => m.role), tools: tools?.length ?? 0 }));
  return hash.digest("hex").slice(0, 16);
}

function messageToDict(m: Message): Record<string, unknown> {
  const d: Record<string, unknown> = { role: m.role };
  if (m.content != null) d.content = m.content;
  if (m.tool_calls?.length) {
    d.tool_calls = m.tool_calls.map(tc => ({
      id: tc.id, type: "function",
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
    }));
  }
  if (m.tool_call_id) d.tool_call_id = m.tool_call_id;
  if (m.name) d.name = m.name;
  return d;
}

export async function chat(
  messages: Message[], tools?: object[] | null,
  temperature = 0.7, maxTokens = 4096
): Promise<string> {
  const { baseUrl, apiKey, model } = getSettings();
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, messages: messages.map(messageToDict),
      tools: tools?.map(t => ({ type: "function", function: t })),
      tool_choice: tools ? "auto" : undefined,
      temperature, max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`LLM API error: ${resp.status} ${await resp.text()}`);
  const data = await resp.json() as Record<string, unknown>;
  const choices = data.choices as Array<{ message?: { content?: string } }>;
  return choices?.[0]?.message?.content ?? "";
}

export async function* chatStream(
  messages: Message[], tools?: object[] | null,
  temperature = 0.7, maxTokens = 4096
): AsyncGenerator<StreamChunk> {
  const { baseUrl, apiKey, model } = getSettings();
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, messages: messages.map(messageToDict),
      tools: tools?.map(t => ({ type: "function", function: t })),
      tool_choice: tools ? "auto" : undefined,
      temperature, max_tokens: maxTokens,
      stream: true, stream_options: { include_usage: true },
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!resp.ok) throw new Error(`LLM API error: ${resp.status}`);

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const toolAcc: Map<number, { id: string; name: string; arguments: string }> = new Map();
  let usage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const s = line.slice(6);
      if (s.trim() === "[DONE]") break;
      try {
        const chunk = JSON.parse(s);
        if (chunk.usage) {
          usage = {
            prompt_tokens: chunk.usage.prompt_tokens ?? 0,
            completion_tokens: chunk.usage.completion_tokens ?? 0,
            total_tokens: chunk.usage.total_tokens ?? 0,
          };
        }
        for (const choice of chunk.choices ?? []) {
          const delta = choice.delta ?? {};
          if (delta.content) yield { type: "text_delta", delta: delta.content };
          for (const tc of delta.tool_calls ?? []) {
            const idx = tc.index ?? 0;
            if (!toolAcc.has(idx)) toolAcc.set(idx, { id: tc.id ?? "", name: "", arguments: "" });
            const acc = toolAcc.get(idx)!;
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
          const finish = choice.finish_reason ?? "";
          if ((finish === "tool_calls" || finish === "stop") && toolAcc.size > 0) {
            for (const [, acc] of toolAcc) {
              try {
                yield { type: "tool_call", call: { id: acc.id, name: acc.name, arguments: JSON.parse(acc.arguments) } };
              } catch { /* skip malformed */ }
            }
            toolAcc.clear();
          }
        }
      } catch { /* skip malformed chunks */ }
    }
  }
  yield { type: "done", usage };
}
```

- [ ] **Step 3: 创建 Tool Registry**

```typescript
// server/services/tool-registry.ts
import { ToolDef } from "./llm-types";

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  schemas(): object[] {
    return [...this.tools.values()].map(t => ({
      name: t.name, description: t.description, parameters: t.parameters,
    }));
  }

  async execute(name: string, params: Record<string, unknown>): Promise<{ content: string; details?: Record<string, unknown>; ok: boolean }> {
    const tool = this.tools.get(name);
    if (!tool) return { content: `Unknown tool: ${name}`, ok: false };
    try {
      const result = await tool.execute(params);
      return { content: result.content, details: result.details, ok: result.ok ?? true };
    } catch (err: unknown) {
      return { content: `Tool error: ${err}`, ok: false };
    }
  }
}
```

- [ ] **Step 4: Commit**

---

### Task 3: 设置服务 + 聊天持久化服务

**Files:**
- Create: `server/services/settings-service.ts`
- Create: `server/services/chat-service.ts`

Translation from `backend/services/settings_service.py` and `backend/services/chat_service.py`. Logic identical, Python → TypeScript.

- [ ] **Step 1: 创建设置服务** — config.json 读写，密钥掩码，部分更新解析
- [ ] **Step 2: 创建聊天服务** — JSONL 会话读写，摘要文件管理，session 列表
- [ ] **Step 3: Commit**

---

### Task 4: Planner 服务

**Files:**
- Create: `server/services/planner-service.ts`

Translation from `backend/services/planner_service.py` (327 lines). 8 张表的 CRUD + GoalTree 组装逻辑。

- [ ] **Step 1: 实现** — get_active_goal, build_goal_tree, build_plan_card, generate_initial_plan, get_tasks_for_date, update_task, delete_task, create_task, adapt_next_week
- [ ] **Step 2: Commit**

---

### Task 5: Profile + Practice 服务

**Files:**
- Create: `server/services/profile-service.ts`
- Create: `server/services/practice-service.ts`

- [ ] **Step 1: 实现 profile 服务** — serialize_profile, recalculate_module（含 proficiency 加权公式）, recalculate_profile
- [ ] **Step 2: 实现 practice 服务** — create_practice_session, create_error_batch
- [ ] **Step 3: Commit**

---

### Task 6: Tool 实现（planner + web + document + generate_plan）

**Files:**
- Create: `server/services/tools/planner.ts`
- Create: `server/services/tools/web.ts`
- Create: `server/services/tools/document.ts`
- Create: `server/services/tools/generate-plan.ts`

- [ ] **Step 1: Planner tools** — 6 个工具，从 Python 直译
- [ ] **Step 2: Web tools** — web_search (3 个 provider fallback) + web_fetch (含安全校验)
- [ ] **Step 3: Document tools** — read_document (pdf-parse + mammoth)
- [ ] **Step 4: Generate plan tool** — schema 校验 + 计划写入 + 诊断→计划生成
- [ ] **Step 5: Commit**

---

### Task 7: Agent 层（context + loop + intent）

**Files:**
- Create: `server/services/agent-context.ts`
- Create: `server/services/agent-loop.ts`
- Create: `server/services/intent.ts`

- [ ] **Step 1: Agent context** — 系统提示词（1500+ 字符中文 prompt，原样保留）
- [ ] **Step 2: Agent loop** — 生成式循环（max 8 轮），工具执行，后台摘要，取消支持
- [ ] **Step 3: Intent classifier** — 正则引擎 + 关键字匹配 + 7 字段诊断状态机（207 行 Python → TS）
- [ ] **Step 4: Commit**

---

### Task 8: API 路由（7 个路由文件）

**Files:**
- Create: `server/api/planner.ts`
- Create: `server/api/chat.ts`
- Create: `server/api/practice.ts`
- Create: `server/api/profile.ts`
- Create: `server/api/settings.ts`
- Create: `server/api/sessions.ts`
- Create: `server/api/files.ts`

全面遵循现有端点。聊天 WebSocket 处理程序保留完整的 IntentClassifier 集成 + AgentLoop 编排。

---

### Task 9: 测试迁移

**Files:**
- Create: `server/__tests__/conftest.ts`
- Create: `server/__tests__/phase1-mvp.test.ts`
- Create: `server/__tests__/backend-smoke.test.ts`

为利用临时 SQLite 迁移 vitest 测试。尊重后端 API 的语义。

---

### Task 10: 清理

**Files:**
- Remove: `backend/` 目录
- Remove: `tests/` 目录
- Remove: `requirements.txt`
- Modify: `package.json`（移除旧的 `dev:api` 引用）

- [ ] **Step 1: 验证全部通过** — `npm run build && npm run test:api`
- [ ] **Step 2: 删除 Python 文件**
- [ ] **Step 3: 更新 Akari-design-v1.handoff.md + CLAUDE.md**

---

## 验证

- `npm run build` 通过
- `npm run test:api` — 10 个测试全部通过（从 Python 迁移）
- 手动：WebSocket 流式对话正常工作
- 手动：Settings 读写正常
- 手动：文件上传正常
- 手动：计划 CRUD 正常
