# Akari V2 Design

Last updated: 2026-06-12

V2 的目标是把 Akari 从「生成计划」推进到「学习证据 → 复盘诊断 → 下周行动」的闭环。用户仍然拥有计划和复盘的最终判断权；Akari 负责整理数据、发现模式、生成记忆清单、回粉笔重做清单和计划建议。

## 产品定位

Fenbi 已经负责原题、图片、图表、解析和重做环境。Akari 不做粉笔替代品，也不做传统错题本。

Akari 的 V2 边界是：

- 跨题诊断：从 PDF、任务反馈、手动素材和聊天中找重复薄弱点。
- 记忆清单：提炼需要再次记住的公式、题型、判断规则。
- 回粉笔重做清单：告诉用户回到 Fenbi 重做哪些类型或来源的题。
- 计划建议：根据已确认材料建议下周动作，但不自动替用户改计划。

## 核心原则

- 聊天负责分析、分拣、确认和解释。
- 右侧 Workbench 只管理数据源、状态和复盘入口，不展示长 PDF 报告。
- 上传材料不一定是复盘素材，必须先在聊天里判断。
- 任何材料写入日/周复盘前，都必须经过用户确认。
- 是否关联今日任务是可选项；关联只影响聚合数据，不改变 `我的规划` 任务卡 UI。

## V2 主流程

### 任务反馈

1. 用户在 `我的规划` 完成今日任务。
2. 日视图打开轻量反馈浮层。
3. 用户记录实际用时、难度、专注状态和一句简短感想。
4. 后端写入 `task_feedback`，同时更新任务完成态和 `actual_minutes`。
5. 日/周复盘聚合任务完成和反馈数据。

### 手动复盘素材

1. 用户在 `复盘素材` 粘贴错题原件、批注或反思。
2. Akari 生成候选素材。
3. 用户确认、编辑或忽略。
4. 只有 confirmed candidates 会进入日/周复盘。

### 粉笔 PDF / workspace 文件

1. 用户在聊天区上传或引用文件。
2. Agent 使用 workspace document tool 读取文件。
3. Agent 先判断它是否像复盘素材。
4. 如果不像，只说明用途判断，不写入复盘。
5. 如果像，先询问是否计入复盘。
6. 用户确认后，再询问是否关联今日任务。
7. Agent 调用确认入库工具记录 artifact，并生成 PDF 诊断条目。
8. confirmed `PDF诊断` candidates 进入日/周复盘聚合。

## 数据模型

V2 使用 additive schema，不做 destructive migration。

### `task_feedback`

记录任务完成反馈：

- `daily_task_id`
- `actual_minutes`
- `difficulty`: `easy | ok | hard`
- `focus`: `focused | normal | distracted | tired`
- `note`

### `learning_artifacts`

记录原始学习证据：

- `source_type`: `workspace_file | chat | manual`
- `source_ref`: workspace path、session/message ref 或空字符串
- `daily_task_id`: nullable
- `title`
- `raw_text`
- `metadata_json`

### `error_candidates`

记录待确认或已确认的复盘诊断：

- `artifact_id`
- `daily_task_id`: nullable
- `module_id`: nullable
- `subject`
- `question_type`
- `question_summary`
- `mistake_summary`
- `cause`
- `suggested_fix`
- `confidence`
- `status`: `pending | confirmed | dismissed`
- `confirmed_at`

PDF 复盘报告不会被当作传统错题卡。它会转换为最多 3-5 条 confirmed `PDF诊断` 条目，作为聚合入口。

### `study_reviews`

缓存 daily/weekly Markdown summary 和 stats。

- daily review 可合并多个 PDF artifact 的报告摘要。
- weekly review 聚合任务反馈、confirmed candidates 和 PDF 诊断数量。

## API surface

- `PATCH /api/planner/task/:taskId/feedback`
- `POST /api/feedback/artifacts`
- `POST /api/feedback/artifacts/analyze-pdf-review`
- `POST /api/feedback/candidates/generate`
- `GET /api/feedback/candidates`
- `PATCH /api/feedback/candidates/:candidateId`
- `GET /api/feedback/daily`
- `POST /api/feedback/weekly`
- `GET /api/feedback/weekly`
- `POST /api/planner/manual`
- `PATCH /api/planner/goal`
- plan version list / restore / archive / delete / sync routes

## Workbench 信息架构

右侧 Workbench 保持三类入口：

- `我的规划`：目标、日/周任务、任务编辑、完成反馈。
- `复盘素材`：手动素材、待确认素材、已确认统计、日/周复盘、计划版本入口。
- `工作台`：workspace 文件树、文件预览、上传入口。

`复盘素材` 不再承担长报告阅读区。长分析由聊天输出；右侧只显示状态和管理动作。

## 计划工作台方向

V2 让用户拥有可编辑、可导出、可恢复的计划工作台：

- Agent-generated plan：用户描述目标，Agent 生成一周计划。
- User-authored plan：用户手动建立目标和任务，Agent 不强制介入。
- Evidence-driven plan：用户上传 PDF、笔记或反馈后，Agent 给出建议。

当前计划同步到 workspace Markdown：

```text
plans/current-plan.md
plans/history/*.md
```

当前是 DB → Markdown 单向同步；Markdown import/back-write 是后续能力。

## V2 已实现的 MVP 闭环

- 手动建立规划。
- 目标标题/描述编辑。
- 当前周日视图切换。
- 任务完成反馈。
- 复盘素材候选生成、确认、忽略。
- 粉笔 PDF 复盘分析：薄弱点、记忆清单、回粉笔重做清单、计划建议。
- 聊天上传文件后分拣并确认是否计入复盘。
- PDF 诊断进入日/周复盘聚合。
- 详细 Markdown 周复盘和浮窗查看。
- 当前计划 Markdown 同步和计划版本管理。

## V2 non-goals

- 不做无确认的自动入库。
- 不做 OCR、视觉模型训练或题图快照入库。
- 不依赖 Fenbi 私有 API 或爬取。
- 不做传统完整错题本。
- 不自动替用户调整计划。
- 不生成固定多月每日任务。
- 不做申论批改、出题 Agent、能力雷达图或趋势折线图。

## 后续风险

- PDF 文本解析可能缺图表和图片信息，聊天文案必须提醒用户回 Fenbi 看原题。
- 周复盘仍是 Markdown summary，不是完整结构化 review schema。
- PDF 诊断是跨题复盘入口，不应伪装成逐题答案解析。
- 计划调整仍应进入 V3，由用户确认 diff 后应用。
