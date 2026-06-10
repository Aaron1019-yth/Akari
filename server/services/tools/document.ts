import fs from "fs";
import path from "path";
import { getWorkspacePath } from "../workspace-service.js";
import type { ToolDef, ToolResult } from "../llm-types.js";

// ── Tool implementations ──

async function readDocument(
  filePath: string,
  maxLength: number = 10000,
): Promise<ToolResult> {
  const workspaceRoot = path.resolve(getWorkspacePath());

  // Resolve ~ to home
  let resolved = filePath;
  if (filePath.startsWith("~")) {
    resolved = path.resolve(filePath.replace(/^~/, process.env.HOME || "/Users"));
  }

  // If absolute and within workspace, keep it; otherwise resolve relative to workspace
  let target: string;
  if (path.isAbsolute(resolved) && resolved.startsWith(workspaceRoot)) {
    target = resolved;
  } else {
    target = path.resolve(workspaceRoot, resolved);
  }

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
      msg.includes("Cannot resolve")
    ) {
      return { content: "读取该格式需要安装额外依赖。", ok: false };
    }
    return { content: `读取文件失败: ${msg}`, ok: false };
  }

  const truncated = text.length > maxLength;
  const content = text.slice(0, maxLength) + (truncated ? "\n\n[内容已截断]" : "");

  return { content, details: { file_path: target, truncated }, ok: true };
}

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
  const indent = "  ";
  for (const node of tree.slice(0, 50)) {
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

// ── Factory ──

export function createDocumentTools(): ToolDef[] {
  return [
    {
      name: "read_document",
      description:
        "读取工作区内的文档（PDF/Word/文本），提取文本。WHEN 用户提供文件或引用工作区文件需要分析时使用。",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "工作区内的文件路径（相对或绝对）" },
          max_length: {
            type: "integer",
            default: 10000,
          },
        },
        required: ["file_path"],
      },
      execute: async (params) =>
        readDocument(
          params.file_path as string,
          (params.max_length as number) ?? 10000
        ),
    },
    {
      name: "write_to_file",
      description:
        "写入文本文件到工作区。WHEN 需要保存笔记、计划、代码或分析结果时使用。",
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
      description:
        "列出工作区文件树。WHEN 需要了解工作区有哪些文件时使用。",
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
  ];
}
