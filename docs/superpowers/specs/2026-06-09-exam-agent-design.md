# 考公Agent 技术设计文档

目标是构建一个由 Aaron 完整持有版权的考公备考 Agent。现有 Akari/Hana 项目只作为体验参考和资产来源审计对象；新项目不 Fork、不搬运 Akari/Hana 的通用 UI、Electron 壳、状态管理、主题系统或后端代码。仅迁移经确认由 Aaron 原创的 planner 相关代码与产品逻辑，其余部分采用 clean-room 方式重新实现。

---

## 1. 总体架构

### 1.1 运行时模型

Electron 主进程通过 `child_process.spawn()` 启动 Python FastAPI 作为 sidecar 进程，监听 `127.0.0.1:8742`。React 前端与 Python 后端全部通过本地 HTTP + WebSocket 通信，不经过网络栈。

```
Electron Main Process
├── BrowserWindow (React 19 + Vite)
│     ├── 左栏：会话管理
│     ├── 中栏：对话区
│     └── 右栏：智能工作台
│
└── child_process.spawn("python", ["-m", "backend"])
      └── FastAPI @ 127.0.0.1:8742
            ├── LangGraph 工作流引擎
            │     ├── 诊断官 Agent
            │     ├── 规划师 Agent
            │     ├── 出题官 Agent
            │     ├── 答疑官 Agent
            │     ├── 申论批改官 Agent
            │     └── 时政追踪 Agent
            ├── SQLite + sqlite-vec（向量检索）
            └── DeepSeek API（底层 LLM）
```

### 1.2 通信协议

| 场景 | 协议 | 端点 |
|------|------|------|
| 对话（非流式） | HTTP POST | `/api/chat` |
| 对话（流式输出） | WebSocket | `/ws/chat/{session_id}` |
| 计划 CRUD | REST | `/api/planner/*` |
| 文件上传（PDF/Word） | multipart | `/api/files/upload` |
| 事件推送（计划更新） | WebSocket | `/ws/events` |
| 用户画像查询 | REST | `/api/profile/*` |

### 1.3 原创版权策略

版权目标优先级高于短期复用速度。任何无法明确证明为 Aaron 原创的 Akari/Hana 源码、样式、资源、文案和状态实现，都不进入新仓库。

| 分类 | 处理方式 | 说明 |
|------|----------|------|
| Aaron 原创 planner 资产 | 允许迁移 | 包括计划任务栏 UI、计划 schema、计划 CRUD/校验/自适应逻辑中由 Aaron 独立实现的部分 |
| Akari/Hana 通用代码 | 不迁移 | Electron 主进程、聊天 UI、Zustand slices、主题系统、server/core/hub/lib 等重新实现 |
| 产品概念 | 可参考 | 三栏布局、计划面板、番茄钟、对话工作流属于抽象产品思路，可重新设计实现 |
| 视觉表达 | 重新设计 | 不复制原项目组件结构、CSS、图片、图标封装、动效、文案 |
| 第三方依赖 | 正常使用 | React、Electron、FastAPI、LangGraph 等按各自许可证合规使用 |

新仓库应新增 `ORIGINALITY.md`，记录迁移文件、原创依据、重写范围和禁止搬运清单。

### 1.4 目录结构

新项目目录结构。标注 `[迁移]` 的内容必须先通过原创性审计；标注 `[重写]` 的内容从零实现。

```
考公Agent/
├── desktop/                          [重写] Electron 桌面应用
│   ├── src/
│   │   ├── main/                     [重写] Electron 主进程
│   │   │   ├── bootstrap.cjs         入口
│   │   │   └── python-launcher.js    spawn Python 后端
│   │   └── react/                    [重写] React UI
│   │       ├── components/           [重写] 通用组件
│   │       ├── modules/
│   │       │   ├── chat/             [重写] 左栏+中栏
│   │       │   ├── planner/          [迁移+改造] Aaron 原创计划任务栏
│   │       │   └── exam-workbench/   [新增] 考公专属工作台
│   │       ├── stores/               [重写] Zustand 状态管理
│   │       └── services/             [重写] API/WebSocket 通信层
│   └── preload/                      [重写] 预加载脚本
│
├── backend/                          [新增] Python 后端
│   ├── __init__.py
│   ├── main.py                       FastAPI 入口，启动 8742 端口
│   ├── api/
│   │   ├── __init__.py
│   │   ├── chat.py                   对话路由
│   │   ├── planner.py                计划 CRUD 路由
│   │   ├── files.py                  文件上传路由
│   │   └── profile.py                用户画像路由
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── base.py                   Agent 基类（工具注册、记忆注入）
│   │   ├── diagnostician.py          诊断官：错题分析 → 识别薄弱点
│   │   ├── planner.py                规划师：画像+剩余时间 → 计划生成
│   │   ├── quizzer.py                出题官：薄弱点 → 专项练习题
│   │   ├── tutor.py                  答疑官：按画像控制讲解深度
│   │   ├── essay_grader.py           申论批改官：智能批改+范文
│   │   └── news_tracker.py           时政追踪：监控+主动推送
│   ├── core/
│   │   ├── __init__.py
│   │   ├── orchestrator.py           LangGraph StateGraph 编排
│   │   └── model.py                  DeepSeek API 封装
│   ├── db/
│   │   ├── __init__.py
│   │   ├── database.py               SQLite 连接管理
│   │   ├── models.py                 SQLAlchemy ORM 模型
│   │   └── vector.py                 sqlite-vec 向量索引
│   ├── services/
│   │   ├── __init__.py
│   │   ├── exam_generator.py         LLM 出题逻辑
│   │   ├── essay_grader.py           申论批改逻辑
│   │   ├── news_monitor.py           时政爬取+筛选
│   │   └── profile_builder.py        画像构建（CPL 置信度加权）
│   └── memory/
│       ├── __init__.py
│       ├── pipeline.py               记忆压缩 pipeline（today→week→longterm）
│       └── fact_store.py             结构画像存储
│
├── shared/                           [新增] TypeScript 类型镜像
├── package.json                      [新增] Electron/React 构建配置
├── requirements.txt                  [新增] Python 依赖
├── pyproject.toml                    [新增] Python 项目配置
├── ORIGINALITY.md                    [新增] 原创性与迁移审计记录
├── CLAUDE.md                         [新增] 项目指引
└── LICENSE                           Aaron 自选许可证
```

### 1.5 Clean-room 重写清单

以下 Akari/Hana 目录和功能不进入新项目。需要同等能力时，只能参考功能需求后重新实现：

| 目录 | 原因 |
|------|------|
| `server/` | Hono Node 后端不迁移，FastAPI 从零实现 |
| `hub/` | Agent 间 DM/Channel 路由不迁移，LangGraph/路由逻辑从零实现 |
| `core/` | Node Agent 引擎不迁移 |
| `lib/` | Node 工具库不迁移；仅审计 Aaron 原创 planner 逻辑后迁移等价实现 |
| `cli/` | 命令行入口 → 不需要 |
| `plugins/` | 插件系统不迁移 |
| `skills2set/` | 技能集不迁移 |
| `examples/` | 示例代码不迁移 |
| `packages/` | workspace 子包不迁移 |
| `desktop/src/react` 通用 UI | 聊天、设置、主题、布局等不迁移 |
| `desktop/src/main` | Electron 壳从零实现 |
| `desktop/native` | 原生 helper 不迁移，MVP 不做电脑控制 |
| `assets` 中非原创资源 | 不迁移 |

---

## 2. 数据模型

数据模型、状态流转、数据库表结构和 MVP API 契约以 [`exam-domain-model.md`](./exam-domain-model.md) 为唯一编码合同。本节只保留核心摘要，避免总体设计和实现契约出现双源漂移。

### 2.1 核心关系

```
Goal (主目标：国考150分)
  ├── Track (分项：行测 | 申论 | 面试)
  │     └── Module (子模块：资料分析、言语理解、申论作文等)
  ├── WeeklyPlan (周计划，挂在 Goal 下，允许跨模块混合)
  │     └── DailyTask (每日任务，关联具体 Module)
  │           └── PracticeSession (练习事实记录)
  │                 └── ErrorRecord (错题)
  └── StudentProfile (画像派生缓存)
```

### 2.2 关键决策

- `WeeklyPlan` 挂在 `Goal` 下，不挂在 `Module` 下。一周计划天然跨模块混合。
- `DailyTask.module_id` 表达任务所属模块。
- `PracticeSession` 是练习事实层，画像、正确率和自适应计划都从它计算。
- `StudentProfile` 是派生缓存，不由 UI 直接编辑。
- Python 端 Pydantic 模型为正源，`shared/exam-schema.ts` 是前端镜像。

### 2.3 与 Akari Agent schema 的差异

| 维度 | Akari Agent | 考公Agent |
|------|-------------|-----------|
| 层级关系 | 4 层通用计划 | Goal/Track/Module + Goal-level WeeklyPlan + Module-level task |
| Phase/阶段 | 通用 `Phase`，内容自由 | 固定为行测/申论/面试 3 个 `Track` |
| 任务类型 | 通用 `DailyTask`，无分类 | `TaskType` 区分 练题/模考/复习/申论 |
| 考试特有字段 | 无 | `correctRate`, `questionCount`, `proficiency` |
| 练习事实层 | 无 | `PracticeSession` 记录题量、正确数、耗时、标签 |
| 错题本 | 无 | `ErrorRecord` 表，关联 PracticeSession + Module |
| 用户画像 | memory pipeline 输出 | 结构化 `StudentProfile` 派生缓存，含强弱项和熟练度 |

---

## 3. Python 后端

### 3.1 技术栈

```
FastAPI        Web 框架（REST + WebSocket）
LangGraph      多 Agent 工作流编排
SQLAlchemy     ORM
sqlite-vec     向量检索扩展
Pydantic       数据校验
DeepSeek SDK   LLM 调用
httpx          时政爬取
```

### 3.2 FastAPI 端点清单

```
对话类:
  POST /api/chat                    发送消息 → LangGraph 编排 → 返回结果
  WS   /ws/chat/{session_id}        流式对话（Server-Sent Events 风格）

计划类:
  GET    /api/planner/goal          获取当前主目标+完整树
  POST   /api/planner/generate      触发 LLM 生成学习计划
  POST   /api/planner/adapt         根据完成情况调整计划
  GET    /api/planner/today         今日任务列表
  GET    /api/planner/week          本周任务列表
  PATCH  /api/planner/task/{id}     更新单个任务状态
  DELETE /api/planner/task/{id}     删除任务
  POST   /api/planner/task          创建任务

文件类:
  POST   /api/files/upload          上传 PDF/Word
  GET    /api/files/{id}            获取文件
  GET    /api/files/workbench       文件工作台列表

画像类:
  GET    /api/profile               获取学生画像
  POST   /api/profile/diagnose      触发诊断 → 更新画像

错题类:
  GET    /api/errors?module_id=     按模块查询错题
  POST   /api/errors                记录错题
  PATCH  /api/errors/{id}/review    标记已复习

时政类:
  GET    /api/news                   获取时政推送列表
  POST   /api/news/subscribe        订阅特定主题
```

### 3.3 Agent 编排（Phase 1 vs Phase 2+）

**Phase 1（4-6 周）不引入 LangGraph。** 答疑官和规划师分别作为独立的 LLM 调用，通过 FastAPI 路由直接串联。路由层判断意图 → 调用对应 Agent 函数 → 返回结果。单 Agent 调用链无需 DAG 编排。

**Phase 2+ 引入 LangGraph。** 当 Agent 间需要条件路由（诊断官出结果 → 自动触发出题官）和并行执行时，再用 `StateGraph` 编排。

以「用户请求一套专项题」为例（Phase 2+ 的 LangGraph 实现）：

```python
# 用户: "资料分析正确率太低，帮我出一套题"

# StateGraph 节点序列：
#   用户输入 → Router(意图识别) → 诊断官(查询错题本+画像)
#   → 出题官(根据薄弱点生成题目) → Response

# 核心 State 定义
class AgentState(TypedDict):
    messages: list[BaseMessage]      # 对话历史
    intent: str                      # 用户意图
    student_profile: StudentProfile  # 考生画像
    active_agents: list[str]         # 本轮参与的 Agent
    output: str                      # 最终输出

# 编排
workflow = StateGraph(AgentState)
workflow.add_node("router", router_node)        # 意图识别
workflow.add_node("diagnose", diagnostician_node)
workflow.add_node("plan", planner_node)
workflow.add_node("quiz", quizzer_node)
workflow.add_node("answer", tutor_node)
workflow.add_node("grade", essay_grader_node)
workflow.add_node("respond", response_node)

# 条件路由
workflow.add_conditional_edges("router", route_by_intent, {
    "diagnose": "diagnose",
    "plan": "plan",
    "quiz": "quiz",
    "ask": "answer",
    "grade": "grade",
})
```

### 3.4 记忆 Pipeline

参考“短期会话 → 周期总结 → 长期画像”的通用记忆需求，Python 从零实现：

```
会话 JSONL → LLM 每 10 轮rolling summary → today.md
                                     → week.md (每日)
                                     → longterm.md (每周)
                                     → facts → StudentProfile (结构化画像)
```

CPL 置信度加权公式直接实现 CogEvo-Edu 论文的算法：

```
proficiency = correct_rate × 0.6 + consistency × 0.2 + recency × 0.2
```
- `correct_rate`：该模块历史正确率
- `consistency`：最近 5 次练习正确率标准差的反比（越稳定越高）
- `recency`：最近一次练习距今的天数衰减

---

## 4. React 前端

### 4.1 组件树

```
App
├── TitleBar (macOS 无边框窗口标题栏)
├── AppLayout (三栏容器)
│   ├── LeftSidebar (左栏)
│   │   ├── SessionList          会话列表+搜索（重新实现）
│   │   ├── AgentModeSwitcher    Agent 模式切换（答疑/出题/模考/申论）
│   │   ├── UserProfile          个人中心
│   │   └── ThemeToggle          亮色/暗色切换
│   │
│   ├── ChatPanel (中栏)
│   │   ├── ChatHeader           当前会话标题 + 清空 + 导出
│   │   ├── MessageList          消息列表
│   │   │   ├── TextBubble       Markdown 渲染 + 代码高亮
│   │   │   ├── TaskCardBubble   任务卡片内嵌（可操作 checkbox）
│   │   │   ├── QuizBubble       题目卡片（选项交互）
│   │   │   └── FileBubble       文件卡片（下载/预览）
│   │   ├── StreamingText        流式输出文本
│   │   └── InputArea            输入框
│   │       ├── FileUpload       文件上传按钮
│   │       ├── ModelSelector    切换 DeepSeek/其他模型
│   │       └── SendButton       发送
│   │
│   └── RightWorkbench (右栏)
│       ├── TabBar               "计划" | "文件" 双 Tab
│       ├── PlanTab (计划栏)
│       │   ├── GoalHeader       目标卡片 + 总进度条
│       │   ├── RadarChart       行测|申论|面试 能力雷达图
│       │   ├── KnowledgeTree    知识树（可折叠 5 层）
│       │   │   ├── TrackNode    行测/申论/面试
│       │   │   ├── ModuleNode   常识/言语/判断/数量/资料
│       │   │   └── WeekNode     本周计划
│       │   └── DayTabs          每日任务 / 本周任务
│       │       ├── DailyTaskList  任务卡片列表
│       │       │   └── TaskCard   可拖拽排序、checkbox、展开详情
│       │       └── WeeklyView     周视图（7 天网格）
│       └── FilesTab (文件工作台)
│           ├── FileCategory      分类筛选（资料/计划/试卷/报告）
│           ├── FileList          文件列表
│           └── FilePreview       文件预览（PDF/图片）
│
└── Overlays
    ├── SettingsModal             设置弹窗
    ├── PomodoroPopover           番茄钟
    └── OnboardingWizard          首次引导（初始测评对话）
```

### 4.2 迁移与重写清单

新项目不直接搬运 Akari/Hana 通用 UI。仅迁移 Aaron 原创 planner 资产；其余功能按相同产品目标重新实现。

| 模块 | 处理方式 | 说明 |
|------|----------|------|
| `PlanPanel` / 计划任务栏 | 迁移+改造 | Aaron 原创部分可迁移，改为 5 层考公数据模型 |
| `TaskCard` / `DailyTaskGrid` | 迁移+改造 | Aaron 原创任务交互可保留，加入题量、正确率、错题入口 |
| `PomodoroPopover` | 迁移或重写 | 若确认为 Aaron 原创则迁移；否则按功能重写 |
| `shared/plan-schema.ts` | 迁移+重命名 | 演进为 `shared/exam-schema.ts`，前端类型镜像 Python Pydantic |
| 计划 CRUD/校验逻辑 | 迁移思路+Python 重写 | 不迁移 Node 后端代码，按 Aaron 原创业务规则用 Python 实现 |
| 左栏会话列表 | 重写 | 不搬运 `ChatSidebar`，重新实现 `SessionSidebar` |
| 中栏聊天区 | 重写 | 不搬运 `ChatArea`/`InputArea`/消息组件 |
| 状态管理 | 重写 | 重新设计 Zustand slices，不搬运 Akari/Hana store |
| API client/WebSocket | 重写 | 新建 `apiClient` 和事件总线，不使用 `hanaFetch` 命名或实现 |
| CSS 主题系统 | 重写 | 重新定义 tokens、主题、布局和视觉语言 |

### 4.3 需要重写的部分

| 组件 | 原因 |
|------|------|
| Electron 主进程 | 避免继承 Akari/Hana 壳代码，重新实现窗口、托盘、Python sidecar |
| `SessionSidebar` | 会话列表需求保留，但 UI 和状态实现重新设计 |
| `ChatPanel` / `InputArea` | 对话区重新实现，支持流式、文件、题目卡片 |
| `AppLayout` | 三栏思路保留，DOM/CSS/响应式行为重新实现 |
| `PlanPanel` | 从 4 层改 5 层数据，加 Track/Module 节点；仅迁移 Aaron 原创计划任务栏逻辑 |
| `GoalHeader` | 加雷达图、目标分数展示 |
| `DailyTaskGrid` / `TaskCard` | 加 `TaskType` 标签、正确率显示、错题入口 |
| `KnowledgeTree` | 全新：可折叠树形控件 |
| `RadarChart` | 全新：Canvas/SVG 雷达图 |
| `FilesTab` | 全新：文件分类+预览 |
| `OnboardingWizard` | 全新：初始测评引导 |

### 4.4 状态管理

状态管理从零设计，不迁移 Akari/Hana slices。为了减少耦合，MVP 只保留以下 6 个 slice：

| Slice | 职责 |
|-------|------|
| `sessionSlice` | 会话列表、当前会话、会话元数据 |
| `chatSlice` | 消息列表、流式状态、工具卡片 |
| `examSlice` | goal/tracks/modules/tasks 的本地缓存和乐观更新 |
| `profileSlice` | 考生画像、模块熟练度、弱项 |
| `workbenchSlice` | 右栏 Tab、知识树展开状态 |
| `uiSlice` | toast、modal、主题、连接状态 |

---

## 5. 实施路线图

以一个人头计算的工作量。Phase 1 为单人可以交付的 MVP 范围。

### Phase 1：核心验证（4-6 周）

**目标**：新建 clean-room 仓库 → 迁移 Aaron 原创 planner 资产 → 建 Python 后端 → 跑通「言语理解 + 资料分析」两个模块的对话+计划闭环

| 周 | 任务 | 产出 |
|----|------|------|
| 1 | 建新仓库，完成 `ORIGINALITY.md` 和迁移审计 | 干净的原创版权边界 |
| 1 | 重写 Electron + React + Vite 最小壳 | 三栏空布局可运行 |
| 1 | 搭建 Python FastAPI 骨架，配 SQLite + SQLAlchemy | `backend/` 可运行 |
| 2 | 实现 7 张数据表的 ORM 模型 + CRUD API | 数据层完成 |
| 2 | 实现答疑官 Agent（调用 DeepSeek，含考公系统提示词） | 基础对话可用 |
| 3 | 实现规划师 Agent + `/api/planner/generate` | LLM 生成学习计划 |
| 3 | 迁移 Aaron 原创 planner UI，重写左栏+中栏 | 三栏界面可用 |
| 4 | 实现规划师自适应（根据完成度调整计划） | 计划动态更新 |
| 4 | 实现用户画像（CPL 简化版，正确率计算） | 画像雏形 |
| 5 | 连接 Electron 主进程 → Python sidecar 启动 | 桌面 App 可运行 |
| 5-6 | 内测 + Bug 修复 | MVP 可交付 |

**Phase 1 不包含**：向量检索、LangGraph 复杂编排、申论批改、时政追踪、文件上传。

### Phase 2：核心能力（6-8 周）

- LangGraph StateGraph 正式编排（Router + 条件路由）
- 出题官 Agent（薄弱点 → 专项题）
- 错题本闭环（记录 → 分析 → 回顾 → 掌握）
- sqlite-vec 向量检索集成
- CPL 置信度加权画像（完整版）
- 文件上传 + 文件工作台
- 申论批改官（LLM 批改 + 范文生成）

### Phase 3：精细化与商业化（8-12 周）

- 全部模块覆盖（常识+判断+数量+面试）
- 时政追踪 Agent（爬取+筛选+主动推送）
- 模考雷达图 + 能力趋势分析
- 多轮画像迭代优化
- 付费订阅基础设施（Stripe 集成）
- Electron 打包+分发

---

## 6. 依赖清单

### Python (requirements.txt)

```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
langgraph>=0.2.0
langchain-core>=0.3.0
deepseek-sdk
sqlalchemy>=2.0.0
sqlite-vec>=0.1.0
pydantic>=2.0.0
python-multipart
websockets
httpx
python-dotenv
```

### Node (package.json)

关键依赖使用 Electron 42、React 19、Vite 7、TypeScript 5.9。`package.json` 从零创建，只包含桌面壳、前端构建、测试和打包依赖；不继承 Akari/Hana 的 Node 后端依赖或脚本。

### 开发环境

```
Python 3.12+
Node 24.12+ (或降级处理 extract-zip 兼容)
Electron 42.3.0
```

---

## 附录 A：资产迁移审计表

| 资产 | 处理方式 | 版权边界 |
|------|----------|----------|
| 计划任务栏 UI | 迁移+改造 | Aaron 原创；迁移前在 `ORIGINALITY.md` 记录文件清单 |
| 任务卡片交互 | 迁移+改造 | Aaron 原创部分保留，适配考公字段 |
| 番茄钟 | 待审计 | 确认为 Aaron 原创才迁移，否则重写 |
| 计划 schema | 迁移+演进 | Aaron 原创，改为 exam schema |
| 计划 CRUD/校验/自适应规则 | Python 重写 | 迁移业务规则，不搬运 Node 实现 |
| 左栏/中栏聊天 UI | 重写 | 不迁移 Akari/Hana 代码 |
| Electron 主进程/preload | 重写 | 不迁移 Akari/Hana 代码 |
| Zustand store/API client/WebSocket | 重写 | 不迁移 Akari/Hana 代码 |
| CSS 主题/全局样式 | 重写 | 不迁移 Akari/Hana 视觉表达 |

## 附录 B：关键决策汇总

| 决策项 | 结论 | 核心理由 |
|--------|------|----------|
| Fork vs 新建 | 新建 clean-room 仓库 | 满足完整自有版权目标 |
| 前端框架 | React 19 | 技术成熟，便于迁移 Aaron 原创 planner 资产 |
| 后端语言 | Python | LangGraph + sentence-transformers + Pydantic |
| Web 框架 | FastAPI | async 原生，WebSocket 内置 |
| 数据库 | SQLite + sqlite-vec | 零配置桌面分发 |
| Agent 运行时 | Python LangGraph（Phase 2） | Phase 1 直接 LLM 调用，够用 |
| Electron 集成 | sidecar spawn | 桌面分发简单，前后端边界清晰 |
| CSS 主题 | 从零设计 tokens | 避免继承 Akari/Hana 视觉表达 |
