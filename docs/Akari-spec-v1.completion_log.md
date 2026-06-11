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

## V1 Bug Fix（2026-06-11）

- 修复 assistant 消息 Markdown 渲染：加入 `react-markdown`，assistant 消息走 Markdown 渲染，user 消息保持纯文本。
- 修复计划生成硬编码参数：移除 `createPlan()` 中写死的 `target_score/strengths/weaknesses`，删掉「生成第一周计划」onboarding 按钮，统一走聊天诊断流程生成计划。
- 清理 ChatPanel 假 UI：移除 Sparkles 按钮、「操作前询问」、「请选择模型」3 个无功能按钮。
- 修复 composer hint：移除「选中页面任意文字，会浮出一个临时输入框」（不存在的功能），改为 placeholder「告诉我你的考试目标...」。
- 清理 App.tsx 死代码：移除 `adaptPlan()` 函数、`filesCount` 计算、`GoalTree` 相关无用 import。

### 验证

- `npm run build`：通过
- `npm run test:api`：20 passed

## V1.1 — 交互打磨（2026-06-11）

- 状态：已完成

### 完成范围

- Sidebar 死 UI 清理：移除「接入社交平台」按钮、「助手活动」「任务计划」菜单项、「搜索聊天记录」输入框。
- Workbench 死 UI 清理：移除「项目技能」按钮、「编辑总计划」pencil 按钮、「笺」折叠区域。
- FileTree 右键菜单：添加 click-outside 自动关闭。
- Upload 后端大小限制：multer 添加 `limits.fileSize: 10MB`。
- FilePreview 替换 simpleMarkdown：换 `react-markdown`，消除 XSS 风险 + 修复解析不完整。

### 验证

- `npm run build`：通过
- `npm run test:api`：20 passed

## V1.2 — 工程质量（2026-06-11）

- 状态：已完成

### 完成范围

- chat-service 异步 I/O：`saveSummary` 改 `fs.writeFile`，`readFile` 内部用 async；`appendMessage` 保持同步（单行 JSONL 追加不阻塞）。
- `safeSessionId` 去重：`intent.ts` 改为从 `chat-service.ts` 导入，删除重复定义。
- 清理 `REQUIRED_FIELDS`：`intent.ts` 中未使用常量已删除。
- 共享类型对齐：`workspace-service.ts` 删除本地 `FileNode` 接口，改从 `shared/exam-schema.ts` 导入并 re-export。
- 后台摘要配额保护：添加 `summaryRunning` 单并发锁，防止同时跑多个摘要任务消耗 API 额度。
- Agent loop 测试：8 个新测试（ToolRegistry 注册/执行/错误、generate_plan 校验、abort 中断）。
- Web tools 测试：8 个新测试（SSRF localhost/127.0.0.1/192.168/10.x/172.16、无效 URL、ftp 协议、无 provider 回退）。

### 验证

- `npm run build`：通过
- `npm run test:api`：36 passed

## V1.3 — UI 补齐（2026-06-11）

- 状态：已完成

### 完成范围

- 左侧会话列表新增删除按钮：删除会话条目时同步删除 JSONL 历史、摘要文件，并清理该会话的诊断状态。
- 右侧 Workbench 合并重复 tab：保留「我的规划」和「工作台」两个入口，移除重复的「对话文件」入口。
- 文件预览改为单文件 VS Code 风格：顶部文件 tab、路径 breadcrumbs、正文预览区、底部状态栏；Markdown 继续使用 `react-markdown` 渲染。
- 任务格交互重设计：默认只显示任务主名称；悬浮/聚焦 500ms 后显示详情、番茄钟和删除按钮；双击进入编辑状态。
- 新增会话删除回归测试：覆盖删除历史后再次输入诊断回答不会继承旧会话状态。

### 验证

- `npm run build`：通过
- `npm run test:api`：37 passed

## V1.4 — MVP 收口体验修复（2026-06-11）

- 状态：已完成

### 完成范围

- 会话删除闭环：前端删除后重新拉取服务端会话列表；删除当前/最后一个会话时自动切换或创建空会话；session id 做 URL 编码；后端提供 `DELETE /api/sessions/:sessionId` 和兼容 fallback。
- 右侧工作台单文件阅读模式：文件列表与预览互斥显示，避免长 PDF/长文本挤压遮挡；关闭文件 tab 后返回文件列表。
- Workspace 文档支持收口：修复 DOCX 解析导入兼容；`read_document` 复用 workspace 读取逻辑；上传选择器和 MIME 识别扩展到 PDF/DOCX/RTF/Markdown/TXT/CSV/TSV/JSON/YAML/XML/HTML/TEX/LOG。
- 任务格交互收口：日计划时间段预留两行高度；任务卡默认 compact，hover/聚焦后短延迟显示精简详情和操作；周计划复用 compact 布局。
- 任务拖拽闭环：支持今日视图跨时间段/同段重排，周视图跨日期/任务前后插入，并持久化 `date/time_slot/sort_order`。
- 边栏拖拽体验：扩大左右 resize 命中区域和宽度范围，修复双线视觉。
- 对话输入区调整：发送按钮固定在输入框右下角，附件按钮保留在左下角。
- 开发启动脚本收口：新增 `dev:web`；`dev:desktop` 改为统一托管 API + Vite + Electron，并使用 `concurrently -k` 清理子进程。

### 验证

- `npm run build`：通过
- `npm run test:api`：39 passed
- 接口探测：`GET /api/health` 正常；`DELETE /api/sessions/:id` 与 fallback `POST /api/sessions/:id/delete` 返回 200。

## V1 MVP 阶段总结（2026-06-11）

- 状态：V1 MVP 已完成，可作为第一阶段可运行版本继续使用和演示。

### 已达成的 MVP 能力

- 用户可通过聊天完成考试目标诊断、生成一周学习计划，并在右侧规划区查看今日/本周任务。
- Agent 具备基础工具调用能力：planner tools、web search/fetch、workspace 文档读取、文件写入与文件列表查询。
- 会话具备持久化、切换、删除和长历史摘要能力，诊断状态按会话隔离。
- Workspace 已从临时上传模型升级为真实文件系统工作区，具备路径沙盒、文件树、单文件预览、上传/删除/重命名、PDF/DOCX/常见文本读取。
- UI 已完成三栏布局、工作台、单文件阅读、compact 任务卡、番茄钟记录、任务编辑/删除/拖拽重排等 V1 必要交互。
- 工程质量达到继续迭代标准：TypeScript strict、Vitest 覆盖核心 Agent/Workspace/Web tools/Phase1 flow、构建与 API 测试通过。

### V1 边界内不再继续扩展

- 不做多文件 tab、split editor、最近打开文件、快速打开等 VS Code 级工作台功能。
- 不做旧版 `.doc` 解析；只支持 `.docx` 和常见文本/结构化文本格式。
- 不做 Electron `.dmg` 生产打包；后续作为独立工程阶段处理。
- 不做 V2 的每日总结、错题录入、周报生成。
- 不做 V3 的计划自适应调整和计划 diff 确认流。

### 下一阶段建议

- 进入 V2 前，优先保持 V1 稳定：只修阻塞性 bug，不继续扩大 V1 功能面。
- V2 MVP 聚焦「学习总结与反馈」：每日错题/感受录入、周总结报告、基础统计聚合。
- Electron 打包、Settings 分区化、多文件工作台属于独立后续优化，不应混入 V2 MVP 主线。

## V1 Final Documentation Sync（2026-06-11）

- 状态：已完成

### 完成范围

- README 同步为 V1 冻结后的真实入口：推荐 `npm run dev:web` / `npm run dev:desktop`，补充首次 Settings 配置和最短演示流程。
- Handoff 同步为当前协作真相：前端 transport 类型整理已完成，不再作为当前待办；V1 不继续拆 `App.tsx` / `Workbench.tsx` / CSS。
- CLAUDE.md 同步启动命令、当前 `features/` + `shared/ui/` 前端目录结构和文档索引。
- 新增 `docs/Akari-v1-demo-script.md`，作为 V1 演示与验收 checklist。

### 验证

- `npm run build`：通过
- `npm run test:api`：39 passed

## V2 Direction Confirmed（2026-06-11）

- 状态：已确认方向，尚未开始实现

### 产品方向

- 学习感受不优先做成独立「每日总结」表单，而是在用户完成任务格时记录到对应任务。
- 错题不优先做手填表，而是从用户上传的照片/文稿、workspace 文档、日常问答中提取学习证据。
- LLM 负责生成候选错因归因，包括模块、题目摘要、错误原因、改进建议。
- 候选归因保存前需要用户确认或编辑，避免普通问答和不确定识别污染错题库。
- 每日/每周复盘基于任务完成反馈、实际学习时长、确认后的错题归因和高频原因生成。

### 文档同步

- `docs/Akari-spec-v1.roadmap.md` 已更新 V2 MVP 目标和不做范围。
- 新增 `docs/Akari-design-v2.feedback.md`，作为 V2 数据模型、API 和前端交互设计草案。

## V2 Step 1 — DB Schema & API Contract（2026-06-11）

- 状态：已完成设计，尚未开始实现

### 完成范围

- 在 `docs/Akari-design-v2.feedback.md` 中补齐 V2 additive DB schema：
  - `task_feedback`
  - `learning_artifacts`
  - `error_candidates`
  - `study_reviews`
- 明确共享类型方向：`TaskFeedback`、`LearningArtifact`、`ErrorCandidate`、`StudyReview` 及相关 enum。
- 明确 V2 API contract：任务反馈、学习证据、错题候选生成、候选确认/驳回、每日聚合、周复盘生成与读取。
- 明确实现顺序：先 shared/server schemas 和 DB 表，再 service/API/tests，最后接前端任务反馈和确认卡。
- 路线图同步具体 API 名称。

### 设计约束

- V2 只做 additive schema，不破坏 V1 数据表。
- 错题候选由 LLM 生成，但保存为有效错题前必须用户确认或编辑。
- 上传图片/文稿继续复用 V1 workspace 文件系统，以 workspace path 或 chat ref 作为学习证据来源。

## V2 Step 2 — Feedback Backend Foundation（2026-06-11）

- 状态：已完成后端最小闭环

### 完成范围

- `shared/exam-schema.ts` 新增 V2 共享类型：任务反馈、学习证据、错题候选、复盘报告及相关 enum。
- `server/types.ts` 新增 V2 Zod request schemas、DB row interfaces 和 output schemas。
- `server/db.ts` additive 创建 V2 表：`task_feedback`、`learning_artifacts`、`error_candidates`、`study_reviews`。
- 新增 `server/services/feedback-service.ts`：
  - 保存任务完成反馈，并同步 `daily_tasks.actual_minutes/status`
  - 创建学习证据 artifact
  - deterministic fallback 生成错题候选
  - 查询 pending/全部候选
  - confirm/edit/dismiss 候选
  - daily 聚合与 weekly review 缓存
- 新增 `server/api/feedback.ts` 并挂载 `/api/feedback`。
- `server/api/planner.ts` 新增 `PATCH /api/planner/task/:taskId/feedback`。
- 新增 `server/__tests__/feedback.test.ts`，覆盖任务反馈、artifact、candidate confirm/dismiss、daily 聚合和 weekly review。

### 验证

- `npm run build`：通过
- `npm run test:api`：43 passed

### 尚未包含

- 前端任务格反馈 UI。
- 错题候选确认卡 UI。
- 真实 LLM/视觉模型归因；当前 `candidates/generate` 是可测试的 deterministic fallback。
- 图片 OCR 或自研视觉能力。

## V2 Step 3 — Task Completion Feedback UI（2026-06-11）

- 状态：已完成任务格反馈前端闭环

### 完成范围

- `desktop/src/react/services/types.ts` / `api.ts` 新增任务反馈请求与响应类型，并接入 `saveTaskFeedback()`。
- `desktop/src/react/App.tsx` 新增 `saveTaskFeedback()` handler，保存后刷新 `goal`。
- `desktop/src/react/features/workbench/Workbench.tsx`：
  - 今日任务从 pending 标记完成时，不再直接完成，而是展开轻量反馈面板。
  - 反馈项包括实际分钟、难度、专注状态和一句话复盘。
  - 保存调用 `PATCH /api/planner/task/:taskId/feedback`。
  - 跳过反馈仍保留原有直接完成行为。
  - 周视图保持 compact，不展开反馈面板。
- `desktop/src/react/styles.css` 新增反馈面板样式，保持右侧工作台密度与现有视觉一致。

### 验证

- `npm run build`：通过
- `npm run test:api`：43 passed
- 浏览器本地冒烟：打开 `http://127.0.0.1:5175/`，点击今日任务完成，反馈面板出现；填写并保存后任务变为 completed，进度和已学分钟更新。

### 清理

- 浏览器冒烟写入的一条本地测试反馈已删除，对应任务恢复为 pending / 0 actual minutes。

## V2 Bug Fix — Planner Active Scope & App Date（2026-06-11）

- 状态：已完成

### 问题

- Agent 工具查询今日/本周任务时会混入 archived goals 的历史任务，导致旧重复任务被误认为当前计划。
- 后端部分默认日期使用 UTC `toISOString().slice(0, 10)`，与前端 Asia/Shanghai 日期口径不一致，可能出现“前端今天是 2026-06-11、Agent 查到 2026-06-10”的错位。

### 修复范围

- 新增 `server/services/date-utils.ts`，统一后端 app 日期为 `Asia/Shanghai`。
- `server/services/planner-service.ts` 使用统一日期 helper，并让 `getTasksForDate()` 只返回 active goal 的任务。
- `server/services/tools/planner.ts` 的 `get_today_tasks` / `get_week_tasks` 只查询 active goal 任务。
- `server/api/planner.ts` 与 `server/api/feedback.ts` 默认日期改为 app 日期。
- `server/services/feedback-service.ts` daily / weekly 聚合只统计 active goal 任务。
- 新增 `server/__tests__/planner-active-scope.test.ts`，覆盖“生成新计划后 archived 旧任务不能混入今日/本周查询”。

### 验证

- `npm run build`：通过
- `npm run test:api`：44 passed
- 本地 `.akari/akari.db` 用新查询逻辑读取 `2026-06-11`，只返回 active goal 下的 1 条任务：`数量关系专项训练`。

## V2 Step 4 — Plan Markdown Sync & Plan Workspace Direction（2026-06-11）

- 状态：已完成基础设施与设计同步

### 背景判断

- 当前计划生成是 week-scoped：生成当前周任务，不是一次生成完整多月每日计划。
- 真实备考任务会频繁变化，Akari 不应把一次性生成的计划当成不可变真理。
- Akari 当前还缺少足够专业的考公计划知识库，需要从用户导入材料、粉笔错题 PDF、任务反馈和错题归因中逐步建立证据。

### 完成范围

- 新增 `server/services/plan-document-service.ts`：
  - 将 active goal + weekly plan 渲染为 Markdown
  - 写入 `plans/current-plan.md`
  - 同步一份到 `plans/history/YYYY-MM-DD-goal_xxx.md`
- 计划生成、任务编辑、任务删除、任务反馈和 Agent `generate_plan` 后自动同步当前计划 Markdown。
- 已将当前恢复后的 active plan 立即同步到 `/Users/aaron/Desktop/Akari-WorkSpace/plans/current-plan.md`。
- 新增 `docs/Akari-design-v2.plan_workspace.md`，明确：
  - 计划版本管理
  - Markdown 双向导入/回写方向
  - 用户手写计划和空周计划
  - 粉笔错题 PDF 导入
  - 基于错题/反馈的滚动计划调整
- 路线图和文档索引已同步。

### 验证

- `npm run build`：通过
- `npm run test:api`：44 passed

### 当前限制

- Markdown 目前是数据库到文件的单向同步。
- 旧计划版本 UI、恢复/删除、Markdown 回写任务表、粉笔 PDF 结构化导入尚未实现。

## V2 Step 5 — Plan Versions Backend & Workbench Entry（2026-06-11）

- 状态：已完成计划版本基础闭环

### 完成范围

- `shared/exam-schema.ts` / `server/types.ts` 新增 `PlanVersionSummary` 类型。
- `server/services/plan-document-service.ts` 新增：
  - `listPlanVersions()`
  - `restorePlanVersion(goalId)`
  - `planDocumentPath(goalId)`
- `server/api/planner.ts` 新增：
  - `GET /api/planner/versions`
  - `POST /api/planner/versions/:goalId/restore`
  - `POST /api/planner/document/sync`
- 新增 `server/__tests__/plan-versions.test.ts`，覆盖版本列表、恢复历史计划、按需同步 current-plan.md。
- 前端 API client 接入计划版本接口。
- Workbench 计划卡新增：
  - 打开计划文档
  - 刷新版本
  - 当前/历史计划版本列表
  - 恢复历史计划按钮

### 验证

- `npm run build`：通过
- `npm run test:api`：46 passed
- 浏览器本地冒烟：版本列表显示，打开计划文档可进入 workspace 预览 `plans/current-plan.md`。

### 约束

- 恢复历史计划是显式用户动作，不会自动发生。
- 目前只展示前 4 个版本；完整版本管理页后续再做。

## V2 Step 6 — Wrong-Question Candidate UI & Review Surface（2026-06-11）

- 状态：已完成 V2 反馈闭环的前端基础面

### 完成范围

- 前端 API client 接入：
  - `POST /api/feedback/artifacts`
  - `POST /api/feedback/candidates/generate`
  - `GET /api/feedback/candidates`
  - `PATCH /api/feedback/candidates/:id`
  - `GET /api/feedback/daily`
  - `GET /api/feedback/weekly`
  - `POST /api/feedback/weekly`
- Workbench 新增“错题归因”面板：
  - 支持粘贴错题/解析/卡点文本
  - 支持从当前工作台预览文档生成证据和错因候选
  - 生成待确认错因候选
  - 展示待确认候选
  - 支持确认/驳回候选
- 上传入口校验与 UI accept 保持一致，支持 PDF、Word 和常见文本材料进入工作台预览。
- Workbench 新增“学习复盘”面板：
  - 展示今日完成数、反馈分钟、困难任务、已确认错因数
  - 展示当天高频错因标签
  - 支持生成/重新生成本周复盘
- 任务完成反馈、错题候选确认、计划切换后会刷新复盘数据。
- 计时器记录完成任务后同步刷新计划版本和复盘摘要。

### 验证

- `npm run build`：通过
- `npm run test:api`：46 passed
- 浏览器本地冒烟：Workbench 可见“计划版本”“错题归因”“学习复盘”“生成周复盘/重新生成周复盘”。

### 当前限制

- 错题材料目前支持手动文本入口；PDF/图片提取还未接入 UI。
- 周复盘目前是生成式摘要展示；可编辑周报、导出和历史复盘列表尚未实现。

## V2 Step 7 — Workbench Information Architecture Cleanup（2026-06-11）

- 状态：已完成右侧工作台信息架构收敛

### 背景

- V2 初版把计划版本、错题归因、学习复盘和每日/每周计划堆在“我的规划”同一页，导致原本的每日计划和每周计划被挤到下方。
- 右侧面板缺少清晰滚动容器，下方内容在小高度窗口中不可见。

### 完成范围

- 右侧 Workbench tab 调整为：
  - `我的规划`：只承载目标摘要、今日计划、本周计划
  - `复盘错题`：承载计划文档/版本、错题归因、学习复盘、周复盘
  - `工作台`：承载文件树和文档预览
- `我的规划` 中的目标卡改为紧凑版，任务区紧随其后。
- 新增 `plan-panel` / `review-panel` 内容容器，保证右侧面板内容可滚动。
- `day-plan` 增加独立滚动，避免任务列表被上方卡片挤出不可见区域。

### 验证

- `npm run build`：通过
- `npm run test:api`：46 passed
- 浏览器本地冒烟：
  - `我的规划` 可见 `今日` / `本周` 和任务区
  - `我的规划` 不再显示 `错题归因` / `学习复盘`
  - `复盘错题` 可见 `计划版本` / `错题归因` / `学习复盘`
