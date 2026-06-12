# Akari V1 Design

Last updated: 2026-06-12

V1 的目标是跑通「对话式规划教练」：用户通过聊天完成考试诊断，Akari 生成一周学习计划，并在工作台中管理任务和 workspace 文档。V1 已冻结，不再继续扩展功能面。

## 技术栈

- Backend：Node 24 + TypeScript 5.9 + Express + better-sqlite3 + Zod
- Frontend：React 19 + Vite 7 + Electron 42
- LLM：DeepSeek OpenAI-compatible `/chat/completions`
- Workspace：真实文件系统，默认 `~/Desktop/Akari-WorkSpace`
- Persistence：SQLite `.akari/akari.db` + JSONL sessions

## 核心架构

### Agent 三层架构

- `server/services/llm-client.ts`：DeepSeek HTTP/SSE 客户端。
- `server/services/tools/`：工具实现，包括 planner、web、document、generate-plan。
- `server/services/agent-loop.ts`：LLM → tool calls → tool results 编排，最多 8 轮。
- `server/services/agent-context.ts`：系统提示词与工具纪律。
- `server/services/tool-registry.ts`：工具注册和执行边界。

### 后端 API

- `server/main.ts`：Express + WebSocket 入口。
- `server/api/chat.ts`：REST chat 与 `/api/chat/ws` 流式对话。
- `server/api/planner.ts`：目标、周计划、任务、手动规划和计划版本路由。
- `server/api/workspace.ts`：workspace tree/file/upload/delete/rename/info。
- `server/api/settings.ts`：运行时配置。
- `server/api/sessions.ts`：JSONL 会话列表、读取和删除。

### 前端结构

- `desktop/src/react/App.tsx`：顶层状态编排。
- `features/chat/`：会话侧边栏、聊天面板、Markdown/GFM 渲染和选择按钮。
- `features/workbench/`：规划、复盘素材、工作台三类右侧 surface。
- `features/workspace/`：文件树和文件预览。
- `services/api.ts`：REST 和 WebSocket transport。
- `shared/ui/`：Titlebar、ErrorBoundary 等通用 UI。

## V1 已落地能力

- WebSocket 流式对话。
- IntentClassifier 诊断状态机。
- Agent tool calling：planner、web search/fetch、workspace document、plan generation。
- JSONL 会话持久化、会话切换和删除。
- 长历史摘要压缩。
- 右侧工作台展示 active plan、日/周任务、任务编辑、完成、删除、拖拽重排。
- Workspace 文件系统：上传、文件树、预览、PDF/DOCX/常见文本解析。
- Settings UI：LLM、搜索 provider、workspace path、theme。
- Markdown/GFM 渲染。

## V1 冻结边界

V1 不再新增：

- 多文件 tab、split editor、quick open。
- 旧版 `.doc` 解析。
- Electron DMG 打包。
- 学习总结、错题复盘、周复盘。
- V3 自适应计划调整。

这些能力如果继续做，应进入 V2/V3 或跨版本优化，而不是继续扩大 V1。

## 设计约束

- 不做数据库 schema migration；当前使用 `CREATE TABLE IF NOT EXISTS` additive schema。
- 不复制 Hanako 原项目代码。
- Settings 写入 `.akari/config.json`，不要把密钥写入代码或文档。
- Workspace 路径必须沙盒化，防止路径穿越。
