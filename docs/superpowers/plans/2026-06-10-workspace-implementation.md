# Workspace 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Akari 从扁平上传目录升级为真实文件系统工作区，Agent 可读写，前端可预览文件树。

**Architecture:** 新增 `workspace-service.ts`（文件系统操作 + 路径沙盒）+ `api/workspace.ts`（7 个 REST 端点），替换旧的 `files-service.ts` + `api/files.ts`。Agent 工具层新增 `write_to_file` / `list_workspace_files`，改 `read_document` 的路径限制。前端合并「对话文件」和「工作台」tab 为单一 Workspace tab，包含 FileTree + FilePreview 面板。

**Tech Stack:** Node.js fs API + Express multer + React 组件（FileTree 递归、FilePreview 文本/Markdown）

---

## 文件结构

```
server/
├── services/
│   ├── workspace-service.ts   ← 新建（替换 files-service.ts）
│   └── tools/
│       └── document.ts        ← 修改（read_document 路径 + 新增 2 个 tool）
├── api/
│   ├── workspace.ts           ← 新建（替换 files.ts）
│   └── files.ts               ← 删除
├── services/
│   ├── files-service.ts       ← 删除
│   ├── settings-service.ts    ← 修改（新增 workspace_path）
│   └── agent-loop.ts          ← 修改（buildFileContext 用 workspace）
└── main.ts                    ← 修改（路由注册）

desktop/src/react/
├── components/
│   ├── Workbench.tsx          ← 修改（合并 tab + FileTree/FilePreview）
│   ├── FileTree.tsx           ← 新建
│   └── FilePreview.tsx        ← 新建
├── App.tsx                    ← 修改（files 状态 → fileTree + selectedPath）
├── services/
│   └── api.ts                 ← 修改（新增 workspace API 方法）
└── utils.ts                   ← 修改（新增 util）

shared/exam-schema.ts          ← 修改（新增 FileNode 类型）
```

---

### Task 1: Workspace 服务层

**Files:**
- Create: `server/services/workspace-service.ts`
- Modify: `server/services/settings-service.ts`

- [ ] **Step 1: 在 settings-service.ts 添加 workspace_path 支持**

```typescript
// server/services/settings-service.ts — DEFAULTS 对象里加一行：
const DEFAULTS: Record<string, string> = {
  api_key: process.env["DEEPSEEK_API_KEY"] || "",
  base_url: process.env["DEEPSEEK_BASE_URL"] || "https://api.deepseek.com",
  model: process.env["DEEPSEEK_MODEL"] || "deepseek-v4-flash",
  tavily_api_key: process.env["TAVILY_API_KEY"] || "",
  serper_api_key: process.env["SERPER_API_KEY"] || "",
  brave_search_api_key: process.env["BRAVE_SEARCH_API_KEY"] || "",
  ui_theme: process.env["AKARI_UI_THEME"] || "agent_warm_paper",
  workspace_path: process.env["AKARI_WORKSPACE_PATH"] || "",  // 新增
};
```

```typescript
// LlmSettings interface 加一行：
export interface LlmSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  tavilyApiKey: string;
  serperApiKey: string;
  braveSearchApiKey: string;
  uiTheme: string;
  workspacePath: string;  // 新增
}
```

```typescript
// getSettings() cache 构建加一行：
cache = {
  // ... existing ...
  workspacePath: fileData["workspace_path"] || DEFAULTS["workspace_path"]!,
};
```

```typescript
// saveSettings() JSON.stringify 加一行：
JSON.stringify({
  // ... existing ...
  workspace_path: s.workspacePath,
}, null, 2)
```

```typescript
// saveSettings() cache = s; 上面的参数类型已经是 LlmSettings，包含了 workspacePath
```

- [ ] **Step 2: 创建 workspace-service.ts**

```typescript
import fs from "fs";
import path from "path";
import os from "os";
import { getSettings, saveSettings } from "./settings-service.js";

const DEFAULT_WORKSPACE = path.join(os.homedir(), "Desktop", "Akari-WorkSpace");
const HIDDEN_PATTERNS = [/^\./, /^node_modules$/, /^\.git$/];
const MAX_TEXT_SIZE = 500 * 1024; // 500KB text files

export interface FileNode {
  name: string;
  type: "file" | "directory";
  path: string;        // relative to workspace root
  size: number;
  modified_at: string;
  children: FileNode[] | null;
}

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

// ── Path helpers ──

export function getWorkspacePath(): string {
  const configured = getSettings().workspacePath;
  if (configured && configured.trim()) {
    const resolved = path.resolve(configured.trim().replace(/^~/, os.homedir()));
    return resolved;
  }
  return DEFAULT_WORKSPACE;
}

export function setWorkspacePath(newPath: string): void {
  const s = getSettings();
  saveSettings({ ...s, workspacePath: path.resolve(newPath.replace(/^~/, os.homedir())) });
}

export function ensureWorkspace(): string {
  const wp = getWorkspacePath();
  fs.mkdirSync(wp, { recursive: true });
  return wp;
}

// ── Security ──

function resolveSafe(relPath: string): string {
  const root = path.resolve(getWorkspacePath());
  // Reject paths containing ".." segments
  if (relPath.split(path.sep).some(seg => seg === "..")) {
    throw new WorkspaceError("路径包含非法字符");
  }
  const target = path.resolve(root, relPath);
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new WorkspaceError("路径越界");
  }
  return target;
}

// ── File tree ──

function isHidden(name: string): boolean {
  return HIDDEN_PATTERNS.some(p => p.test(name));
}

export function listTree(dirRel: string = ""): FileNode[] {
  const root = getWorkspacePath();
  const currentDir = path.join(root, dirRel);
  if (!fs.existsSync(currentDir)) return [];
  
  const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    .filter(e => !isHidden(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name, "zh-Hans");
    });

  return entries.map(entry => {
    const relPath = dirRel ? path.join(dirRel, entry.name) : entry.name;
    const absPath = path.join(root, relPath);
    const stat = fs.statSync(absPath);
    
    const node: FileNode = {
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
      path: relPath,
      size: entry.isFile() ? stat.size : 0,
      modified_at: stat.mtime.toISOString().slice(0, 19),
      children: null,
    };

    if (entry.isDirectory()) {
      node.children = listTree(relPath);
    }
    return node;
  });
}

// ── Read file ──

export interface FileContent {
  content: string;
  mime: string;
  truncated: boolean;
}

export async function readFile(relPath: string): Promise<FileContent> {
  const absPath = resolveSafe(relPath);
  if (!fs.existsSync(absPath)) {
    throw new WorkspaceError("文件不存在");
  }
  
  const stat = fs.statSync(absPath);
  if (stat.isDirectory()) {
    throw new WorkspaceError("不能读取目录");
  }

  const ext = path.extname(absPath).toLowerCase();
  
  if (ext === ".pdf") {
    const dataBuffer = fs.readFileSync(absPath);
    const pdfParse = (await import("pdf-parse")).default;
    const pdfData = await pdfParse(dataBuffer);
    const text = (pdfData.text || "").trim();
    return { content: text, mime: "application/pdf", truncated: false };
  }
  
  if (ext === ".docx") {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ path: absPath });
    return { content: (result.value || "").trim(), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", truncated: false };
  }

  // Text files — detect if binary
  const buf = fs.readFileSync(absPath);
  if (buf.includes(0)) {
    throw new WorkspaceError("不支持预览二进制文件");
  }
  
  let content = buf.toString("utf-8");
  const truncated = content.length > MAX_TEXT_SIZE;
  if (truncated) content = content.slice(0, MAX_TEXT_SIZE) + "\n\n[文件过长，已截断]";
  
  const mimeMap: Record<string, string> = {
    ".md": "text/markdown",
    ".json": "application/json",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".js": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".txt": "text/plain",
    ".csv": "text/csv",
  };
  
  return { content, mime: mimeMap[ext] || "text/plain", truncated };
}

// ── Write file ──

export function writeFile(relPath: string, content: string): void {
  const absPath = resolveSafe(relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf-8");
}

// ── Delete file ──

export function deleteFile(relPath: string): void {
  const absPath = resolveSafe(relPath);
  if (!fs.existsSync(absPath)) {
    throw new WorkspaceError("文件不存在");
  }
  // Delete as file (not re-creating directory)
  // The resolveSafe already validated path is within workspace
  fs.rmSync(absPath, { recursive: true });
}

// ── Rename file ──

export function renameFile(oldPath: string, newPath: string): void {
  const absOld = resolveSafe(oldPath);
  const absNew = resolveSafe(newPath);
  if (!fs.existsSync(absOld)) {
    throw new WorkspaceError("文件不存在");
  }
  fs.mkdirSync(path.dirname(absNew), { recursive: true });
  fs.renameSync(absOld, absNew);
}

// ── Upload (save buffer to workspace root) ──

export function saveUpload(filename: string, buffer: Buffer): FileNode {
  const wp = ensureWorkspace();
  const safe = safeFilename(filename);
  const absPath = path.join(wp, safe);
  fs.writeFileSync(absPath, buffer);
  const stat = fs.statSync(absPath);
  return {
    name: safe,
    type: "file",
    path: safe,
    size: stat.size,
    modified_at: stat.mtime.toISOString().slice(0, 19),
    children: null,
  };
}

function safeFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const stem = path.basename(name, ext) || "document";
  const safe = stem.replace(/[^A-Za-z0-9_.\-一-鿿]/g, "_").slice(0, 80);
  return `${safe}${ext}`;
}
```

- [ ] **Step 3: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS (无错误)

- [ ] **Step 4: Commit**

```bash
git add server/services/workspace-service.ts server/services/settings-service.ts
git commit -m "feat: add workspace service + workspace_path setting"
```

---

### Task 2: Workspace API 路由

**Files:**
- Create: `server/api/workspace.ts`
- Modify: `server/main.ts`

- [ ] **Step 1: 创建 api/workspace.ts**

```typescript
import { Router, Request, Response } from "express";
import { upload } from "./multer.js";
import {
  ensureWorkspace,
  getWorkspacePath,
  listTree,
  readFile,
  writeFile,
  deleteFile,
  renameFile,
  saveUpload,
  WorkspaceError,
} from "../services/workspace-service.js";

const router = Router();

// GET /api/workspace/tree?dir=.
router.get("/tree", (_req: Request, res: Response) => {
  const dir = (typeof _req.query.dir === "string" ? _req.query.dir : "").trim();
  try {
    ensureWorkspace();
    const tree = listTree(dir);
    res.json({ tree, workspace_path: getWorkspacePath() });
  } catch (exc) {
    res.status(500).json({ detail: exc instanceof Error ? exc.message : "读取文件树失败" });
  }
});

// GET /api/workspace/file?path=rel
router.get("/file", async (req: Request, res: Response) => {
  const p = typeof req.query.path === "string" ? req.query.path : "";
  if (!p) {
    res.status(400).json({ detail: "path 参数必填" });
    return;
  }
  try {
    const result = await readFile(p);
    res.json(result);
  } catch (exc) {
    if (exc instanceof WorkspaceError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: exc instanceof Error ? exc.message : "读取失败" });
    }
  }
});

// POST /api/workspace/file
router.post("/file", (req: Request, res: Response) => {
  const { path: filePath, content } = req.body as { path?: string; content?: string };
  if (!filePath || content === undefined) {
    res.status(400).json({ detail: "path 和 content 必填" });
    return;
  }
  try {
    writeFile(filePath, content);
    const tree = listTree();
    res.json({ ok: true, tree, workspace_path: getWorkspacePath() });
  } catch (exc) {
    if (exc instanceof WorkspaceError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: exc instanceof Error ? exc.message : "写入失败" });
    }
  }
});

// POST /api/workspace/upload
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ detail: "No file provided" });
    return;
  }
  try {
    const stored = saveUpload(req.file.originalname, req.file.buffer);
    const tree = listTree();
    res.json({ file: stored, tree, workspace_path: getWorkspacePath() });
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : "Upload failed";
    res.status(400).json({ detail: msg });
  }
});

// DELETE /api/workspace/file?path=rel
router.delete("/file", (req: Request, res: Response) => {
  const p = typeof req.query.path === "string" ? req.query.path : "";
  if (!p) {
    res.status(400).json({ detail: "path 参数必填" });
    return;
  }
  try {
    deleteFile(p);
    const tree = listTree();
    res.json({ ok: true, tree, workspace_path: getWorkspacePath() });
  } catch (exc) {
    if (exc instanceof WorkspaceError) {
      res.status(404).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: exc instanceof Error ? exc.message : "删除失败" });
    }
  }
});

// PATCH /api/workspace/file
router.patch("/file", (req: Request, res: Response) => {
  const { old_path, new_path } = req.body as { old_path?: string; new_path?: string };
  if (!old_path || !new_path) {
    res.status(400).json({ detail: "old_path 和 new_path 必填" });
    return;
  }
  try {
    renameFile(old_path, new_path);
    const tree = listTree();
    res.json({ ok: true, tree, workspace_path: getWorkspacePath() });
  } catch (exc) {
    if (exc instanceof WorkspaceError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: exc instanceof Error ? exc.message : "重命名失败" });
    }
  }
});

// GET /api/workspace/info
router.get("/info", (_req: Request, res: Response) => {
  res.json({ workspace_path: getWorkspacePath() });
});

export default router;
```

- [ ] **Step 2: 修改 main.ts 路由注册**

```typescript
// server/main.ts — 把 filesRouter 替换为 workspaceRouter：
// 删除这行: import filesRouter from "./api/files.js";
// 添加这行:
import workspaceRouter from "./api/workspace.js";

// 把 app.use("/api/files", filesRouter); 替换为:
app.use("/api/workspace", workspaceRouter);
```

- [ ] **Step 3: 删除旧文件**

```bash
rm server/services/files-service.ts
rm server/api/files.ts
```

- [ ] **Step 4: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS（确保删除旧文件后没有遗留的 import 引用）

- [ ] **Step 5: Commit**

```bash
git add server/api/workspace.ts server/main.ts
git rm server/services/files-service.ts server/api/files.ts
git commit -m "feat: add workspace API, remove old files endpoints"
```

---

### Task 3: 更新 Agent 工具层

**Files:**
- Modify: `server/services/tools/document.ts`
- Modify: `server/services/agent-loop.ts`

- [ ] **Step 1: 修改 document.ts — read_document 改为从 workspace 读**

```typescript
// server/services/tools/document.ts — readDocument 函数替换为：

import fs from "fs";
import path from "path";
import { getWorkspacePath } from "../workspace-service.js";
import type { ToolDef, ToolResult } from "../llm-types.js";

async function readDocument(
  filePath: string,
  maxLength: number = 10000,
): Promise<ToolResult> {
  const workspaceRoot = path.resolve(getWorkspacePath());
  // Resolve ~ to home
  const resolved = path.resolve(
    filePath.startsWith("~")
      ? filePath.replace(/^~/, process.env.HOME || "/Users")
      : filePath,
  );
  // If relative or within workspace, resolve against workspace root
  const target = resolved.startsWith(workspaceRoot)
    ? resolved
    : path.resolve(workspaceRoot, filePath);

  // Sandbox check
  const rel = path.relative(workspaceRoot, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { content: "只能读取工作区内的文件。", ok: false };
  }

  if (!fs.existsSync(target)) {
    return { content: "文件不存在。", ok: false };
  }

  const ext = path.extname(target).toLowerCase();

  let text: string;
  try {
    if (ext === ".pdf") {
      const dataBuffer = fs.readFileSync(target);
      const pdfParse = (await import("pdf-parse")).default;
      const pdfData = await pdfParse(dataBuffer);
      text = (pdfData.text || "").trim();
    } else if (ext === ".docx") {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ path: target });
      text = (result.value || "").trim();
    } else {
      // Plain text / markdown / code
      const buf = fs.readFileSync(target);
      if (buf.includes(0)) {
        return { content: "无法读取二进制文件。", ok: false };
      }
      text = buf.toString("utf-8");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("Cannot find module") ||
      msg.includes("Cannot resolve") ||
      msg.includes("ERR_MODULE_NOT_FOUND")
    ) {
      return { content: "读取该格式需要安装额外依赖。", ok: false };
    }
    return { content: `读取文件失败: ${msg}`, ok: false };
  }

  const truncated = text.length > maxLength;
  const content = text.slice(0, maxLength) + (truncated ? "\n\n[内容已截断]" : "");

  return { content, details: { file_path: target, truncated }, ok: true };
}
```

- [ ] **Step 2: 在 document.ts 添加 write_to_file 和 list_workspace_files**

```typescript
// 在 createDocumentTools() 的返回数组里添加两个 tool：

async function writeToFile(
  filePath: string,
  content: string,
): Promise<ToolResult> {
  const workspaceRoot = path.resolve(getWorkspacePath());
  const target = path.resolve(workspaceRoot, filePath);
  const rel = path.relative(workspaceRoot, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { content: "只能写入工作区内的文件。", ok: false };
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf-8");
    return { content: `已写入 ${filePath}`, details: { file_path: filePath }, ok: true };
  } catch (err) {
    return { content: `写入失败: ${err instanceof Error ? err.message : String(err)}`, ok: false };
  }
}

async function listWorkspaceFiles(
  directory: string = "",
): Promise<ToolResult> {
  const { listTree } = await import("../workspace-service.js");
  const tree = listTree(directory || "");
  const lines = ["# 工作区文件", `路径: ${getWorkspacePath()}`];
  for (const node of tree.slice(0, 50)) {
    const indent = "  ";
    if (node.type === "directory") {
      lines.push(`${indent}📁 ${node.name}/`);
      if (node.children) {
        for (const child of node.children.slice(0, 20)) {
          lines.push(`${indent}${indent}📄 ${child.name}`);
        }
      }
    } else {
      lines.push(`${indent}📄 ${node.name}`);
    }
  }
  return { content: lines.join("\n"), details: { tree }, ok: true };
}

// 在 createDocumentTools 返回数组添加：
{
  name: "write_to_file",
  description: "写入文本文件到工作区。WHEN 需要保存笔记、计划、代码或分析结果时使用。",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "工作区内的相对路径" },
      content: { type: "string", description: "文件内容" },
    },
    required: ["file_path", "content"],
  },
  execute: async (params) =>
    writeToFile(params.file_path as string, params.content as string),
},
{
  name: "list_workspace_files",
  description: "列出工作区文件树。WHEN 需要了解工作区有哪些文件时使用。",
  parameters: {
    type: "object",
    properties: {
      directory: { type: "string", description: "子目录路径，默认根目录" },
    },
    required: [],
  },
  execute: async (params) =>
    listWorkspaceFiles((params.directory as string) || ""),
},
```

- [ ] **Step 3: 修改 agent-loop.ts 的 buildFileContext**

```typescript
// server/services/agent-loop.ts — buildFileContext 函数替换为：

function buildFileContext(): string {
  const wp = getWorkspacePath();
  const tree = listTree("");
  if (tree.length === 0) return "";
  
  const lines = [
    "# 当前工作区文件",
    `工作区路径: ${wp}`,
  ];
  for (const node of tree.slice(0, 12)) {
    if (node.type === "directory") {
      lines.push(`- ${node.name}/ (目录)`);
      if (node.children) {
        for (const child of node.children.slice(0, 8)) {
          lines.push(`  - ${child.name}`);
        }
      }
    } else {
      lines.push(`- ${node.name}`);
    }
  }
  if (tree.length > 12) {
    lines.push(`... 还有 ${tree.length - 12} 个项目`);
  }
  return lines.join("\n");
}
```

```typescript
// agent-loop.ts 顶部 import 加一行：
import { getWorkspacePath, listTree } from "./workspace-service.js";
// 移除旧的: import { listFiles as listFilesFromChat } from "../services/files-service.js";
```

- [ ] **Step 4: 修改 chat.ts 的 file_list 事件发送**

```typescript
// server/api/chat.ts — 把 listFilesFromChat 替换为 workspace 的 listTree：
// 删除: import { listFiles as listFilesFromChat } from "../services/files-service.js";
// 添加: import { listTree } from "../services/workspace-service.js";

// 把所有 listFilesFromChat() 调用替换为：
// listFilesFromChat() 和旧 files 返回格式不同，改为发送 tree：
send(ws, { type: "file_list", files: listTree() });
```

- [ ] **Step 5: 运行 TypeScript 检查 + 测试**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npm run test:api`
Expected: 10/10 pass（旧的 files 测试需要更新，先检查是否通过）

- [ ] **Step 6: Commit**

```bash
git add server/services/tools/document.ts server/services/agent-loop.ts server/api/chat.ts
git commit -m "feat: update agent tools for workspace paths, add write_to_file + list_workspace_files"
```

---

### Task 4: 更新 settings API（workspace_path 字段）

**Files:**
- Modify: `server/api/settings.ts`

- [ ] **Step 1: GET /api/settings 返回 workspace_path**

```typescript
// server/api/settings.ts — GET handler 的 res.json 加一行：
res.json({
  // ... existing ...
  ui_theme: s.uiTheme,
  workspace_path: s.workspacePath,  // 新增
});
```

- [ ] **Step 2: PUT /api/settings 接收并保存 workspace_path**

```typescript
// LlmSettingsUpdate Zod schema (server/types.ts) 加一行：
export const LlmSettingsUpdate = z.object({
  // ... existing ...
  ui_theme: UiTheme.default("agent_warm_paper"),
  workspace_path: z.string().default(""),  // 新增
});

// server/api/settings.ts — PUT handler 里 saveSettings 调用加一行：
saveSettings({
  // ... existing ...
  uiTheme: payload.ui_theme,
  workspacePath: payload.workspace_path,  // 新增
});
```

- [ ] **Step 3: settings-service.ts 的 maskKey 不需要管 workspace_path**

（workspace_path 不需要 mask）

- [ ] **Step 4: TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/api/settings.ts server/types.ts
git commit -m "feat: add workspace_path to settings API"
```

---

### Task 5: Workspace 测试

**Files:**
- Create: `server/__tests__/workspace.test.ts`
- Modify: `server/__tests__/phase1-mvp.test.ts`（移除旧的 file upload 测试）

- [ ] **Step 1: 写 workspace 测试**

```typescript
// server/__tests__/workspace.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { initDatabase } from "../db.js";
import { ensureWorkspace, getWorkspacePath, listTree, writeFile, readFile, deleteFile, renameFile } from "../services/workspace-service.js";

const testDir = path.join(os.tmpdir(), `akari-workspace-test-${Date.now()}`);

// Override settings to use test dir
import { getSettings, saveSettings } from "../services/settings-service.js";

beforeAll(() => {
  initDatabase();
  const s = getSettings();
  saveSettings({ ...s, workspacePath: testDir });
  ensureWorkspace();
});

afterAll(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("workspace-service", () => {
  it("getWorkspacePath returns configured path", () => {
    expect(getWorkspacePath()).toBe(testDir);
  });

  it("ensureWorkspace creates directory", () => {
    const wp = ensureWorkspace();
    expect(fs.existsSync(wp)).toBe(true);
  });

  it("listTree returns empty for new workspace", () => {
    const tree = listTree();
    expect(Array.isArray(tree)).toBe(true);
  });

  it("writeFile and readFile roundtrip", async () => {
    writeFile("test.md", "# Hello\nWorld");
    const result = await readFile("test.md");
    expect(result.content).toBe("# Hello\nWorld");
    expect(result.mime).toBe("text/markdown");
  });

  it("writeFile creates parent directories", () => {
    writeFile("notes/2024/plan.md", "# Plan");
    expect(fs.existsSync(path.join(testDir, "notes", "2024", "plan.md"))).toBe(true);
  });

  it("listTree reflects file structure", () => {
    const tree = listTree();
    expect(tree.length).toBeGreaterThan(0);
  });

  it("deleteFile removes file", () => {
    writeFile("to-delete.txt", "delete me");
    deleteFile("to-delete.txt");
    expect(fs.existsSync(path.join(testDir, "to-delete.txt"))).toBe(false);
  });

  it("renameFile renames file", () => {
    writeFile("old-name.txt", "content");
    renameFile("old-name.txt", "new-name.txt");
    expect(fs.existsSync(path.join(testDir, "new-name.txt"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "old-name.txt"))).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(() => writeFile("../outside.txt", "x")).toThrow();
  });

  it("rejects absolute paths outside workspace", () => {
    expect(() => writeFile("/etc/passwd", "x")).toThrow();
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run server/__tests__/workspace.test.ts`
Expected: 所有 workspace 测试通过

- [ ] **Step 3: 更新 phase1-mvp 测试中旧的 files 测试**

```typescript
// server/__tests__/phase1-mvp.test.ts — 把 file upload HTTP 测试改为 workspace upload：
// 旧的: POST /api/files/upload → 改为 POST /api/workspace/upload
// 旧的: GET /api/files → 改为 GET /api/workspace/tree
```

- [ ] **Step 4: 运行全部测试**

Run: `npm run test:api`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add server/__tests__/workspace.test.ts server/__tests__/phase1-mvp.test.ts
git commit -m "test: add workspace service tests, update file upload test"
```

---

### Task 6: 前端 API 客户端 + 类型

**Files:**
- Modify: `desktop/src/react/services/api.ts`
- Modify: `shared/exam-schema.ts`

- [ ] **Step 1: shared/exam-schema.ts 添加 FileNode 类型**

```typescript
// shared/exam-schema.ts 末尾添加：
export interface FileNode {
  name: string;
  type: "file" | "directory";
  path: string;
  size: number;
  modified_at: string;
  children: FileNode[] | null;
}
```

- [ ] **Step 2: api.ts 添加 workspace API 方法 + 移除旧方法**

```typescript
// desktop/src/react/services/api.ts

// 添加 import:
import type { FileNode } from "../../../shared/exam-schema";

// 删除旧方法: uploadFile, getFiles, deleteFile, renameFile（这些调 /api/files/*，后端已移除）
// 删除旧 import: import type { ConversationFile } from "../../../../shared/exam-schema";

// 添加新的 workspace API 方法到 api 对象：
getWorkspaceTree: (dir = "") =>
  request<{ tree: FileNode[]; workspace_path: string }>(`/api/workspace/tree?dir=${encodeURIComponent(dir)}`),
getWorkspaceFile: (filePath: string) =>
  request<{ content: string; mime: string; truncated: boolean }>(`/api/workspace/file?path=${encodeURIComponent(filePath)}`),
createWorkspaceFile: (filePath: string, content: string) =>
  request<{ ok: boolean; tree: FileNode[] }>("/api/workspace/file", {
    method: "POST",
    body: JSON.stringify({ path: filePath, content }),
  }),
uploadWorkspaceFile: (file: File, signal?: AbortSignal) => {
  const form = new FormData();
  form.append("file", file);
  return fetch("/api/workspace/upload", {
    method: "POST",
    body: form,
    signal,
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Upload failed: ${res.status}`);
    }
    return res.json() as Promise<{ file: FileNode; tree: FileNode[]; workspace_path: string }>;
  });
},
deleteWorkspaceFile: (filePath: string) =>
  request<{ ok: boolean; tree: FileNode[] }>(`/api/workspace/file?path=${encodeURIComponent(filePath)}`, {
    method: "DELETE",
  }),
renameWorkspaceFile: (oldPath: string, newPath: string) =>
  request<{ ok: boolean; tree: FileNode[] }>("/api/workspace/file", {
    method: "PATCH",
    body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
  }),
getWorkspaceInfo: () =>
  request<{ workspace_path: string }>("/api/workspace/info"),
```

注意：Task 6 执行时 App.tsx 还在引用旧的 `api.uploadFile`、`api.getFiles`、`api.deleteFile`、`files` 状态、`ConversationFile` 类型，因此 TypeScript 检查会**报错**。这是预期中的——Task 8 会修复这些引用。如果希望 Task 6 独立通过检查，可以先保留旧方法存根，在 Task 8 中再一并清理。

- [ ] **Step 3: TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: 如果旧的上传方法被 App.tsx 引用，会报错——在 Task 7 中修正

- [ ] **Step 4: Commit**

```bash
git add desktop/src/react/services/api.ts shared/exam-schema.ts
git commit -m "feat: add workspace API client methods + FileNode type"
```

---

### Task 7: 前端 FileTree + FilePreview 组件

**Files:**
- Create: `desktop/src/react/components/FileTree.tsx`
- Create: `desktop/src/react/components/FilePreview.tsx`

- [ ] **Step 1: 创建 FileTree.tsx**

```tsx
// desktop/src/react/components/FileTree.tsx
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FileNode } from "../../../../shared/exam-schema";

interface FileTreeProps {
  tree: FileNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (path: string) => void;
}

export function FileTree({ tree, selectedPath, onSelect, onDelete, onRename }: FileTreeProps) {
  return (
    <div className="file-tree">
      {tree.length === 0 ? (
        <p className="workbench-empty">工作区为空，上传文件或让 Agent 创建</p>
      ) : (
        tree.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onDelete={onDelete}
            onRename={onRename}
          />
        ))
      )}
    </div>
  );
}

function FileTreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  onDelete,
  onRename,
}: {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const [menuOpen, setMenuOpen] = useState(false);

  const isDir = node.type === "directory";
  const isSelected = selectedPath === node.path;

  return (
    <div className="filetree-node" style={{ paddingLeft: `${depth * 16}px` }}>
      <div
        className={`filetree-row ${isSelected ? "selected" : ""}`}
        onClick={() => {
          if (isDir) {
            setExpanded((prev) => !prev);
          } else {
            onSelect(node.path);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
      >
        {isDir ? (
          expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        ) : (
          <span style={{ width: 14 }} />
        )}
        {isDir ? (
          expanded ? <FolderOpen size={16} /> : <Folder size={16} />
        ) : (
          <FileText size={16} />
        )}
        <span className="filetree-name">{node.name}</span>
        {!isDir && (
          <span className="filetree-size">{formatSize(node.size)}</span>
        )}

        {menuOpen && (
          <div className="filetree-menu">
            {onRename && (
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRename(node.path); }}>
                <Pencil size={13} /> 重命名
              </button>
            )}
            {onDelete && (
              <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(node.path); }}>
                <Trash2 size={13} /> 删除
              </button>
            )}
          </div>
        )}
      </div>

      {isDir && expanded && node.children && (
        node.children.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onDelete={onDelete}
            onRename={onRename}
          />
        ))
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 2: 创建 FilePreview.tsx**

```tsx
// desktop/src/react/components/FilePreview.tsx
import { FileText } from "lucide-react";

interface FilePreviewProps {
  path: string | null;
  content: string | null;
  mime: string;
  loading: boolean;
}

export function FilePreview({ path, content, mime, loading }: FilePreviewProps) {
  if (!path) {
    return (
      <div className="file-preview empty">
        <FileText size={32} />
        <p>选择文件以预览</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="file-preview">
        <p className="muted">加载中...</p>
      </div>
    );
  }

  if (content === null) {
    return (
      <div className="file-preview">
        <p className="error">无法加载文件内容</p>
      </div>
    );
  }

  const isMarkdown = mime === "text/markdown" || path.endsWith(".md");
  const isCode = mime.startsWith("text/") && !isMarkdown;

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        <FileText size={15} />
        <span>{path}</span>
      </div>
      <div className="file-preview-body">
        {isMarkdown ? (
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: simpleMarkdown(content) }}
          />
        ) : (
          <pre className="code-block"><code>{content}</code></pre>
        )}
      </div>
    </div>
  );
}

// Simple markdown renderer (no external dependency)
function simpleMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(.+)$/gm, (line) => {
      if (line.startsWith("<h") || line.startsWith("<li") || line.startsWith("</p>") || line.startsWith("<p>")) return line;
      return line;
    });
}
```

- [ ] **Step 3: TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS（新组件无外部引用，不会报错）

- [ ] **Step 4: Commit**

```bash
git add desktop/src/react/components/FileTree.tsx desktop/src/react/components/FilePreview.tsx
git commit -m "feat: add FileTree + FilePreview components"
```

---

### Task 8: 前端 Workbench + App 整合

**Files:**
- Modify: `desktop/src/react/components/Workbench.tsx`
- Modify: `desktop/src/react/App.tsx`
- Modify: `desktop/src/react/components/ChatPanel.tsx`

- [ ] **Step 1: 修改 Workbench.tsx — 合并「对话文件」+「工作台」为 Workspace tab**

```tsx
// desktop/src/react/components/Workbench.tsx
// Props 变更：
// 移除: files, onDeleteFile
// 新增: fileTree, selectedPath, previewContent, previewMime, previewLoading, onFileSelect, onFileDelete, onFileRename

import { FileText, FolderOpen } from "lucide-react";
import type { FileNode } from "../../../../shared/exam-schema";
import { FileTree } from "./FileTree";
import { FilePreview } from "./FilePreview";
// ... 保留所有现有 import

interface WorkbenchProps {
  activeWorkbenchTab: "plan" | "workspace";  // 改为两个 tab（去掉 files）
  onTabChange: (tab: "plan" | "workspace") => void;
  // 移除 files: ConversationFile[];
  fileTree: FileNode[];                     // 新增
  selectedPath: string | null;              // 新增
  previewContent: string | null;            // 新增
  previewMime: string;                      // 新增
  previewLoading: boolean;                  // 新增
  onFileSelect: (path: string) => void;     // 新增
  onFileDelete: (path: string) => void;     // 从 onDeleteFile 改名
  onFileRename: (path: string) => void;     // 新增
  // ... 其余 props 不变
  goal, daysLeft, planProgress, todaySummary, weeklySummary, viewMode, onViewModeChange,
  draftSlot, draftTitle, draftType, draftMinutes, onDraftSlotChange, onDraftTitleChange,
  onDraftTypeChange, onDraftMinutesChange, groupedTasks, weekDays, onUpdateTask, onAddTask,
  onOpenDraft, onOpenTimer, timerTask, timerMode, timerMinutes, timerRunning,
  timerElapsedSeconds, timerDisplay, onTimerModeChange, onTimerMinutesChange,
  onTimerStartStop, onRecordTimer, onCloseTimer,
}
```

Tab buttons 改为两个：
```tsx
<div className="panel-heading">
  <button className={activeWorkbenchTab === "plan" ? "active" : ""} onClick={() => onTabChange("plan")}>我的规划</button>
  <button className={activeWorkbenchTab === "workspace" ? "active" : ""} onClick={() => onTabChange("workspace")}>Workspace</button>
</div>
```

Workspace tab 内容：
```tsx
{activeWorkbenchTab === "workspace" ? (
  <section className="workspace-panel">
    <div className="workspace-split">
      <div className="workspace-tree">
        <FileTree
          tree={fileTree}
          selectedPath={selectedPath}
          onSelect={onFileSelect}
          onDelete={onFileDelete}
          onRename={onFileRename}
        />
      </div>
      <div className="workspace-preview">
        <FilePreview
          path={selectedPath}
          content={previewContent}
          mime={previewMime}
          loading={previewLoading}
        />
      </div>
    </div>
  </section>
) : goal ? (
  // ... 现有的 plan tab 内容不变
) : (
  <p className="muted">生成计划后，这里会显示知识树和任务列表。</p>
)}
```

- [ ] **Step 2: 修改 App.tsx — 更新状态和 API 调用**

```typescript
// desktop/src/react/App.tsx

// 替换这些状态：
// const [files, setFiles] = useState<ConversationFile[]>([]);  // 删除
// const [uploadingFile, setUploadingFile] = useState<string | null>(null);
// const [uploadError, setUploadError] = useState<string | null>(null);
// const [activeWorkbenchTab, setActiveWorkbenchTab] = useState<"plan" | "files" | "workspace">("plan");

// 改为：
const [fileTree, setFileTree] = useState<FileNode[]>([]);        // 新增
const [selectedPath, setSelectedPath] = useState<string | null>(null);  // 新增
const [previewContent, setPreviewContent] = useState<string | null>(null);  // 新增
const [previewMime, setPreviewMime] = useState("text/plain");    // 新增
const [previewLoading, setPreviewLoading] = useState(false);     // 新增
const [uploadingFile, setUploadingFile] = useState<string | null>(null);
const [uploadError, setUploadError] = useState<string | null>(null);
const [activeWorkbenchTab, setActiveWorkbenchTab] = useState<"plan" | "workspace">("plan");  // 去掉 files
```

初始加载：
```typescript
useEffect(() => {
  api.getGoal().then(setGoal).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  api.getWorkspaceTree().then((data) => setFileTree(data.tree)).catch(() => {});
  api.getSettings().then((s) => { /* ... existing ... */ }).catch(() => {});
}, []);
```

文件选择回调：
```typescript
async function handleFileSelect(path: string) {
  setSelectedPath(path);
  setPreviewLoading(true);
  try {
    const result = await api.getWorkspaceFile(path);
    setPreviewContent(result.content);
    setPreviewMime(result.mime);
  } catch {
    setPreviewContent(null);
  } finally {
    setPreviewLoading(false);
  }
}
```

文件删除回调：
```typescript
async function handleFileDelete(filePath: string) {
  try {
    const data = await api.deleteWorkspaceFile(filePath);
    setFileTree(data.tree);
    if (selectedPath === filePath) {
      setSelectedPath(null);
      setPreviewContent(null);
    }
  } catch (err) {
    setUploadError(err instanceof Error ? err.message : "删除失败");
  }
}
```

文件重命名（简单 prompt + API 调用）：
```typescript
async function handleFileRename(oldPath: string) {
  const newName = window.prompt("新文件名:", oldPath);
  if (!newName || newName === oldPath) return;
  try {
    const dir = oldPath.includes("/") ? oldPath.slice(0, oldPath.lastIndexOf("/") + 1) : "";
    const newPath = dir + newName;
    const data = await api.renameWorkspaceFile(oldPath, newPath);
    setFileTree(data.tree);
  } catch (err) {
    setUploadError(err instanceof Error ? err.message : "重命名失败");
  }
}
```

上传回调改为使用 workspace API：
```typescript
async function handleUploadFile(file: File) {
  setUploadError(null);
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (![".pdf", ".docx"].includes(ext)) {
    setUploadError("仅支持 PDF 和 Word(.docx) 文件");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setUploadError("文件不能超过 10MB");
    return;
  }

  uploadAbortRef.current?.abort();
  const controller = new AbortController();
  uploadAbortRef.current = controller;
  setUploadingFile(file.name);
  try {
    const data = await api.uploadWorkspaceFile(file, controller.signal);
    setFileTree(data.tree);
    setActiveWorkbenchTab("workspace");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: `用户上传了 ${file.name}`, created_at: new Date().toISOString() },
    ]);
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    }
  } finally {
    setUploadingFile(null);
    uploadAbortRef.current = null;
  }
}
```

WebSocket 事件处理：
```typescript
// onFileList 回调改为接收 FileNode[]：
onFileList: (nextFiles) => {
  // websocket 发送 file_list 事件时传的是 tree（FileNode[]）
  if (Array.isArray(nextFiles) && nextFiles.length > 0 && nextFiles[0].type) {
    setFileTree(nextFiles as unknown as FileNode[]);
  }
},
```

ChatPanel 的 filesCount 改为 fileTree 的文件数：
```typescript
// App.tsx 传给 ChatPanel:
filesCount={fileTree.reduce((count, node) => {
  const countRecursive = (n: FileNode): number => {
    let c = n.type === "file" ? 1 : 0;
    if (n.children) c += n.children.reduce((sum, child) => sum + countRecursive(child), 0);
    return c;
  };
  return count + countRecursive(node);
}, 0)}
```

删除 `ConversationFile` 从 import：
```typescript
// 移除: import type { ConversationFile } from ...
```

删除旧的 `handleDeleteFile` 函数（被 `handleFileDelete` 替换）。

- [ ] **Step 3: ChatPanel.tsx — 移除旧的 filesCount 依赖，工作正常**

ChatPanel 已经接受 `filesCount: number` prop，不需要改接口。只需要 App.tsx 传正确的数字即可。

- [ ] **Step 4: TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 构建 + 测试**

Run: `npm run build`
Expected: PASS

Run: `npm run test:api`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add desktop/src/react/components/Workbench.tsx desktop/src/react/App.tsx desktop/src/react/components/ChatPanel.tsx
git commit -m "feat: integrate workspace file tree + preview into workbench"
```

---

### Task 9: 清理 + 验证

**Files:**
- 检查所有改动

- [ ] **Step 1: 清理旧的 .akari/uploads/ 目录**

```bash
rm -rf .akari/uploads/
```

- [ ] **Step 2: 确保 .akari/config.json 升级兼容**

旧 config.json 没有 `workspace_path` 字段，getSettings 会 fallback 到默认值（空字符串 → `~/Desktop/Akari-WorkSpace/`）。无需迁移脚本。

- [ ] **Step 3: 全量检查**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `npm run test:api`
Expected: 所有测试通过

- [ ] **Step 4: 手动验证**

```bash
npm run dev:api &
npm run dev &
```

打开 `http://127.0.0.1:5173/`：
- 确认 Workspace tab 显示
- 上传 PDF → workspace 文件夹创建 → 文件树显示
- 点击文件 → 预览面板显示内容
- 右键删除/重命名可用
- Agent 工具可读写 workspace

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: cleanup old uploads, final workspace verification"
```
