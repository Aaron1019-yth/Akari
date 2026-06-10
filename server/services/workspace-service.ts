import fs from "fs";
import path from "path";
import os from "os";
import { getSettings, saveSettings } from "./settings-service.js";

const DEFAULT_WORKSPACE = path.join(os.homedir(), "Desktop", "Akari-WorkSpace");
const HIDDEN_PATTERNS = [/^\./, /^node_modules$/, /^\.git$/];
const MAX_TEXT_SIZE = 500 * 1024;

export interface FileNode {
  name: string;
  type: "file" | "directory";
  path: string;
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

function resolveSafe(relPath: string): string {
  const root = path.resolve(getWorkspacePath());
  if (relPath.split(path.sep).some(seg => seg === "..")) {
    throw new WorkspaceError("路径包含非法字符");
  }
  const target = path.resolve(root, relPath);
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new WorkspaceError("路径越界");
  }
  return target;
}

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

export function writeFile(relPath: string, content: string): void {
  const absPath = resolveSafe(relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf-8");
}

export function deleteFile(relPath: string): void {
  const absPath = resolveSafe(relPath);
  if (!fs.existsSync(absPath)) {
    throw new WorkspaceError("文件不存在");
  }
  fs.rmSync(absPath, { recursive: true });
}

export function renameFile(oldPath: string, newPath: string): void {
  const absOld = resolveSafe(oldPath);
  const absNew = resolveSafe(newPath);
  if (!fs.existsSync(absOld)) {
    throw new WorkspaceError("文件不存在");
  }
  fs.mkdirSync(path.dirname(absNew), { recursive: true });
  fs.renameSync(absOld, absNew);
}

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
