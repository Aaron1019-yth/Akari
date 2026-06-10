import fs from "fs";
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
 *  Skips blank lines and corrupt JSON lines (matching Python _read_messages). */
function readMessages(sessionPath: string): SessionMessage[] {
  const messages: SessionMessage[] = [];
  try {
    const text = fs.readFileSync(sessionPath, "utf-8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let item: unknown;
      try {
        item = JSON.parse(line);
      } catch {
        continue; // skip corrupt lines
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
  } catch {
    return []; // file doesn't exist or is unreadable
  }
  return messages;
}

// ── Public API ──

export function appendMessage(
  sessionId: string,
  role: string,
  content: string,
  createdAt?: string,
): void {
  if (!content.trim()) return;
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const file = sessionPath(sessionId);
  const payload = {
    role,
    content,
    created_at: createdAt || new Date().toISOString(),
  };
  fs.appendFileSync(file, JSON.stringify(payload) + "\n", "utf-8");
}

export function loadRecentMessages(
  sessionId: string,
  maxMessages = 18,
  maxChars = 12000,
): Message[] {
  const rows = readMessages(sessionPath(sessionId));
  if (rows.length === 0) return [];

  const selected: SessionMessage[] = [];
  let total = 0;
  // Take last maxMessages, iterate in reverse to accumulate from end
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
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, "utf-8");
    }
  } catch {
    // ignore read errors
  }
  return null;
}

export function saveSummary(sessionId: string, summary: string): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(summaryPath(sessionId), summary, "utf-8");
}

export function listSessions(): SessionMeta[] {
  if (!fs.existsSync(SESSIONS_DIR)) return [];

  const jsonlFiles = fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({
      name: f,
      path: path.join(SESSIONS_DIR, f),
      mtime: fs.statSync(path.join(SESSIONS_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  const sessions: SessionMeta[] = [];
  for (const file of jsonlFiles) {
    const sid = path.basename(file.name, ".jsonl");
    const messages = readMessages(file.path);
    if (messages.length === 0) continue;

    const firstUser = messages.find((m) => m.role === "user");
    const preview = (firstUser ? firstUser.content : "").slice(0, 60);

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
  return readMessages(sessionPath(sessionId));
}
