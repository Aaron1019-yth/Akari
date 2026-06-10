# Akari — 考公备考 Agent

Python/FastAPI 后端 + React/Vite 前端 + Electron 桌面壳。

## 技术栈

- Python 3.13 + FastAPI + SQLAlchemy + SQLite
- Node 24 + Electron 42 + React 19 + Vite 7 + TypeScript 5.9
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
npm run test:api    # pytest
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
backend/
├── main.py              # FastAPI 入口
├── api/                 # chat, planner, practice, profile, settings, files
├── services/
│   ├── agent/           # loop.py, context.py
│   ├── llm/             # client.py, schemas.py
│   ├── tools/           # base.py, registry.py, planner.py
│   ├── planner_service.py
│   └── settings_service.py
├── db/                  # database.py, models.py (8 tables)
└── schemas.py           # Pydantic models

desktop/src/react/
├── App.tsx              # 单体 UI 组件
├── services/api.ts      # REST + WebSocket 客户端
└── styles.css

shared/exam-schema.ts    # 前端类型镜像
```

## 关键设计决策

- **三层 Agent 架构**：`llm/`（API 调用）→ `tools/`（纯函数）→ `agent/`（编排循环），互不知道对方内部实现
- **WebSocket 流式对话**：`/api/chat/ws`，支持 text_delta / tool_start / tool_end / turn_end / error 事件
- **Tool calling**：6 个 planner tools + schema 校验在 AgentLoop 层（不在 tool 内部）
- **设置持久化**：`.akari/config.json`，运行时覆盖 env var
- **JSONL 会话**：`.akari/memory/sessions/{session_id}.jsonl`
- **系统提示词**：静态前缀（角色 + 工具纪律）+ 当前时间，用户状态通过 tool 动态查询

## 红线

- 不删除 `.akari/` 下任何文件
- 不修改 `.env` / `.akari/config.json` 中的 api_key
- 不做数据库 schema 迁移（当前用 `Base.metadata.create_all`）
- 不搬运 Hanako 原项目的 UI/Electron/后端代码（clean-room 项目）
- 密钥不进代码、不进 commit

## 深入文档

| 文档 | 内容 |
|------|------|
| `docs/HANDOFF.md` | 交接文稿：当前状态、已验证流程、待完成项 |
| `docs/superpowers/specs/2026-06-10-phase1-mvp-design.md` | **Phase 1–3 规格**（当前路线图） |
| `docs/superpowers/specs/2026-06-09-exam-agent-design.md` | 总体技术设计、数据模型、版权策略 |
| `docs/superpowers/specs/exam-domain-model.md` | API 契约 + 领域模型 |
| `docs/superpowers/specs/ORIGINALITY.md` | 原创性审计边界 |
