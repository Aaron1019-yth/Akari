# Workspace 设计

> 日期：2026-06-10
> 状态：设计阶段
> 相关：Phase 2 — 工作台

## 目标

将 Akari 的文件系统从「扁平上传目录」升级为「真实桌面文件夹工作区」，Agent 可读写，前端可预览。类似 Claude Code 的工作目录模型——单一真实文件系统，Agent 和用户共享同一个文件空间。

## 核心模型

- **一个可配置的 workspace 文件夹**，默认路径 `~/Desktop/Akari-WorkSpace/`
- 首次启动自动创建默认文件夹
- 路径持久化在 `.akari/config.json` 的 `workspace_path` 字段
- Settings UI 可修改路径
- 真实文件系统——用户在 Finder 里直接操作，Agent 通过工具读写
- 上传文件直接进 workspace 根目录

## 废弃内容

- `.akari/uploads/` 目录 + `index.json` 清单
- `backend/services/files_service.py` 旧实现（扁平 uploads 管理）
- `backend/api/files.py` 旧端点（`/api/files/*`）
- 前端独立的「对话文件」tab（与「工作台」tab 合并）

## 后端

### Workspace 服务 (`backend/services/workspace_service.py`)

替换 `files_service.py`：

- `get_workspace_path()` — 从 config 读路径，默认 `~/Desktop/Akari-WorkSpace/`
- `set_workspace_path(path)` — 更新 config
- `ensure_workspace()` — 首次启动创建目录
- `list_tree(dir="")` — 递归返回文件树，跳过 `.git`、`node_modules`、`__pycache__`、隐藏文件（`.` 开头）
- `read_file(path)` — 文本/Markdown/代码返回原文；PDF 用 PyPDF2 提取文本
- `write_file(path, content)` — 写入文本文件，自动创建父目录
- `delete_file(path)` — 删除文件/目录
- `rename_file(old_path, new_path)` — 重命名

安全约束：所有路径操作前 `resolve()` workspace root 和目标路径的 `resolve()`，确认目标路径在 root 内。拒绝包含 `..` 的路径段。

### API (`backend/api/workspace.py`)

前缀 `/api/workspace`：

| 方法 | 端点 | 功能 |
|------|------|------|
| `GET` | `/api/workspace/tree?dir=.` | 递归文件树，JSON `{tree: [{name, type, children?, size, modified_at}]}` |
| `GET` | `/api/workspace/file?path=rel` | 读文件内容 `{content, mime}` |
| `POST` | `/api/workspace/file` | `{path, content}` 创建/覆盖文件 |
| `POST` | `/api/workspace/upload` | multipart 上传文件，保存到 workspace 根目录 |
| `DELETE` | `/api/workspace/file?path=rel` | 删除文件 |
| `PATCH` | `/api/workspace/file` | `{old_path, new_path}` 重命名 |
| `GET` | `/api/workspace/info` | `{workspace_path}` 当前工作区路径 |

### Agent 工具

修改现有工具：
- `read_document` — 改为从 workspace path 读，去掉 `.akari/uploads/` 的路径限制

新增工具（`backend/services/tools/document.py`）：
- `write_to_file` — `{file_path, content}` 写入 workspace
- `list_workspace_files` — `{directory}` 列出指定目录下的文件

### main.py 路由注册

```python
app.include_router(workspace.router, prefix="/api/workspace", tags=["workspace"])
```

移除 `files.router`。

### 迁移：`loop.py` 文件上下文

`AgentLoop._build_file_context()` 当前调用 `list_files()`（旧 files_service），需改为调用 workspace 的 `list_tree("")`，输出格式调整为：

```
# 当前工作区文件
工作区路径：~/Desktop/Akari-WorkSpace/
- file1.pdf
- notes/ (目录)
- notes/计划.md
```

### 数据类型

```python
# workspace_service.py
@dataclass
class FileNode:
    name: str
    type: str       # "file" | "directory"
    path: str       # workspace root 下的相对路径
    size: int       # bytes，目录为 0
    modified_at: str
    children: list[FileNode] | None  # 仅目录有值
```

前端 `FileNode` 对应 TypeScript 类型（在 `desktop/src/react/utils.ts` 或组件内定义）。

## 前端

### Workbench 重构

「文件」tab 和「工作台」tab 合并为一个 tab：「Workspace」。

布局：左侧文件树 + 右侧预览面板。

### 新组件

**`FileTree.tsx`**：
- Props: `tree: FileNode[]`, `onSelect`, `onDelete`, `onRename`, `selectedPath`
- 递归渲染，目录可折叠/展开
- 右键菜单：删除、重命名
- 点击文件 → `onSelect(path)`

**`FilePreview.tsx`**：
- Props: `path: string | null`, `content: string | null`, `mime: string`
- Markdown 文件用简单渲染（可用 `marked` 或纯文本）
- 文本/代码文件显示代码块
- PDF 显示提取的文本
- 空状态：「选择文件以预览」

### 状态变更

- `App.tsx`：去掉 `files` 状态，新增 `fileTree: FileNode[]` + `selectedFilePath` + `previewContent`
- 首次加载时调 `GET /api/workspace/tree`
- 上传完成后刷新 tree
- 删除/重命名后刷新 tree

### 上传流程

聊天框上传 → `POST /api/workspace/upload` → 文件进 workspace 根目录 → 刷新文件树 → 切到 Workspace tab

### 依赖

`marked` 用于 Markdown 渲染（已在 `package.json` 或需新增）。

## 不做

- 多 mount 注册表（YAGNI）
- WebDAV/S3 远程存储挂载（YAGNI）
- safe delete（移到 trash）（YAGNI）
- 文件版本冲突检测（YAGNI）
- 文件监听（watch）
- 多 workspace 切换/历史
- 二进制文件预览（图片、视频）
- Electron 原生文件对话框（先用前端方案）

## 验证

- `npm run build` 通过
- `npm run test:api` 全部通过
- 手动：启动 → workspace 文件夹自动创建
- 手动：上传 PDF → 出现在 workspace → 文件树可见 → 可预览
- 手动：Agent 调用 `write_to_file` → 文件出现在 workspace → 前端可见
- 手动：Settings 修改 workspace 路径 → 文件树切换到新路径
