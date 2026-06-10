# Akari 阶段完成记录

> 本文件用于记录每个阶段由用户最终确认后的完成状态。后续 Phase 2、Phase 3 或 Phase 1.x 的验收记录继续追加在本文档后面，不覆盖旧记录。

## Phase 1 — 对话式规划教练

- 确认日期：2026-06-10
- 确认人：Aaron
- 状态：已完成 MVP 收口

### 完成范围

- WebSocket 对话式规划教练接入 DeepSeek 流式 Agent。
- IntentClassifier 支持 `ASK` / `PLAN` / `ADJUST` / `QUERY_PLAN` / `CHAT`，并已降低低置信度误判。
- 诊断状态按 `session_id` 隔离，避免跨会话污染。
- 诊断字段收集完成后可确定性生成本周计划，并推送右侧 `plan_card`。
- Agent 支持最近会话历史 JSONL 注入，历史读取逐行容错。
- System prompt 已静态化，不再默认注入用户计划状态；用户状态通过工具查询。
- 通用工具已接入：`web_search` / `web_fetch` / `read_document`。
- 计划写入工具已接入：`generate_plan`，并有 schema 校验。
- 文件 API 已接入：上传 PDF/DOCX、列出对话文件。
- 前端支持附件按钮、拖放/粘贴上传、对话文件 tab、计划卡片事件刷新。
- Settings 支持 DeepSeek 与 Tavily / Serper / Brave 搜索 key。
- 修复 DeepSeek tool-call 历史协议，避免工具回合后 400。
- 修复布局高度：左栏、聊天区、右栏各自滚动。

### 验证

- `npm run test:api`：10 passed
- `npm run build`：通过
- 实测：问候/天气不会被诊断流程劫持；同一会话可记住最近上下文；诊断信息完整后可生成计划卡。

### 暂缓到 Phase 1.5 / Phase 2

- 会话列表、会话切换、历史恢复 UI。
- 长历史摘要/压缩。
- 文件预览、删除、重命名。
- 更完整的 planner validation/service 分层。
- mood/thinking/card 事件解析。
- 右侧规划 UI 的生产级打磨。

## Phase 1.5 — 功能收尾

- 启动日期：2026-06-10
- 确认日期：2026-06-10
- 状态：已完成

### 完成范围

- 测试 DB 隔离：`tests/conftest.py` 提供 `client` fixture，每个测试用独立临时 SQLite 数据库，不污染 `.akari/akari.db`。
- Task 编辑/删除：`PATCH /api/planner/task/{id}` 扩展支持 title/type/subject/estimated_minutes/date 字段；新增 `DELETE /api/planner/task/{id}` 端点。
- 文件删除/重命名：`DELETE /api/files/{file_id}` + `PATCH /api/files/{file_id}` 端点；前端文件列表增加删除按钮。
- 会话列表 API + 前端切换：`GET /api/sessions` + `GET /api/sessions/{id}`；左侧栏动态显示真实 session 列表，支持点击切换会话、新建会话；WebSocket 传递真实 session_id。
- 长历史摘要/压缩：session JSONL 超过 16K 字符时，LLM 自动生成中文摘要存入 `.summary.txt`，后续对话注入为 system message。
- `npm run test:api`：10 passed；`npm run build`：通过。

### Phase 1.5 追加：代码质量改进（2026-06-10）

在不新增功能的前提下完成 10 项改进：

| # | 项 | 状态 |
|---|----|------|
| 1 | App.tsx 拆分 | 1097→585 行，抽出 5 个组件 + utils.ts |
| 2 | chat_service.py 消除重复 | 抽取 `_read_messages()`，3 处调用归一 |
| 3 | 摘要 fire-and-forget | 不再阻塞首 token，改后台 `create_task` |
| 4 | test_phase1_mvp.py 隔离 | 全部测试用 `client` fixture |
| 5 | TypeScript strict | 已是 `strict: true`，无需改动 |
| 6 | plan card / goal 统一 | 去掉 `planCard` 状态，`goal` 为单一数据源 |
| 7 | intent.py 配置化 | 关键词列表 + 字段定义提到文件顶部 |
| 8 | ErrorBoundary | 子组件崩溃显示错误页+重新加载按钮 |
| 9 | WebSocket 自动重连 | 指数退避，最多 5 次 |
| 10 | ESLint + Prettier | `npm run lint` / `npm run format` 可用，0 errors |

### 暂缓到 Phase 4（UI 打磨）

- Settings 分区化
- mood / thinking / card 事件解析与展示
- 边栏宽度持久化
- Workbench 视觉密度优化

## Phase 2 — Workspace 文件系统

- 启动日期：2026-06-10
- 确认日期：2026-06-10
- 状态：已完成

### 完成范围

- 后端 workspace 服务层：真实文件系统 `~/Desktop/Akari-WorkSpace/`，路径沙盒（防 `..` 穿越），隐藏文件/目录过滤，PDF/DOCX 解析，500KB 文本限制。
- Workspace API：7 个 REST 端点（`GET /tree`、`GET /file`、`POST /file`、`POST /upload`、`DELETE /file`、`PATCH /file`、`GET /info`）。
- Settings：`workspace_path` 配置持久化到 `.akari/config.json`，支持 `AKARI_WORKSPACE_PATH` 环境变量。
- Agent 工具更新：`read_document` 改为从 workspace 路径读；新增 `write_to_file` + `list_workspace_files`。
- 前端 FileTree 组件：递归展开/折叠，右键菜单删除/重命名。
- 前端 FilePreview 组件：文本/Markdown 渲染。
- Workbench 整合：「对话文件」+「工作台」合并为单一 Workspace tab，左侧文件树 + 右侧预览。
- 删除旧 `files-service.ts`、`api/files.ts`、`ConversationFile` 类型、`.akari/uploads/` 目录。

### 验证

- `npx tsc --noEmit`：通过
- `npm run build`：通过
- `npm run test:api`：20 passed（新增 10 个 workspace 测试）

## Phase 3 — UI 生产级打磨

- 启动日期：2026-06-11
- 确认日期：2026-06-11
- 状态：已完成

### 完成范围

- 左侧边栏重构：移除 traffic lights，新增「助手活动」「任务计划」占位菜单，collapse/expand tab。
- 中央聊天面板：空状态 SVG 头像，composer hint 上移，移除顶部 status bar。
- 右侧工作台：「对话文件」+「工作台」合并为单一 Workspace tab，含「我的规划」「对话文件」「工作台」子 tab。
- 文件阅读模式：打开文件自动折叠左侧边栏，全宽预览；上传文件自动预览。
- 全局设计升级：Geist Variable 字体、off-white 配色 `#f2f0ec`、阴影色调统一、hover/active/focus 状态、噪点纹理 overlay、border-radius 层级、语义化 HTML。

### 验证

- `npm run build`：通过
- 实测：侧边栏折叠/展开、文件阅读模式、上传自动预览、主题切换均正常。
