# Akari

Akari 是考公备考 Agent 新项目的 clean-room 起点。

当前只放入与新项目直接相关的设计资产，不包含 Hana/Akari 的通用 UI、Electron 壳、状态管理、主题系统或后端源码。

## 当前骨架

- `backend/`：FastAPI + SQLAlchemy + SQLite。planner/practice/profile 端点 + DeepSeek Agent（WebSocket 流式对话 + 6 planner tools + abort）+ Settings UI。
- `desktop/`：Electron 主进程 + React 19 + Vite 前端。三栏布局（会话/聊天/工作台），流式聊天 UI，任务番茄钟。
- `shared/exam-schema.ts`：前端领域类型镜像。
- `tests/`：后端 smoke test。

### 环境变量

| 变量 | 默认值 | 用途 |
|------|--------|------|
| `DEEPSEEK_API_KEY` | — | LLM API key（可在 Settings UI 配置，无需进程重启） |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | API 地址 |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | 模型名 |

## 本地运行

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt pytest
npm install --legacy-peer-deps
```

启动后端：

```bash
npm run dev:api
```

启动前端：

```bash
npm run dev
```

打开 `http://127.0.0.1:5173/`。

启动桌面版：

```bash
npm run dev:desktop
```

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

- `docs/superpowers/specs/2026-06-10-phase1-mvp-design.md`：**Phase 1–3 MVP 完整规格（当前路线图）**。
- `docs/superpowers/specs/2026-06-09-exam-agent-design.md`：总体技术设计、架构决策、版权策略。
- `docs/superpowers/specs/exam-domain-model.md`：API 契约、领域模型、数据流。
- `docs/superpowers/specs/ORIGINALITY.md`：原创性与迁移审计边界。
- `docs/HANDOFF.md`：交接文稿（当前状态、已验证流程、待完成项）。
- `CLAUDE.md`：项目规则手册（AI 协作用）。
