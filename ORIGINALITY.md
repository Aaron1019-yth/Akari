# Akari 原创性与迁移审计

Akari 采用 clean-room 方式推进。完整审计边界见 `docs/superpowers/specs/ORIGINALITY.md`。

## 当前状态

- 本轮新增的 `backend/`、`desktop/`、`shared/`、配置文件和测试均为从零实现。
- 未迁移 Hana/Akari 旧项目的通用 UI、Electron 壳、状态管理、主题系统、资源、文案或后端代码。
- Planner 旧资产尚未迁移；后续迁移前必须先在审计表记录文件来源、原创依据和改造方式。
