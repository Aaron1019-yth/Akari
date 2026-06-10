import fs from "fs";
import path from "path";
import { DATA_DIR } from "../../db.js";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import type { ToolDef, ToolResult } from "../llm-types.js";

// ── Tool implementation ──

async function readDocument(
  filePath: string,
  maxLength: number = 10000
): Promise<ToolResult> {
  // Resolve and verify path is within uploads directory
  const resolved = path.resolve(
    filePath.startsWith("~") ? filePath.replace(/^~/, process.env.HOME || "/Users") : filePath
  );
  const uploadsDir = path.resolve(DATA_DIR, "uploads");

  // Check that the resolved path is within uploadsDir
  const relativePath = path.relative(uploadsDir, resolved);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return {
      content: "只能读取通过 Akari 上传的文件。",
      ok: false,
    };
  }

  if (!fs.existsSync(resolved)) {
    return {
      content: "文件不存在。",
      ok: false,
    };
  }

  try {
    const ext = path.extname(resolved).toLowerCase();
    let text: string;

    if (ext === ".pdf") {
      const dataBuffer = fs.readFileSync(resolved);
      const pdfData = await pdfParse(dataBuffer);
      text = pdfData.text.trim();
    } else if (ext === ".docx") {
      const result = await mammoth.extractRawText({ path: resolved });
      text = result.value.trim();
    } else if ([".txt", ".md", ".json", ".csv", ".py", ".ts", ".js", ".html", ".css", ".yaml", ".yml", ".xml"].includes(ext)) {
      text = fs.readFileSync(resolved, "utf-8").trim();
    } else {
      return {
        content: "仅支持 PDF、Word(.docx) 和文本文件。",
        ok: false,
      };
    }

    const truncated = text.length > maxLength;
    const content = text.slice(0, maxLength) + (truncated ? "\n\n[内容已截断]" : "");

    return {
      content,
      details: { file_path: resolved, truncated },
      ok: true,
    };
  } catch (err) {
    return {
      content: `读取文件失败: ${err instanceof Error ? err.message : String(err)}`,
      ok: false,
    };
  }
}

// ── Factory ──

export function createDocumentTools(): ToolDef[] {
  return [
    {
      name: "read_document",
      description:
        "读取用户上传的文档（PDF/Word/文本），提取文本。WHEN 用户提供文件需要分析时使用。",
      parameters: {
        type: "object",
        properties: {
          file_path: { type: "string" },
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
  ];
}
