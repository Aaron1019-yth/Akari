import fs from "fs";
import path from "path";
import os from "os";
import { getSettings, saveSettings } from "./settings-service.js";
import type { FileNode } from "../../shared/exam-schema.js";

const DEFAULT_WORKSPACE =
  process.env.AKARI_TEST === "1" && process.env.AKARI_DATA_DIR
    ? path.join(process.env.AKARI_DATA_DIR, "workspace")
    : path.join(os.homedir(), "Desktop", "Akari-WorkSpace");
const HIDDEN_PATTERNS = [/^\./, /^node_modules$/, /^\.git$/];
const MAX_TEXT_SIZE = 500 * 1024;

const TEXT_MIME_BY_EXT: Record<string, string> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
  ".xml": "application/xml",
  ".html": "text/html",
  ".htm": "text/html",
  ".rtf": "application/rtf",
  ".tex": "application/x-tex",
  ".log": "text/plain",
  ".ini": "text/plain",
  ".conf": "text/plain",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".css": "text/css",
};

export type { FileNode };

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

const PATH_SEP_RE = /[/\\]/;

function resolveSafe(relPath: string): string {
  const root = path.resolve(getWorkspacePath());
  // Split on both / and \ to catch all path traversal attempts
  const segments = relPath.split(PATH_SEP_RE);
  if (segments.some(seg => seg === "..")) {
    throw new WorkspaceError("路径包含非法字符");
  }
  const target = path.resolve(root, relPath);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new WorkspaceError("路径越界");
  }
  return target;
}

function isHidden(name: string): boolean {
  return HIDDEN_PATTERNS.some(p => p.test(name));
}

function mtimeStr(stat: fs.Stats): string {
  return stat.mtime.toISOString().substring(0, "YYYY-MM-DDTHH:mm:ss".length);
}

export function listTree(dirRel: string = ""): FileNode[] {
  // Sandbox check
  if (dirRel) resolveSafe(dirRel);
  const root = getWorkspacePath();
  const currentDir = path.join(root, dirRel);
  if (!fs.existsSync(currentDir)) return [];

  const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    .filter(e => !isHidden(e.name) && !e.isSymbolicLink())
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
      modified_at: mtimeStr(stat),
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
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const pdfData = await pdfParse(dataBuffer);
      const text = (pdfData.text || "").trim();
      return { content: text, mime: "application/pdf", truncated: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Cannot find module")) {
        throw new WorkspaceError("读取 PDF 需要安装 pdf-parse 依赖");
      }
      throw new WorkspaceError(`PDF 解析失败: ${msg}`);
    }
  }

  if (ext === ".docx") {
    try {
      const mammothModule = await import("mammoth");
      const mammoth = mammothModule.default ?? mammothModule;
      const result = await mammoth.extractRawText({ path: absPath });
      return { content: (result.value || "").trim(), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", truncated: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Cannot find module")) {
        throw new WorkspaceError("读取 DOCX 需要安装 mammoth 依赖");
      }
      throw new WorkspaceError(`DOCX 解析失败: ${msg}`);
    }
  }

  // Skip oversize files before reading into memory
  if (stat.size > MAX_TEXT_SIZE * 2) {
    throw new WorkspaceError("文件过大，无法预览");
  }

  const buf = fs.readFileSync(absPath);
  // TODO: UTF-16LE/UTF-16BE text files contain null bytes and are falsely rejected
  if (buf.includes(0)) {
    throw new WorkspaceError("不支持预览二进制文件");
  }

  let content = buf.toString("utf-8");
  const truncated = content.length > MAX_TEXT_SIZE;
  if (truncated) content = content.slice(0, MAX_TEXT_SIZE) + "\n\n[文件过长，已截断]";

  return { content, mime: TEXT_MIME_BY_EXT[ext] || "text/plain", truncated };
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
    modified_at: mtimeStr(stat),
    children: null,
  };
}

function safeFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const stem = path.basename(name, ext) || "document";
  const safe = stem.replace(/[^A-Za-z0-9_.\-一-鿿]/g, "_").slice(0, 80);
  return `${safe}${ext}`;
}
