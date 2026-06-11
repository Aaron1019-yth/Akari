# Akari 版本路线图

> 以最小可运行 project 定义每个版本的 MVP 边界。
> 版本内打磨用 x.1、x.2 迭代，直到下一个版本的 MVP 功能开始。

---

## V1 — 对话式规划教练 ✅ 已完成

**MVP 目标**：用户通过聊天完成诊断→生成个性化每日计划，Agent 具备通用工具。

**完成日期**：2026-06-11

**核心功能**：
- WebSocket 流式对话 + DeepSeek Agent（max 8 rounds）
- IntentClassifier 7 字段诊断状态机（ASK/PLAN/ADJUST/QUERY_PLAN/CHAT）
- 10 个 tools：6 planner + web_search/web_fetch/read_document/generate_plan
- JSONL 会话持久化 + 长历史摘要压缩 + 会话切换/删除
- 三栏布局：侧边栏 / 聊天 / 工作台
- Workspace 文件系统（路径沙盒 + PDF/DOCX/常见文本解析 + FileTree/单文件 Preview）
- 计划区任务管理：完成状态、编辑、删除、番茄钟记录、拖拽重排
- Markdown 渲染（assistant 消息 + 文件预览）
- 设计系统：Geist Variable、off-white 配色、统一阴影/动画

**验证**：39 API tests passing，build 通过；诊断→计划→任务管理→workspace 文档读取流程已闭环。

---

## V1.1 — 交互打磨 ✅ 已完成

**目标**：修复影响体验的粗糙交互，清理假 UI，补安全补丁。

| 项 | 状态 |
|----|------|
| 侧边栏死 UI 清理 | 已完成 |
| Workbench 死 UI 清理 | 已完成 |
| FileTree 右键菜单 click-outside | 已完成 |
| upload 后端 10MB 限制 | 已完成 |
| FilePreview 使用 `react-markdown` | 已完成 |

---

## V1.2 — 工程质量 ✅ 已完成

**目标**：补测试、修异步 I/O、去重代码，为 V2 功能开发打基础。

| 项 | 状态 |
|----|------|
| Agent loop 测试 | 已完成 |
| Web tools SSRF/回退测试 | 已完成 |
| chat-service 摘要异步 I/O | 已完成 |
| 后台摘要单并发保护 | 已完成 |
| `safeSessionId` 去重 | 已完成 |
| 共享类型对齐 | 已完成 |
| 未使用常量清理 | 已完成 |

---

## V1.3 — UI 补齐 ✅ 已完成

**目标**：修复 V1 UI 中影响实际使用的缺口。

| 项 | 状态 |
|----|------|
| 左侧会话删除 | 已完成 |
| Workbench 重复 tab 合并 | 已完成 |
| VS Code 风格单文件预览 | 已完成 |
| compact 任务卡 + hover 操作 + 双击编辑 | 已完成 |

---

## V1.4 — MVP 收口 ✅ 已完成

**目标**：解决 V1 实测中的阻塞体验问题，冻结 V1 功能边界。

| 项 | 状态 |
|----|------|
| 会话删除刷新与 fallback 路由 | 已完成 |
| 工作台文件列表/预览互斥，避免遮挡 | 已完成 |
| DOCX 读取修复 + 常见文件类型支持 | 已完成 |
| 日/周计划 compact 布局和任务拖拽 | 已完成 |
| 边栏 resize 命中区域与视觉修复 | 已完成 |
| dev:web / dev:desktop 统一托管进程 | 已完成 |

**V1 冻结边界**：不再加入多文件 tab、旧版 `.doc` 解析、DMG 打包、V2 总结/错题、V3 自适应调整。

---

## V2 — 学习总结与反馈

**MVP 目标**：用户拥有一个可编辑、可导出、可复盘的计划工作台；Akari 从任务完成反馈、上传材料、错题 PDF 和日常问答中结构化学习证据，辅助滚动调整计划。

**新功能**：
- 计划文档同步：当前 active plan 自动写入 workspace Markdown，作为用户可读计划文档
- 计划版本管理：当前计划、历史计划、草稿计划可查看/恢复/导出
- 用户手写计划：允许只创建目标、空周计划或手动每日任务，Agent 不强制生成完整计划
- 任务完成反馈：用户标记任务完成时，在对应任务格记录实际用时、难度、专注状态和一句话感受
- 错题材料摄取：用户可上传照片/文稿，或在聊天中提交「这题不会」「帮我分析错因」等材料
- 粉笔错题 PDF 导入：用户导出错题集 PDF 后上传，Akari 提取为学习证据并生成候选错因归因
- LLM 错因归因：Agent 从图片/文稿/问答上下文中提取题目、模块、错因、改进建议，并生成候选 ErrorRecord
- 用户确认入库：AI 归因结果保存前必须由用户确认或编辑，避免普通问答污染错题库
- 周总结生成：聚合任务完成率、实际学习时长、任务反馈、错题模块分布、高频错因 → LLM 生成建议文案
- API：`PATCH /api/planner/task/:taskId/feedback`、`POST /api/feedback/artifacts`、`POST /api/feedback/candidates/generate`、`GET /api/feedback/candidates`、`PATCH /api/feedback/candidates/:candidateId`、`GET /api/feedback/daily`、`POST /api/feedback/weekly`、`GET /api/feedback/weekly`

**V2 不做**：
- 无确认的全自动错题入库
- 复杂 OCR 训练或自研视觉模型
- 依赖粉笔私有 API 或爬取
- 一次性生成并锁死多月每日任务
- 出题 Agent
- 能力雷达图 / 趋势折线图
- 申论批改

---

## V3 — 计划自适应调整

**MVP 目标**：基于 V2 总结数据，规则引擎 + Agent 建议动态调整下周计划。

**新功能**：
- 调整规则引擎（5 条静态规则 + 阈值）
- 触发方式：被动（用户点击「调整下周计划」）+ 主动（周一自动推送建议卡片）
- 计划 diff 展示（旧 vs 新）→ 用户确认 → 写入
- API：`POST /api/planner/adjust`、`POST /api/planner/adjust/apply`

**V3 不做**：
- RL 学习优化
- 多轮画像迭代
- Electron 打包 + 分发

---

## 跨版本待做（不绑定具体版本）

| 项 | 备注 |
|----|------|
| Electron 打包 | 需要解决 bootstrap.cjs 中 tsx 路径问题 |
| macOS `activate` handler | 关闭窗口后点击 dock 图标无法重开 |
| steer / resume_stream | WebSocket 扩展，基础设施已就绪 |
| Settings 分区化 | 当前表单过长 |
| Mood / thinking / card 事件 | 后端已有解析管道，前端未接入 |
| 边栏宽度持久化 | 当前 resize 后刷新重置 |
