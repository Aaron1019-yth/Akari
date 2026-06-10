import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { DATA_DIR } from "../db.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx"]);
const FILES_DIR = path.join(DATA_DIR, "uploads");
const INDEX_PATH = path.join(FILES_DIR, "index.json");

export interface StoredFile {
  file_id: string;
  filename: string;
  file_path: string;
  size: number;
  uploaded_at: string;
}

function safeFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const stem = path.basename(name, ext) || "document";
  const safe = stem.replace(/[^A-Za-z0-9_.\-一-鿿]/g, "_").slice(0, 80);
  return `${safe}${ext}`;
}

function readIndex(): StoredFile[] {
  if (!fs.existsSync(INDEX_PATH)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
    return Array.isArray(raw)
      ? raw.filter(
          (item: unknown): item is StoredFile =>
            typeof item === "object" &&
            item !== null &&
            "file_id" in item &&
            "filename" in item &&
            "file_path" in item,
        )
      : [];
  } catch {
    return [];
  }
}

function writeIndex(items: StoredFile[]): void {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.writeFileSync(
    INDEX_PATH,
    JSON.stringify(items, null, 2),
    "utf-8",
  );
}

export function listFiles(): StoredFile[] {
  return readIndex();
}

export interface UploadInput {
  originalname: string;
  buffer: Buffer;
}

export function saveUpload(file: UploadInput): StoredFile {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error("仅支持 PDF 和 Word(.docx) 文件");
  }

  if (file.buffer.length > MAX_FILE_SIZE) {
    throw new Error("文件不能超过 10MB");
  }

  fs.mkdirSync(FILES_DIR, { recursive: true });

  const fileId = `file_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const filename = safeFilename(file.originalname || `${fileId}${ext}`);
  const targetPath = path.join(FILES_DIR, `${fileId}_${filename}`);

  fs.writeFileSync(targetPath, file.buffer);

  const stored: StoredFile = {
    file_id: fileId,
    filename,
    file_path: targetPath,
    size: file.buffer.length,
    uploaded_at: new Date().toISOString().slice(0, 19),
  };

  const items = readIndex();
  items.unshift(stored);
  writeIndex(items);
  return stored;
}

export function deleteFile(fileId: string): boolean {
  try {
    const items = readIndex();
    const idx = items.findIndex((item) => item.file_id === fileId);
    if (idx === -1) return false;

    const filePath = items[idx].file_path;
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // file on disk already gone — still remove from index
    }

    items.splice(idx, 1);
    writeIndex(items);
    return true;
  } catch {
    return false;
  }
}

export function renameFile(fileId: string, newFilename: string): StoredFile | null {
  try {
    const items = readIndex();
    const match = items.find((item) => item.file_id === fileId);
    if (!match) return null;

    const safeNew = safeFilename(newFilename);
    const oldPath = match.file_path;
    const newPath = path.join(path.dirname(oldPath), `${fileId}_${safeNew}`);

    try {
      if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
    } catch {
      // if rename fails, still update index
    }

    match.filename = safeNew;
    match.file_path = newPath;
    writeIndex(items);
    return match;
  } catch {
    return null;
  }
}
