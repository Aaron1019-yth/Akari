# Akari Docs

本目录保存 Akari 当前权威文档。根目录 `README.md` 是项目入口；本文件是文档入口，负责说明应该读哪份文档、哪些内容不是当前事实来源。

## 阅读顺序

1. `roadmap.md`：总路线图，按 P0/V1/V2/V3 划定版本边界。
2. `handoff.md`：当前状态交接，包含已完成能力、运行方式、验证状态和后续风险。
3. `V1-design.md` / `V2-design.md`：对应版本的当前设计总结。
4. `P0-manual-acceptance.md`：真实用户路径手动验收脚本。
5. `V1-completion-log.md`：历史完成记录，只用于回溯，不作为当前设计入口。

## 文档权威规则

- `docs/` 根目录是当前权威文档区。
- `docs/superpowers/` 是 brainstorm、spec、plan 和 source material 的过程归档，不直接代表当前实现。
- 被采纳的 brainstorm/spec 必须合并进根目录权威文档后才算生效。
- 当根目录文档和 `docs/superpowers/` 冲突时，以根目录文档和当前代码为准。
- 当文档和代码冲突时，先检查代码，再更新文档。

## 当前权威文档

| 文档 | 用途 |
|---|---|
| `roadmap.md` | 总路线图和版本边界 |
| `handoff.md` | 当前项目状态、运行方式、验证和风险 |
| `V1-design.md` | V1 已落地架构和能力总结 |
| `V2-design.md` | V2 学习反馈、复盘素材、计划工作台和 Workspace 设计 |
| `P0-manual-acceptance.md` | 当前手动验收清单 |
| `V1-completion-log.md` | 历史阶段完成记录 |

## 命名约定

- 长期入口文档使用功能名：`roadmap.md`、`handoff.md`。
- 版本设计文档使用 `Vn-design.md`。
- 验收文档使用阶段名 + 功能名，例如 `P0-manual-acceptance.md`。
- 历史过程材料保留在 `docs/superpowers/`，不得从项目入口当作当前设计引用。
