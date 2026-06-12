import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { DATA_DIR } from "../db.js";

// ── Types ──

/** Minimal Message shape used by loadRecentMessages.
 *  Mirrors backend/services/llm/schemas.py:Message (role + content fields only). */
export interface Message {
  role: string;
  content: string;
}

export interface SessionMeta {
  session_id: string;
  message_count: number;
  last_message_at: string;
  preview: string;
}

export interface SessionMessage {
  role: string;
  content: string;
  created_at: string;
}

// ── Paths ──

const SESSIONS_DIR = path.join(DATA_DIR, "memory", "sessions");

// ── Helpers ──

export function safeSessionId(sessionId: string): string {
  const cleaned = sessionId
    .split("")
    .filter((ch) => /[a-zA-Z0-9]/.test(ch) || ch === "-" || ch === "_")
    .join("");
  return cleaned || "default";
}

export function sessionPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${safeSessionId(sessionId)}.jsonl`);
}

function summaryPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${safeSessionId(sessionId)}.summary.txt`);
}

/** Read all user/assistant messages from a JSONL session file.
 *  Skips blank lines and corrupt JSON lines. */
function parseMessages(text: string): SessionMessage[] {
  const messages: SessionMessage[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let item: unknown;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      item &&
      typeof item === "object" &&
      "role" in item &&
      "content" in item
    ) {
      const obj = item as Record<string, unknown>;
      if (
        (obj.role === "user" || obj.role === "assistant") &&
        typeof obj.content === "string" &&
        obj.content.length > 0
      ) {
        messages.push({
          role: obj.role as string,
          content: obj.content as string,
          created_at: (obj.created_at as string) || "",
        });
      }
    }
  }
  return messages;
}

function readMessagesSync(filePath: string): SessionMessage[] {
  try {
    const text = fsSync.readFileSync(filePath, "utf-8");
    return parseMessages(text);
  } catch {
    return [];
  }
}

// ── Public API ──

export function appendMessage(
  sessionId: string,
  role: string,
  content: string,
  createdAt?: string,
): void {
  if (!content.trim()) return;
  fsSync.mkdirSync(SESSIONS_DIR, { recursive: true });
  const file = sessionPath(sessionId);
  const payload = {
    role,
    content,
    created_at: createdAt || new Date().toISOString(),
  };
  // Synchronous append — a single JSONL line is tiny; async would require
  // callers to await before reading, which breaks the current sync API contract.
  fsSync.appendFileSync(file, JSON.stringify(payload) + "\n", "utf-8");
}

export function loadRecentMessages(
  sessionId: string,
  maxMessages = 18,
  maxChars = 12000,
): Message[] {
  const rows = readMessagesSync(sessionPath(sessionId));
  if (rows.length === 0) return [];

  const selected: SessionMessage[] = [];
  let total = 0;
  const tail = rows.slice(-maxMessages);
  for (let i = tail.length - 1; i >= 0; i--) {
    const content = tail[i].content;
    if (total + content.length > maxChars && selected.length > 0) break;
    selected.push(tail[i]);
    total += content.length;
  }
  selected.reverse();
  return selected.map((item) => ({
    role: item.role,
    content: item.content,
  }));
}

export function loadSummary(sessionId: string): string | null {
  const p = summaryPath(sessionId);
  try {
    if (fsSync.existsSync(p)) {
      return fsSync.readFileSync(p, "utf-8");
    }
  } catch {
    // ignore read errors
  }
  return null;
}

export function saveSummary(sessionId: string, summary: string): void {
  fsSync.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFile(summaryPath(sessionId), summary, "utf-8").catch(() => {});
}

function formatSessionPreview(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim().replace(/^(请帮我|帮我|我想|麻烦你|请你)/, "").trim();
  if (normalized.length <= 22) return normalized;
  return `${normalized.slice(0, 22)}…`;
}

export function listSessions(): SessionMeta[] {
  if (!fsSync.existsSync(SESSIONS_DIR)) return [];

  const jsonlFiles = fsSync
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({
      name: f,
      path: path.join(SESSIONS_DIR, f),
      mtime: fsSync.statSync(path.join(SESSIONS_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  const sessions: SessionMeta[] = [];
  for (const file of jsonlFiles) {
    const sid = path.basename(file.name, ".jsonl");
    const messages = readMessagesSync(file.path);
    if (messages.length === 0) continue;

    const firstUser = messages.find((m) => m.role === "user");
    const preview = formatSessionPreview(firstUser?.content ?? "");

    sessions.push({
      session_id: sid,
      message_count: messages.length,
      last_message_at: messages[messages.length - 1].created_at,
      preview,
    });
  }
  return sessions;
}

export function getSessionMessages(sessionId: string): SessionMessage[] {
  return readMessagesSync(sessionPath(sessionId));
}

export function deleteSession(sessionId: string): void {
  const jsonl = sessionPath(sessionId);
  const summary = summaryPath(sessionId);
  try { if (fsSync.existsSync(jsonl)) fsSync.unlinkSync(jsonl); } catch { /* ok */ }
  try { if (fsSync.existsSync(summary)) fsSync.unlinkSync(summary); } catch { /* ok */ }
}
