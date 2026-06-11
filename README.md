# Akari

Akari 是一个考公备考 Agent 桌面应用。V1 MVP 已完成并冻结功能边界：用户可以通过聊天完成考试诊断，生成一周学习计划，在工作台管理任务，并让 Agent 读取 workspace 文档。

## 当前状态

- `server/`：Express + better-sqlite3。planner/practice/profile 端点 + DeepSeek Agent（WebSocket 流式对话 + 12 tools + abort）+ Workspace 文件系统 API + Settings UI。
- `desktop/`：Electron 主进程 + React 19 + Vite 前端。三栏布局（会话/聊天/工作台），前端按 `features/` 业务模块和 `shared/` 通用 UI 分层。
- `shared/exam-schema.ts`：前后端共享领域类型。
- `server/__tests__/`：Vitest 测试套件。

V1 不再继续扩展功能面。下一阶段功能开发从 V2「学习总结与反馈」开始；Electron 打包、Settings 分区化、多文件工作台等属于独立后续优化。

### 环境变量

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `DEEPSEEK_API_KEY` | — | LLM API key（可在 Settings UI 配置） |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | API 地址 |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | 模型名 |
| `AKARI_WORKSPACE_PATH` | `~/Desktop/Akari-WorkSpace` | Workspace 根目录 |

## 本地运行

```bash
npm install --legacy-peer-deps
```

Web 开发模式：

```bash
npm run dev:web
```

打开 `http://127.0.0.1:5173/`。

也可以分开调试后端和前端：

```bash
npm run dev:api
npm run dev
```

桌面开发模式：

```bash
npm run dev:desktop
```

### 首次配置

1. 启动应用后打开左侧 Settings。
2. 填入 DeepSeek API key、Base URL 和模型名。
3. 如需 web search，填入 Tavily / Serper / Brave 任一搜索 provider key。
4. Workspace 默认路径为 `~/Desktop/Akari-WorkSpace`，可在 Settings 或 `AKARI_WORKSPACE_PATH` 中覆盖。

Settings 会保存到 `.akari/config.json`，优先级高于环境变量。

## V1 演示流程

完整演示脚本见 `docs/Akari-v1-demo-script.md`。最短路径：

1. 新建会话，告诉 Akari 考试目标、每日学习时间、当前水平和薄弱模块。
2. 等待 Agent 生成一周计划，并在右侧「我的规划」查看今日/本周任务。
3. 编辑、完成、拖拽任务，记录一次番茄钟时长。
4. 上传 PDF/DOCX/Markdown/TXT 文件，在工作台预览。
5. 在聊天中要求 Agent 读取 workspace 文档并结合计划给建议。

## 检查

```bash
npm run build
npm run test:api
```

## 故障排查

### Electron 二进制安装不完整

在 Node 26 下，Electron 的安装脚本可能因为 `extract-zip` 解压不完整，静默跳过部分文件。典型表现是：

- `node_modules/electron/path.txt` 缺失
- `node_modules/electron/dist/Electron.app/Contents/Frameworks/` 缺失
- `npx electron --version` 长时间卡在下载或无法启动

如果 Electron zip 已经下载到本机缓存，可以直接用系统 `unzip` 手动解压。当前版本是 Electron 42.3.3；如果以后升级 Electron，缓存里可能有多个 zip，需要按 `node_modules/electron/package.json` 里的版本精确匹配，避免解压旧版本。

```bash
rm -rf node_modules/electron/dist
ELECTRON_VERSION="$(node -p "require('./node_modules/electron/package.json').version")"
unzip -q "$(find ~/Library/Caches/electron -name "electron-v${ELECTRON_VERSION}-*.zip")" -d node_modules/electron/dist
echo -n 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt
```

也可以运行项目脚本：

```bash
bash scripts/fix-electron-macos.sh
```

## 设计文件

- `docs/Akari-spec-v1.roadmap.md`：**版本路线图**（V1 已冻结，V2/V3 后续范围）。
- `docs/Akari-spec-v1.completion_log.md`：V1 各阶段验收记录。
- `docs/Akari-v1-demo-script.md`：V1 演示与验收 checklist。
- `docs/Akari-design-v2.feedback.md`：V2 学习反馈、错题归因与复盘设计草案。
- `docs/Akari-design-v2.plan_workspace.md`：V2 计划工作台、Markdown 同步、版本管理与粉笔导入设计。
- `docs/superpowers/specs/Akari-spec-v1.phase1_mvp.md`：**Phase 1–3 MVP 完整规格（当前路线图）**。
- `docs/superpowers/specs/Akari-design-v1.exam_agent.md`：总体技术设计、架构决策、版权策略。
- `docs/superpowers/specs/Akari-design-v1.workspace.md`：Workspace 文件系统设计。
- `docs/superpowers/specs/Akari-api-v1.domain_model.md`：API 契约、领域模型、数据流。
- `docs/superpowers/specs/Akari-spec-v1.originality.md`：原创性与迁移审计边界。
- `docs/Akari-design-v1.handoff.md`：交接文稿（当前状态、已验证流程、待完成项）。
- `CLAUDE.md`：项目规则手册（AI 协作用）。
