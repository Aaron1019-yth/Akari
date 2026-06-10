# Akari Handoff

Last updated: 2026-06-10

> **当前路线图**：`docs/superpowers/specs/2026-06-10-phase1-mvp-design.md`（Phase 1–3 完整规格）。
> **阶段状态**：Phase 1 对话式规划教练 MVP 已完成。Phase 1.5 功能收尾已完成（2026-06-10）。后端已从 Python/FastAPI 迁移到 Node.js/TypeScript（2026-06-10）。Phase 2 Workspace 文件系统已完成（2026-06-10）。Phase 3 UI 生产级打磨已完成（2026-06-11）。验收记录见 `docs/PHASE_COMPLETION_LOG.md`。

## Project State

Akari is a clean-room exam preparation desktop app. The current MVP has:

- React/Vite frontend with streaming chat UI.
- Electron shell for desktop mode.
- **Node.js/TypeScript backend** (Express + ws) on `127.0.0.1:8742`.
- SQLite database at `.akari/akari.db` (better-sqlite3).
- Planner/task/profile domain models.
- Right workbench with total plan card, daily plan, weekly plan, task completion, and pomodoro actual-time recording.
- Center chat panel with full DeepSeek Agent via WebSocket streaming (tool-calling, abort, streaming text).
- 6 planner tools: `get_planner_context`, `get_today_tasks`, `get_week_tasks`, `create_task`, `update_task`, `get_module_stats`.
- General tools: `web_search`, `web_fetch`, `read_document`, `write_to_file`, `list_workspace_files`.
- Plan generation tool: `generate_plan`.
- Agent loop: LLM → tool_calls → execute tools → feed results → repeat (max 8 rounds).
- Workspace: real filesystem at `~/Desktop/Akari-WorkSpace/` with FileTree + FilePreview in workbench, path sandbox, PDF/DOCX parsing.
- Phase 1 routing: IntentClassifier with session-scoped diagnostic state, deterministic diagnostic-to-plan generation, `plan_card` / `file_list` WebSocket events.
- Settings UI: API key / Base URL / Model / Tavily / Serper / Brave configurable from sidebar, persisted to `.akari/config.json`.

### Env Vars

Env vars serve as **defaults** — they can be overridden via the Settings UI at runtime without restart.

| Variable | Default | Required |
|---|---|---|
| `DEEPSEEK_API_KEY` | — | no (can set via UI) |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | no |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | no |
| `TAVILY_API_KEY` | — | no (can set via UI) |
| `SERPER_API_KEY` | — | no (can set via UI) |
| `BRAVE_SEARCH_API_KEY` | — | no (can set via UI) |
| `AKARI_WORKSPACE_PATH` | `~/Desktop/Akari-WorkSpace` | no |

## Run Commands

Install:

```bash
npm install --legacy-peer-deps
```

Web app:

```bash
npm run dev:api
npm run dev
```

Open `http://127.0.0.1:5173/`.

Desktop app:

```bash
npm run dev:desktop
```

Checks:

```bash
npm run build
npm run test:api
```

## Important Files

- `server/main.ts`: Express + WebSocket entry point.
- `server/db.ts`: better-sqlite3 connection + 8-table schema.
- `server/types.ts`: Zod schemas + DB row interfaces.
- `server/api/planner.ts`: planner/task endpoints.
- `server/api/chat.ts`: WebSocket `/api/chat/ws` + legacy `POST /api/chat`.
- `server/services/planner-service.ts`: rule-based plan generation, task create/update/adapt.
- `server/api/workspace.ts`: 7 workspace REST endpoints (tree, file read/write, upload, delete, rename, info).
- `server/services/chat-service.ts`: local JSONL chat persistence.
- `server/services/workspace-service.ts`: filesystem workspace with path sandbox, FileNode tree, PDF/DOCX parsing.
- **Agent layer:**
  - `server/services/llm-types.ts`: `Message`, `ToolCall`, `TokenUsage` interfaces.
  - `server/services/llm-client.ts`: DeepSeek HTTP/SSE client (`chat()` + `chatStream()`).
  - `server/services/tool-registry.ts`: `ToolRegistry` — register, schema export, execute with error handling.
  - `server/services/tools/planner.ts`: 6 planner tools (context, tasks, create/update, stats).
  - `server/services/tools/web.ts`: `web_search` + `web_fetch` tools.
  - `server/services/tools/document.ts`: `read_document` + `write_to_file` + `list_workspace_files` tools.
  - `server/services/tools/generate-plan.ts`: `generate_plan` tool + diagnostic→plan pipeline.
  - `server/services/agent-context.ts`: `buildSystemPrompt()` — static identity prefix + current time.
  - `server/services/agent-loop.ts`: `AgentLoop` — streaming orchestration with abort support, max 8 rounds.
  - `server/services/intent.ts`: `IntentClassifier` — 7-field diagnostic state machine.
  - `server/services/settings-service.ts`: settings persistence to `.akari/config.json`, in-memory cache, key masking.
- `desktop/src/react/App.tsx`: main UI, chat, right workbench, resize handles, streaming messages, abort button.
- `desktop/src/react/services/api.ts`: frontend API client + `createChatStream()` WebSocket client.
- `desktop/src/react/components/FileTree.tsx`: recursive file tree with expand/collapse, context menu.
- `desktop/src/react/components/FilePreview.tsx`: text/Markdown file preview.
- `shared/exam-schema.ts`: TypeScript domain contract (shared types, including `FileNode`).
- `server/__tests__/`: Vitest test suite (20 tests).

## Verified Flows

- Generate initial plan.
- Create daily task.
- Mark task completed.
- Record pomodoro actual minutes.
- Read task state back from `/api/planner/goal`.
- Switch `今日` / `本周`.
- Send chat message to `POST /api/chat` and receive assistant response (legacy, no streaming).
- WebSocket chat via `/api/chat/ws` with streaming text display, tool status indicator, and abort button (requires `DEEPSEEK_API_KEY`).
- Agent loop error handling: httpx exceptions during streaming caught and yielded as error events.
- Configure API key / base URL / model via Settings UI (sidebar button → modal).
- Configure search provider keys via Settings UI.
- Settings persist to `.akari/config.json` and survive restarts; env vars serve as defaults.
- Phase 1 diagnostic flow: collect fields, generate plan, push plan_card, clear session_state.
- Upload PDF/DOCX files to workspace and browse in FileTree.
- File preview (text/markdown) in workspace tab.
- File delete and rename via context menu in workspace.
- Agent can read/write/list workspace files via tools.
- Conversation history persists to `.akari/memory/sessions/*.jsonl` and is loaded into Agent turns.
- Build frontend.
- Run API smoke tests (20 passing).

## Phase 3 — UI / UX 生产级打磨（2026-06-11）

- 左侧边栏重构：移除 traffic lights，增加「助手活动」「任务计划」占位菜单项，增加 collapse/expand tab。
- 中央聊天面板：移除顶部 status bar，空状态改为「Akari 随时都在」SVG 头像，composer hint 上移。
- 右侧工作台（OH-WorkSpace）：「对话文件」+「工作台」合并为单一 Workspace tab，含「我的规划」「对话文件」「工作台」三个子 tab。
- 文件阅读模式：打开文件时自动折叠左侧边栏，全宽预览；上传文件后自动预览。
- 全局设计升级（redesign-skill 审计）：Geist Variable 字体、off-white 配色、阴影色调统一、hover/active/focus 状态、噪点纹理、border-radius 层级、语义化 HTML、scroll-behavior: smooth。

## Known Technical Follow-Ups

- No database migrations yet; tables are created with `CREATE TABLE IF NOT EXISTS`.
- Electron packaging is not done.
- No `steer` / `resume_stream` implementation yet in WebSocket handler (infrastructure ready, handlers are stubs).
- Settings form is long; could use sections/tabs (deferred to Phase 4).
- Mood / thinking / card event parsing not implemented (deferred to Phase 4).

## Electron Note

On Node 26, Electron postinstall can download the zip but fail to extract it completely via `extract-zip`. If `path.txt` or `Frameworks/` is missing, run:

```bash
bash scripts/fix-electron-macos.sh
```

The script matches the cached zip by the installed Electron version to avoid extracting an old cached version.

## Reference: Hanako (agent_demo-main) Architecture

Hanako is the predecessor project. This section documents its agent-layer architecture as a reference for Akari's design. Hanako is TypeScript/Node.js + Electron + Pi SDK; Akari is Node.js/TypeScript + Express + Vite/React + Electron. Same architectural principles, different runtime.

### Directory Map

```
agent_demo-main/
├── core/                    # 核心引擎
│   ├── engine.ts            # HanaEngine — 薄外观层，聚合所有 Manager
│   ├── agent.ts             # Agent — 身份、记忆、工具注册、buildSystemPrompt()
│   ├── agent-manager.ts     # AgentManager — 多 agent 生命周期
│   ├── session-coordinator.ts  # SessionCoordinator — 会话创建、Pi SDK 会话管理
│   ├── model-manager.ts     # ModelManager — 模型/提供商注册表
│   ├── config-coordinator.ts   # 配置协调
│   ├── skill-manager.ts     # 技能管理
│   ├── provider-compat.ts   # 跨提供商兼容层（请求规范化）
│   └── llm-client.ts        # 非流式 LLM 调用（callText）
│
├── lib/                     # 可复用库
│   ├── llm/                 # LLM 抽象
│   │   ├── cache-prefix-contract.ts  # KV cache 前缀契约（SHA-256 哈希）
│   │   └── ...
│   ├── tools/               # 工具定义（30+ 个工厂函数）
│   │   ├── plan-tools.ts    # 学习规划工具（get_today_tasks, create_task, update_task, ...）
│   │   ├── web-search.ts    # 网络搜索
│   │   ├── web-fetch.ts     # 网页抓取
│   │   ├── browser-tool.ts  # 浏览器控制
│   │   ├── todo.ts          # 待办事项
│   │   ├── cron-tool.ts     # 定时任务
│   │   ├── terminal.ts      # 终端
│   │   ├── subagent.ts      # 子 agent 调度
│   │   ├── memory*          # 记忆相关工具
│   │   ├── notify-tool.ts   # 通知
│   │   └── ...
│   ├── providers/           # 提供商插件（DeepSeek, OpenAI, Anthropic, ...）
│   └── pi-sdk/              # Pi SDK 薄封装（会话管理、流式传输、工具执行）
│
├── desktop/                 # Electron 壳 + React 前端
│   ├── bootstrap.cjs        # 启动引导 + 崩溃诊断
│   ├── main.cjs             # 主进程（~4400 行，包含 server 生命周期管理）
│   └── src/react/           # React 前端
│       ├── App.tsx          # 主应用
│       ├── hooks/
│       │   └── use-stream-buffer.ts  # 流式缓冲（200ms 节流 flush）
│       ├── services/
│       │   ├── websocket.ts           # WebSocket 客户端（自动重连）
│       │   └── ws-message-handler.ts  # WS 事件 → Zustand store
│       └── stores/          # Zustand 状态管理
│
└── server/                  # HTTP/WS 服务
    └── routes/
        ├── chat.ts          # WebSocket 端点 + 事件广播 + ThinkTag/Mood/Card 解析管道
        └── ...
```

### Agent Layer Design

**Three-layer separation:**

```
LLM Client (lib/llm/ + core/llm-client.ts)
  — 只知道如何调 API（OpenAI/Anthropic 协议适配、token 统计）
  — 不知道项目业务、不知道工具

Tools (lib/tools/*.ts)
  — 每个工具是工厂函数，返回 { name, description, parameters, execute }
  — 只知道如何执行自己的逻辑
  — 不知道 LLM 存在、不知道调用方是谁

Agent Loop (Pi SDK → session.prompt())
  — 编排「调 LLM → 解析 tool_call → 执行工具 → 回传结果 → 重复」
  — 不知道具体 LLM 协议、不知道具体工具逻辑
  — 只通过 EventBus 发出事件
```

**Tool definition pattern** (from `lib/tools/plan-tools.ts`):

```typescript
{
  name: "get_today_tasks",           // 机器名
  label: "获取今日任务",              // 人类可读标签
  description: "WHEN 用户问今天学什么。读指定日期任务。",
  parameters: Type.Object({           // JSON Schema (TypeBox)
    date: Type.Optional(Type.String({ description: "YYYY-MM-DD；默认今天" })),
  }),
  execute: async (toolCallId, params) => {
    // 纯逻辑，返回 { content: [{ type: "text", text: "..." }], details: {...} }
    return { content: [{ type: "text", text: formatted }], details: { tasks } };
  },
}
```

**System prompt structure** (from `core/agent.ts::buildSystemPrompt()`, line 1115):

```
STATIC PREFIX (跨 session 共享，KV cache 友好):
  1. Platform identification
  2. Execution environment
  3. Tool usage discipline
  4. Goal planning guidance
  5. Session file & delivery rules
  6. Subagent collaboration guide
  7. Computer Use instructions
  8. Failure handling guidelines
  9. Action safety framework
  10. Web tool priority rules
  11. Proactive skill acquisition
  12. Team roster
  ── cache 分界线 (line 1374) ──
DYNAMIC SUFFIX (每个 session 变化):
  13. User profile (user.md)
  14. Identity/Yuan/Ishiki (personality)
  15. Workspace (current cwd)
  16. Workspace instruction files
  17. File & command tool use
  18. Memory rules + pinned memories + long-term memory
  19. Current date/time
```

**Streaming event pipeline:**

```
Pi SDK → session-coordinator → EventBus → server/routes/chat.ts
  → ThinkTagParser → MoodParser → CardParser
    → emitStreamEvent() → WebSocket broadcast → React use-stream-buffer (200ms throttle flush)
```

Event types: `text_delta`, `thinking_start/delta/end`, `tool_start/end`, `content_block`, `turn_end`, `error`

**Frontend streaming** (from `use-stream-buffer.ts`):

- Each session has a buffer with text accumulator, thinking accumulator, mood accumulator
- 200ms throttle timer batches text/thinking deltas before flushing to Zustand store
- Tool events flush immediately (no throttle)
- On `turn_end`, flush all remaining content and clean up buffer

### Server Lifecycle (from `desktop/main.cjs`)

- `startServer()` spawns the Node.js server process
- `serverProcess.unref()` detaches from Electron event loop
- On `before-quit`: `event.preventDefault()` → SIGTERM → wait 17s (grace) → SIGKILL (force) → wait 5s → `app.quit()`
- `waitForProcessExit()` polls `process.kill(pid, 0)` every 200ms to confirm process death
- `hasChildExitObserved()` checks `proc.exitCode !== null || proc.signalCode !== null`

## Clean-Room Boundary

Do not copy Hana/Akari legacy UI, Electron shell, stores, theme files, assets, or backend code into this project. Current implementation is new code. Planner legacy assets are still not migrated; if migrating, update `ORIGINALITY.md` and `docs/superpowers/specs/ORIGINALITY.md` first.
