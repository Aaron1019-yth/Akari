# Akari — 考公备考 Agent

Node.js/TypeScript 后端 + React/Vite 前端 + Electron 桌面壳。

## 技术栈

- Node 24 + TypeScript 5.9 + Express + better-sqlite3 + Zod
- React 19 + Vite 7 + Electron 42
- DeepSeek API（OpenAI 兼容 `/chat/completions`）

## 启动

```bash
npm run dev:api      # 后端 :8742
npm run dev          # 前端 :5173
npm run dev:desktop  # Electron 桌面版
```

打开 `http://127.0.0.1:5173/`。

## 检查

```bash
npm run build       # tsc + vite
npm run test:api    # vitest
```

## 环境变量

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `DEEPSEEK_API_KEY` | — | LLM API key（可在 Settings UI 配置） |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | API 地址 |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | 模型名 |

Settings UI 存储在 `.akari/config.json`，优先级：config.json > env var > 默认值。

## 项目结构

```
server/
├── main.ts              # Express + WebSocket 入口
├── db.ts                # better-sqlite3 连接 + 8 张表 schema
├── types.ts             # Zod schemas + DB row interfaces
├── api/                 # planner, chat, practice, profile, settings, sessions, files
├── services/
│   ├── agent-context.ts # 系统提示词
│   ├── agent-loop.ts    # Agent 编排循环（max 8 rounds）
│   ├── intent.ts        # Intent 分类器（7 字段诊断状态机）
│   ├── llm-types.ts     # Message, ToolCall, TokenUsage
│   ├── llm-client.ts    # DeepSeek HTTP/SSE 客户端
│   ├── tool-registry.ts # Tool 注册表
│   ├── tools/
│   │   ├── planner.ts   # 6 个 planner tools
│   │   ├── web.ts       # web_search + web_fetch
│   │   ├── document.ts  # read_document
│   │   └── generate-plan.ts  # generate_plan tool
│   ├── planner-service.ts
│   ├── practice-service.ts
│   ├── profile-service.ts
│   ├── settings-service.ts
│   ├── chat-service.ts  # JSONL 会话持久化
│   └── files-service.ts
└── __tests__/           # Vitest

desktop/src/react/
├── App.tsx
├── components/          # Titlebar, Sidebar, ChatPanel, Workbench, SettingsModal, ErrorBoundary
├── services/api.ts      # REST + WebSocket 客户端
└── utils.ts

shared/exam-schema.ts    # 前后端共享类型
```

## 关键设计决策

- **三层 Agent 架构**：`llm-client`（API 调用）→ `tools/`（纯函数）→ `agent-loop`（编排循环），互不知道对方内部实现
- **WebSocket 流式对话**：`/api/chat/ws`，支持 text_delta / tool_start / tool_end / turn_end / plan_card / error 事件
- **Tool calling**：10 个 tools + schema 校验在 AgentLoop 层
- **设置持久化**：`.akari/config.json`，运行时覆盖 env var
- **JSONL 会话**：`.akari/memory/sessions/{session_id}.jsonl`
- **系统提示词**：静态前缀（角色 + 工具纪律）+ 当前时间，用户状态通过 tool 动态查询
- **数据库**：SQLite `.akari/akari.db`，better-sqlite3 同步 API，WAL 模式

## 红线

- 不删除 `.akari/` 下任何文件
- 不修改 `.env` / `.akari/config.json` 中的 api_key
- 不做数据库 schema 迁移（当前用 `CREATE TABLE IF NOT EXISTS`）
- 不搬运 Hanako 原项目的 UI/Electron/后端代码（clean-room 项目）
- 密钥不进代码、不进 commit

## 深入文档

| 文档 | 内容 |
|------|------|
| `docs/HANDOFF.md` | 交接文稿：当前状态、已验证流程、待完成项 |
| `docs/superpowers/specs/2026-06-10-phase1-mvp-design.md` | **Phase 1–3 规格**（当前路线图） |
| `docs/superpowers/specs/2026-06-09-exam-agent-design.md` | 总体技术设计、数据模型、版权策略 |
| `docs/superpowers/plans/2026-06-10-backend-nodejs-migration.md` | 后端迁移计划 |
