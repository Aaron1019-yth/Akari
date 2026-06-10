# Akari MVP 完整设计规格（Phase 1–3）

> **Phase 1**：对话式规划教练 — Agent 多轮交互收集信息，生成个性化每日计划，具备 web_search/web_fetch/read_document 通用工具。
> **Phase 2**：学习总结与反馈 — 用户录入每日错题与感受，自动生成周总结报告。
> **Phase 3**：计划自适应调整 — 基于总结数据动态优化下周计划。

> **实现状态（2026-06-10）**：Phase 1 MVP 已完成，验收记录见 `docs/PHASE_COMPLETION_LOG.md`。当前进入 Phase 1.5，重点为 UI/体验优化、会话管理、历史摘要与工程分层 polish。

---

## 1. 系统架构

```
用户输入 → WebSocket → backend/api/chat.py
                          ↓
                    IntentClassifier (规则引擎)
                    ├─ ASK        → 引导提问
                    ├─ PLAN       → AgentLoop.run()
                    ├─ ADJUST     → AgentLoop.run()
                    ├─ QUERY_PLAN → 读数据库，返回计划卡片
                    └─ CHAT       → AgentLoop.run()（兜底）
                          ↓
                    AgentLoop (扩展)
                    ├─ 加载上下文 (JSONL 历史 + session_state.json)
                    ├─ System prompt (静态角色 + 当前时间，不含用户状态)
                    ├─ Tools: web_search / web_fetch / read_document
                    ├─ Tools: planner CRUD (现有6个) + generate_plan
                    └─ Schema 校验层 (AgentLoop 拦截，不通过→构造修正指令→重试)
                          ↓
                    返回给前端
                    ├─ text_delta → 聊天区流式渲染
                    ├─ plan_card → 右侧栏刷新
                    └─ file_list → 对话文件 tab 刷新
```

### 改动点 vs 当前代码

| 模块 | 现有 | Phase 1 |
|------|------|---------|
| `backend/api/chat.py` | 直接调 AgentLoop | 前置 IntentClassifier，分流 |
| `backend/services/agent/loop.py` | 6 tools | +3 通用 tools + generate_plan + 校验层 |
| `backend/services/agent/context.py` | 静态 prompt | 去掉用户状态，只放角色+时间 |
| `backend/services/tools/` | `planner.py` | 新增 `web_search.py`, `web_fetch.py`, `document.py` |
| `backend/services/` | 无 | 新增 `intent.py` (IntentClassifier) |
| `backend/api/` | 无文件端点 | 新增 `files.py` (upload + list) |
| `desktop/src/react/App.tsx` | 无附件 | 拖入/附件按钮 + 计划卡片渲染 + 对话文件 tab |

---

## 2. 意图分类引擎 (IntentClassifier)

### 2.1 Intent 枚举

```python
class Intent(Enum):
    ASK        = "ask"          # 缺信息 → 提问
    PLAN       = "plan"         # 信息完整 + 无计划 → 生成计划
    ADJUST     = "adjust"       # 有计划 + 调整信号 → 修改计划
    QUERY_PLAN = "query_plan"   # 查计划/进度 → 读数据库
    CHAT       = "chat"         # 闲聊/问答/通用对话 → Agent 正常回答
    # 预留扩展: CLI, CODE, BROWSE, ...
```

### 2.2 分流规则

```
用户输入
  ↓
调整关键词 + 有活跃计划 → ADJUST
  ↓ 否
查询计划关键词 → QUERY_PLAN
  ↓ 否
缺必填字段 + 规划意图 → ASK
  ↓ 否
信息完整 + 无计划 + 规划意图 → PLAN
  ↓ 否
→ CHAT (兜底)
```

### 2.3 调整关键词

```
"任务太多" "任务太少" "没时间" "太难" "太简单"
"太多了" "太少了" "调整" "改一下计划"
"今天没时间" "今天不学" "今天请假"
"我已经会了" "这个模块简单" "跳过"
```

### 2.4 查询关键词

```
"看看计划" "我的计划" "今天任务" "今日计划"
"本周计划" "今天学什么" "今天有什么" "进度"
"任务做得怎么样" "完成情况"
```

### 2.5 ASK 分层提问

按优先级顺序，每轮只问 1 个字段。用户一次回答多个字段时框架解析并填充。

| 优先级 | 字段 | 提问示例 |
|--------|------|---------|
| 1 | `exam_type` | 「你想考国考、省考还是事业单位？」 |
| 2 | `target_exam` | 「你计划报考哪个省份？」 |
| 3 | `daily_hours` | 「你每天大概能学几个小时？」 |
| 4 | `current_level` | 「你之前做过真题吗？行测正确率大概多少？」 |
| 5 | `weak_modules` | 「你觉得哪些模块比较薄弱？」 |
| 6 | `student_status` | 「你是在职备考还是全职备考？」 |
| 7 | `target_score` | 「你的目标分数是多少？」 |

---

## 3. 信息收集 & 诊断对话

### 3.1 字段体系

**第一层：确认目标（优先级最高）**
- `exam_type`: 国考/省考/事业单位
- `target_exam`: 具体考试（如广东省考）

**第二层：评估基础能力**
- `daily_hours`: 每日学习小时
- `current_level`: 行测正确率% + 申论分数，真题得分优先，无真题则自评分
- `weak_modules`: 薄弱模块列表

**第三层：用户画像（可延后）**
- `student_status`: 在职/在校/全职
- `target_score`: 目标分数

### 3.2 诊断对话流程

Agent 确认目标后执行模拟诊断：

```
Agent: "在制定计划前，我们先了解你的基础水平。
       你之前做过真题吗？"
用户: "做过2024国考行测，对了60%"
Agent: "了解。申论方面呢？写过作文吗？"
用户: "没怎么练过"
Agent: "你觉得哪些模块比较弱？"
用户: "资料分析和数量关系"
Agent: [整理诊断小结]
      "总结一下：国考，行测正确率60%，申论未评估，
       弱项是资料分析和数量关系。每天能学多久？"
```

### 3.3 临时字段存储

对话中收集但未确认的字段存 `.akari/session_state.json`：

```json
{
  "pending_fields": {
    "exam_type": "国考",
    "daily_hours": null
  },
  "diagnostic_in_progress": true
}
```

用户确认后 → 写入数据库（`goals` 表新增 `exam_type`, `target_exam` 列；学习时间等字段写入 `goals` 或 `student_profiles`）→ 清理 session_state。

---

## 4. System Prompt 设计

### 4.1 构成

```
STATIC PREFIX:
  1. 平台身份：Akari 备考助手
  2. 工具使用纪律：优先低成本工具，web_search 找 URL → web_fetch 读内容
  3. 行为准则：先诊断后开方，分步拆解层层递进，计划可调整
  4. 失败处理：诊断优先于更换方案，不要盲目重试
  5. Action safety framework
  ── 分界线 ──

CURRENT TIME: 2026-06-10 18:30:00 CST
```

**不包含用户状态**。用户状态通过 tool `get_planner_context` 动态查询。

### 4.2 关键行为约束

- **先诊断后开方**：信息不完整时必须提问，禁止直接生成计划
- **分步拆解**：每步只问 1-2 个问题
- **计划可调整**：响应用户反馈（「太多了」→ 降低密度）

---

## 5. 新工具

### 5.1 web_search

```python
Tool(
    name="web_search",
    description="搜索互联网获取实时信息。WHEN 需要查找最新资料、验证事实时使用。",
    parameters={
        "query": "搜索关键词",
        "max_results": "返回结果数，默认5",
    },
)
```

**Provider 回退链**：Tavily → Serper → Brave → AnySearch 免费。API key 从 Settings 读取，无 key 的 provider 跳过。全失败返回 `ok=False`。

**返回**：`{content: "1. **标题**\n   URL\n   摘要", details: {results: [...], provider}}`

### 5.2 web_fetch

```python
Tool(
    name="web_fetch",
    description="获取指定 URL 的网页内容。WHEN 需要阅读搜索结果中的具体文章时使用。",
    parameters={
        "url": "完整 URL（含 https://）",
        "max_length": "返回文本最大字符数，默认8000",
    },
)
```

**实现**：`httpx` → Content-Type 处理 (HTML→`html2text`, JSON→格式化, 纯文本→原样) → SSRF 防护 (拒绝内网 IP) → 截断。

### 5.3 read_document

```python
Tool(
    name="read_document",
    description="读取用户上传的文档（PDF/Word），提取文本。WHEN 用户提供文件需要分析时使用。",
    parameters={
        "file_path": "文档路径",
        "max_length": "最大字符数，默认10000",
    },
)
```

**实现**：`.pdf` → `pdfplumber`；`.docx` → `python-docx`。大文档截断 + 标注。

### 5.4 generate_plan

```python
Tool(
    name="generate_plan",
    description="根据用户信息生成每日计划。仅在确认所有必填信息完整后调用。",
    parameters={
        "week_start": "YYYY-MM-DD",
        "tasks": [{
            "title": "任务标题",
            "type": "study|practice|review|mock_exam|essay",
            "subject": "资料分析",
            "estimated_minutes": 30,
            "time_slot": "morning|afternoon|evening",
            "date": "YYYY-MM-DD",
            "module_id": "模块ID",
        }]
    },
)
```

**工具只负责写入**：execute 不校验。Schema 校验在 AgentLoop 层做。

---

## 6. 计划生成 & Schema 校验

```
AgentLoop 触发 PLAN 意图
  ↓
LLM 调用 generate_plan({tasks: [...]})
  ↓
AgentLoop 拦截，Pydantic 校验每个 task
  ├─ 通过 → 执行 generate_plan（内部处理旧计划归档 + 写入，保证原子性）
  │         └─ 返回 plan_card 事件
  │
  └─ 失败 → 不执行 tool，构造修正指令：
           "generate_plan 调用失败：task[2] date 格式无效，
            task[3] estimated_minutes 为负数。请修正后重新调用。"
           → 塞入 messages → LLM 重试（最多2次）
           → 2次全失败 → 返回错误给用户
```

**逻辑校验**：只靠 system prompt 约束 + 用户确认，不做硬规则。

---

## 7. 上下文持久化

### 7.1 启动时加载

```
AgentLoop.run() 启动时:
  1. 从 JSONL 读历史消息 → token 估算截断(最近~8K tokens) → 塞入 messages
  2. 从 .akari/session_state.json 读临时字段
  3. system_prompt = 静态角色 + 当前时间
  ↓
messages = [system, ...历史消息, user新消息]
```

### 7.2 运行时

- 用户状态 → Agent 调 `get_planner_context` tool (从 SQLite 读)
- 临时字段 → 存/读 `.akari/session_state.json`
- 确认后 → 写入数据库 + 清理 session_state

### 7.3 消息写入

AgentLoop 在每轮 user 消息和 assistant 完整回复后追加到 session JSONL。

---

## 8. API 端点

### 8.1 新增端点

| 方法 | 端点 | 用途 |
|------|------|------|
| `POST` | `/api/files/upload` | 上传文件 → 返回 `{file_id, file_path}` |
| `GET` | `/api/files` | 列出当前 session 文件 |

### 8.2 新增 WebSocket 事件类型

| 事件 | 用途 |
|------|------|
| `plan_card` | 计划卡片数据，前端渲染计划摘要卡片 |
| `file_list` | 文件列表更新 |

### 8.3 限制

- 文件大小：前端限制 10MB，后端超过 10MB 返回 413
- 支持格式：PDF (.pdf)、Word (.docx)

---

## 9. 前端 UI

### 9a. 聊天框附件/拖入

- 点击 Plus 按钮 → `<input type="file" hidden accept=".pdf,.docx">` → 选文件
- 聊天区 onDrop / onPaste → 同上传流程
- 上传中显示 loading 状态，可取消
- 上传完成后自动插入消息：「用户上传了 xxx.pdf」
- 前端限制 10MB，超限友好提示

### 9b. 右侧栏「对话文件」tab

```
┌─────────────────────────┐
│ 我的规划 | 对话文件 | 工作台 │
├─────────────────────────┤
│ (无文件时)               │
│ 暂无文件，点击聊天框 + 上传 │
│                         │
│ (有文件时)               │
│ 📄 2024国考行测真题.pdf   │
│ 📄 资料分析笔记.docx       │
└─────────────────────────┘
```

- 点击文件 → toast: 「Phase 2 将支持预览」
- Phase 1 不加删除、重命名
- 数据来源：`GET /api/files`

### 9c. 计划卡片渲染

当 Intent=QUERY_PLAN 时返回计划卡片：

```
┌────────────────────────────┐
│ 📋 当前计划                  │
│ 2026-06-10 ~ 2026-06-16    │
│ 完成率：25%（2/8）          │
│                            │
│ 今日任务：                  │
│ ☐ 资料分析速算训练 (下午)     │
│ ☑ 言语理解逻辑填空 (晚上)     │
│                            │
│ [查看完整计划]               │
└────────────────────────────┘
```

**无活跃计划时**：返回空状态卡片「暂无计划，告诉我你的目标，我来帮你制定」。

**多日切换**：Phase 1 只展示「今日」。「本周」「全部」tab 推到 Phase 2。

### 9d. 右侧栏三个 Tab 内容定义

| Tab | Phase 1 | Phase 2 |
|-----|---------|---------|
| 我的规划 | 计划卡片（只读，不可编辑） | 任务拖拽排序、inline 编辑 |
| 对话文件 | 文件列表（只读） | 点击预览、删除、重命名 |
| 工作台 | 占位（显示「Phase 2 将支持笔记」） | 用户自定义笔记、学习记录 |

---

## 10. 验证方案

### 10a. 后端

```
1. IntentClassifier 单元测试：每种意图 3+ 个输入样本
2. web_search tool: mock API 返回 → 验证回退链
3. web_fetch tool: mock HTML → 验证提取 + SSRF 拒绝
4. read_document: 真实 PDF/docx 文件 → 验证文本提取
5. generate_plan schema 校验：坏数据 → 验证修正指令生成
6. 上下文加载：JSONL 截断逻辑 → 验证 token 估算
7. 端到端：无 API key 时 CHAT 返回 error（现有）
```

### 10b. 前端

```
1. 文件拖入 → 验证上传进度 + 取消
2. 文件 >10MB → 验证前端拦截 + 后端 413
3. 对话文件 tab → 空状态 / 有文件状态
4. 计划卡片 → 有活跃计划 / 无活跃计划 两种渲染
5. npm run build 通过
6. npm run test:api 通过
```

---

## 11. 不做的（明确排除）

- 真实出题诊断（生成真题 + 判分）
- 图片 OCR / 视觉识别
- 右侧栏计划编辑（inline 编辑、拖拽排序、删除）
- 对话文件预览、删除、重命名
- 工作台笔记功能
- 多日计划切换（本周/全部）
- LangGraph 编排
- steer / resume_stream
- 数据库 migration

---

# Phase 2：学习总结与反馈

> **目标**：收集用户每日错题内容和学习感受，自动生成周总结报告，为 Phase 3 计划调整提供数据基础。

## 1. 数据模型扩展

最小方案：不新增独立表，复用现有结构。

| 数据 | 存储位置 | 方式 |
|------|---------|------|
| 用户学习感受 | `DailyTask.note` | `daily_tasks` 表新增 `note TEXT` 列 |
| 错题内容/模块/原因 | `ErrorRecord` | 已有 `POST /api/errors/batch` |
| 完成率 | 计算字段 | `DailyTask.status` 聚合 |
| 错题分布 | 计算字段 | `ErrorRecord.module_id` 聚合 |
| 周总结报告 | JSONL | 存储为 session 消息，不单独建表 |

Phase 3 需要周总结结构化数据时再考虑独立表。

## 2. 每日总结 UI

右侧栏「今日计划」区域下方新增「今日总结」：

```
┌─────────────────────────────────────┐
│  📅 今日总结（2026-06-10）           │
├─────────────────────────────────────┤
│  完成任务：                          │
│  ☑ 资料分析速算训练                   │
│  ☑ 言语理解逻辑填空                   │
│  ☐ 判断推理类比推理                   │
│                                     │
│  错题录入（选填）：                   │
│  ┌─────────────────────────────┐   │
│  │ 错题内容：[增长率计算错误...]  │   │
│  │ 所属模块：▼ 资料分析          │   │
│  │ 错误原因：▼ 公式记错          │   │
│  └─────────────────────────────┘   │
│  [+ 添加另一道错题]                  │
│                                     │
│  学习感受（选填）：                   │
│  ┌─────────────────────────────┐   │
│  │ 今天资料分析感觉进度慢...    │   │
│  └─────────────────────────────┘   │
│                                     │
│            [ 保存总结 ]              │
└─────────────────────────────────────┘
```

- 完成任务列表自动从当日 `DailyTask` 读取
- 错题录入走 `POST /api/errors/batch`（已有端点）
- 学习感受存 `DailyTask.note` 或新端点

## 3. 每周总结

### 3.1 自动生成

Agent 在周日（或用户点击「生成本周总结」）自动生成周报告：

```
┌────────────────────────────────────┐
│ 📊 本周总结（2026-06-10 ~ 06-16）   │
├────────────────────────────────────┤
│ 完成率：68%（17/25）                │
│                                    │
│ 错题模块分布：                      │
│ 资料分析 ████████ 8题               │
│ 数量关系 ████ 4题                   │
│ 言语理解 ██ 2题                     │
│                                    │
│ 高频错误原因：                      │
│ 1. 公式记错（5次）                  │
│ 2. 计算粗心（3次）                  │
│                                    │
│ 📝 Agent 建议：                     │
│ "资料分析仍是主要弱项，公式记错占    │
│  比高。下周建议增加资料分析专项练    │
│  习，每天额外15分钟公式默写。"       │
│                                    │
│ [应用到下周计划]                     │
└────────────────────────────────────┘
```

### 3.2 生成逻辑

```
POST /api/summary/weekly
  ↓
1. 查询本周 DailyTask（完成率）
2. 查询本周 ErrorRecord（模块分布、原因统计）
3. 聚合数据 → 调 LLM 生成建议文案
4. 返回 WeeklySummary
```

## 4. API 端点

| 方法 | 端点 | 用途 |
|------|------|------|
| `POST` | `/api/summary/daily` | 保存每日感受 |
| `GET` | `/api/summary/daily?date=` | 获取某日总结 |
| `POST` | `/api/summary/weekly` | 生成周总结（LLM） |
| `GET` | `/api/summary/weekly?week_start=` | 获取周总结 |

## 5. 前端 UI 变更

| 变更 | 描述 |
|------|------|
| 今日总结区域 | 右侧栏「今日计划」下方，错题录入 + 感受输入 |
| 周总结区域 | Phase 1 只做入口按钮，Phase 2 完整实现 |
| 计划编辑 | 任务标题 inline 编辑、拖拽排序、删除按钮 |
| 对话文件 tab | 点击预览、删除、重命名 |
| 工作台 tab | 笔记功能（可忽略，Phase 3） |

## 6. 验证方案

```
1. 录入错题 → POST /api/errors/batch → 验证 ErrorRecord 写入
2. 保存感受 → POST /api/summary/daily → 验证 DailyTask.note 更新
3. 生成周总结 → POST /api/summary/weekly → 验证 LLM 生成建议
4. UI：今日总结区域显示当日完成任务列表
5. UI：错题录入表单正常提交
```

## 7. Phase 2 不做的

- 错题 AI 自动诊断（识别「增长率」「基期」等具体知识点）
- 出题 Agent（弱项 → 专项练习题）
- 能力雷达图 / 趋势折线图
- CPL 置信度加权画像（完整版）
- 文件工作台（预览、分类）
- 申论批改

---

# Phase 3：计划自适应调整

> **目标**：基于 Phase 2 收集的总结数据，静态规则 + Agent 建议动态调整下周计划。

## 1. 调整规则引擎

### 1.1 静态规则

初期用规则直接计算，不依赖 LLM：

| 数据信号 | 阈值 | 调整动作 |
|---------|------|---------|
| 某模块错题数 | > 本周总错题 30% | 下周该模块任务量 +30% |
| 连续3天完成率 | < 50% | 每日总任务量 -20%（降低密度） |
| 用户反馈「公式记错」 | 出现 ≥3 次/周 | 插入「公式复习」任务（15分钟/天） |
| 用户反馈「时间不够」 | 出现 ≥2 次/周 | 任务拆分更小粒度（如 30min → 15min × 2） |
| 某模块连续一周 | 零错题 | 该模块频率降低（每天 → 隔天） |

### 1.2 调整器

```python
# backend/services/plan_adjuster.py

def adjust_plan(current_plan: WeeklyPlan, weekly_summary: WeeklySummary) -> list[Adjustment]:
    """返回调整建议列表，每条包含：{description, affected_tasks, reason}"""
    adjustments = []
    
    # 规则1: 错题模块加权
    for module_id, count in weekly_summary.mistake_module_stats.items():
        if count > total_errors * 0.3:
            adjustments.append(Adjustment(
                type="increase_module",
                module_id=module_id,
                ratio=1.3,
                reason=f"{module_name}错题占比高({count}题)"
            ))
    
    # 规则2: 完成率过低 → 降密度
    if weekly_summary.completion_rate < 0.5:
        adjustments.append(Adjustment(
            type="reduce_density",
            ratio=0.8,
            reason="本周完成率不足50%"
        ))
    
    # 规则3-5: ...
    return adjustments
```

## 2. 触发方式

### 2.1 被动触发

用户点击「根据本周总结调整下周计划」→ 调 Agent → Agent 执行 `adjust_plan` tool → 生成新计划 → 展示 diff（旧 vs 新）→ 用户确认 → 写入数据库。

### 2.2 主动触发（Phase 3 后期）

Agent 每周一自动检测：有上周总结数据 + 新一周计划未生成 → 主动推送调整建议卡片 → 用户确认或忽略。

## 3. CogEvo-Edu 对应

| Phase | CogEvo-Edu 层 | 作用 |
|-------|--------------|------|
| Phase 1 | MCL（内循环） | 生成计划 |
| Phase 2 | CPL（认知感知层） | 收集用户画像（错题、完成率、感受） |
| Phase 3 | MCL（外循环） | 根据画像调整策略（计划动态修改） |

## 4. API 端点

| 方法 | 端点 | 用途 |
|------|------|------|
| `POST` | `/api/planner/adjust` | 基于周总结生成调整建议（LLM + 规则） |
| `POST` | `/api/planner/adjust/apply` | 确认并应用调整 → 写入新计划 |

## 5. 验证方案

```
1. 模拟周总结数据 → POST /api/planner/adjust → 验证调整建议合理性
2. 确认调整 → POST /api/planner/adjust/apply → 验证新计划写入 + 旧计划归档
3. 边界：无周总结时 adjust → 返回空建议列表
4. 边界：连续调整（调整后再调整）→ 不会产生计划冲突
```

## 6. Phase 3 不做的

- RL 学习优化（根据用户反馈微调调整策略）
- 多轮画像迭代
- Stripe 订阅
- Electron 打包 + 分发
- 模考雷达图
