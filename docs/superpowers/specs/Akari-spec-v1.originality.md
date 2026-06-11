# 考公Agent 原创性与迁移审计

本文件用于约束新考公Agent的版权边界。目标是构建由 Aaron 完整持有版权的项目；Akari/Hana 只作为体验参考，不作为代码基础。

## 原则

1. 不 Fork Akari/Hana 作为新项目代码基础。
2. 不搬运 Akari/Hana 的通用 UI、Electron 壳、状态管理、主题系统、资源、文案或后端代码。
3. 仅迁移经确认由 Aaron 原创的 planner 相关文件或业务逻辑。
4. 对无法确认原创性的文件，按功能需求 clean-room 重写。
5. 迁移前记录文件来源、原创依据、迁移方式和替代实现说明。

## 允许迁移候选

| 文件/模块 | 原创依据 | 迁移方式 | 状态 |
|-----------|----------|----------|------|
| `desktop/src/react/modules/planner/PlanPanel.tsx` | Aaron 原创计划任务栏 | 迁移后适配考公 5 层模型 | 待审计 |
| `desktop/src/react/modules/planner/DailyTaskGrid.tsx` | Aaron 原创任务交互 | 迁移后加入题量、正确率、错题入口 | 待审计 |
| `desktop/src/react/modules/planner/TaskCard.tsx` | Aaron 原创任务卡片 | 迁移后加入 `TaskType` 与考试字段 | 待审计 |
| `shared/plan-schema.ts` | Aaron 原创计划 schema | 演进为 `shared/exam-schema.ts` | 待审计 |
| planner CRUD/校验/自适应规则 | Aaron 原创业务规则 | 用 Python/FastAPI/SQLAlchemy 重写 | 待审计 |

## 禁止迁移

| 范围 | 处理方式 |
|------|----------|
| Electron 主进程和 preload | 从零实现 |
| 左栏/中栏聊天 UI | 从零实现 |
| Akari/Hana Zustand slices | 从零实现 |
| `hanaFetch`、WebSocket 单例和 API client | 从零实现并更名 |
| Akari/Hana CSS 变量、主题文件和全局样式 | 从零设计 |
| Akari/Hana 图片、头像、图标封装和动效 | 不使用 |
| Node 后端 `server/`、`core/`、`hub/`、`lib/` | 不迁移 |

## Clean-room 记录

| 功能 | 参考需求 | 新实现位置 | 备注 |
|------|----------|------------|------|
| 三栏布局 | 左会话、中对话、右工作台 | 待定 | 只参考布局概念 |
| 流式聊天 | WebSocket/SSE 输出 | 待定 | 新协议与状态实现 |
| 计划更新事件 | 后端推送刷新前端 | 待定 | 新事件名和客户端实现 |
| 番茄钟 | 任务计时与完成记录 | 待定 | 迁移前确认原创性 |
