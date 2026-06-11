import fs from "fs";
import path from "path";
import { DATA_DIR } from "../db.js";
import { getActiveGoal } from "./planner-service.js";
import { safeSessionId } from "./chat-service.js";

// ── Paths ──

const SESSION_STATE_PATH = path.join(DATA_DIR, "session_state.json");
const SESSION_STATE_DIR = path.join(DATA_DIR, "session_state");

// ── Intent enum ──

export const Intent = {
  ASK: "ask",
  PLAN: "plan",
  ADJUST: "adjust",
  QUERY_PLAN: "query_plan",
  CHAT: "chat",
} as const;
export type Intent = (typeof Intent)[keyof typeof Intent];

// ── Constants ──

const QUESTIONS: Record<string, string> = {
  exam_type: "你想考国考、省考还是事业单位？",
  target_exam: "你计划报考哪个省份或具体考试？",
  daily_hours: "你每天大概能稳定学习几个小时？",
  current_level: "你之前做过真题吗？行测正确率或申论分数大概是多少？",
  weak_modules: "你觉得哪些模块比较薄弱？",
  student_status: "你是在职备考、在校备考，还是全职备考？",
  target_score: "你的目标分数是多少？",
};

const ADJUST_KEYWORDS = [
  "任务太多", "任务太少", "没时间", "太难", "太简单",
  "太多了", "太少了", "调整", "改一下计划",
  "今天没时间", "今天不学", "今天请假",
  "我已经会了", "这个模块简单", "跳过",
];

const QUERY_KEYWORDS = [
  "看看计划", "我的计划", "今天任务", "今日计划", "本周计划", "今天学什么",
  "今天有什么", "进度", "任务做得怎么样", "完成情况",
];

const PLAN_KEYWORDS = [
  "计划", "规划", "备考", "学习安排", "怎么学", "帮我安排", "制定",
  "国考", "省考", "事业单位", "公考",
];

const GREETING_KEYWORDS = new Set(["你好", "您好", "hi", "hello", "嗨", "在吗"]);

const DIAGNOSTIC_FIELDS = [
  { key: "exam_type", question: "你想考国考、省考还是事业单位？", priority: 1 },
  { key: "target_exam", question: "你计划报考哪个省份？", priority: 2 },
  { key: "daily_hours", question: "你每天大概能学几个小时？", priority: 3 },
  { key: "current_level", question: "你之前做过真题吗？行测正确率大概多少？", priority: 4 },
  { key: "weak_modules", question: "你觉得哪些模块比较薄弱？", priority: 5 },
  { key: "student_status", question: "你是在职备考还是全职备考？", priority: 6 },
  { key: "target_score", question: "你的目标分数是多少？", priority: 7 },
];

// ── Types ──

export interface IntentDecision {
  intent: Intent;
  question: string;
  missing_field: string | null;
  pending_fields: Record<string, unknown>;
}

// ── Session state paths ──

function sessionStatePath(sessionId: string = "default"): string {
  if (safeSessionId(sessionId) === "default") {
    return SESSION_STATE_PATH;
  }
  return path.join(SESSION_STATE_DIR, `${safeSessionId(sessionId)}.json`);
}

// ── Session state I/O ──

function loadSessionState(sessionId: string = "default"): Record<string, unknown> {
  const p = sessionStatePath(sessionId);
  if (!fs.existsSync(p)) {
    return { pending_fields: {}, diagnostic_in_progress: false };
  }
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (!data.pending_fields) data.pending_fields = {};
    if (data.diagnostic_in_progress === undefined) data.diagnostic_in_progress = false;
    return data;
  } catch {
    return { pending_fields: {}, diagnostic_in_progress: false };
  }
}

function saveSessionState(state: Record<string, unknown>, sessionId: string = "default"): void {
  const p = sessionStatePath(sessionId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf-8");
}

export function clearSessionState(sessionId: string = "default"): void {
  const p = sessionStatePath(sessionId);
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // ignore
  }
}

// ── Helper: active goal check ──

function hasActiveGoal(): boolean {
  return getActiveGoal() !== undefined;
}

// ── Helper: planning intent ──

function planningIntent(text: string): boolean {
  return PLAN_KEYWORDS.some((keyword) => text.includes(keyword));
}

// ── Helper: looks like diagnostic answer ──

function looksLikeDiagnosticAnswer(text: string, extractedFields: Record<string, unknown>): boolean {
  if (Object.keys(extractedFields).length > 0) return true;
  if (/\d+(?:\.\d+)?\s*(?:个?小时|h|分|%)/.test(text)) return true;
  return ["做过", "没做过", "真题", "薄弱", "弱", "强", "基础", "正确率"].some((word) =>
    text.includes(word),
  );
}

// ── Field extraction (regex patterns must match Python exactly) ──

function extractFields(text: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  // exam_type
  if (text.includes("国考")) {
    fields["exam_type"] = "国考";
  } else if (text.includes("省考")) {
    fields["exam_type"] = "省考";
  } else if (text.includes("事业单位")) {
    fields["exam_type"] = "事业单位";
  }

  // province regex (31 Chinese provinces)
  const provinceRe = /(北京|上海|天津|重庆|广东|江苏|浙江|山东|河南|四川|湖北|湖南|福建|安徽|河北|山西|陕西|江西|广西|云南|贵州|辽宁|吉林|黑龙江|海南|甘肃|青海|宁夏|新疆|西藏|内蒙古)/;
  const provinceMatch = provinceRe.exec(text);
  if (provinceMatch) {
    fields["target_exam"] =
      fields["exam_type"] === "省考"
        ? `${provinceMatch[1]}省考`
        : provinceMatch[1];
  }

  // exam_track
  const trackRe = /(副省级|地市级|行政执法|市地级|县乡)/;
  const trackMatch = trackRe.exec(text);
  if (trackMatch) {
    fields["target_exam"] = trackMatch[1];
  }

  // daily_hours
  const hoursRe = /(?:每天|每日)?\s*(\d+(?:\.\d+)?)\s*(?:个?小时|h)/;
  const hoursMatch = hoursRe.exec(text);
  if (hoursMatch) {
    fields["daily_hours"] = parseFloat(hoursMatch[1]);
  }

  // target_score
  const scoreRe = /(?:目标|想考|冲刺)?\s*(\d{2,3})\s*分/;
  const scoreMatch = scoreRe.exec(text);
  if (scoreMatch) {
    fields["target_score"] = parseInt(scoreMatch[1], 10);
  }

  // current_level
  const levelRe = /(正确率|行测).*?(\d{1,3})\s*%?/;
  const levelMatch = levelRe.exec(text);
  if (levelMatch) {
    fields["current_level"] = levelMatch[0];
  }

  // weak_modules
  const moduleNames = ["资料分析", "数量关系", "言语理解", "判断推理", "常识判断", "申论", "申论作文"];
  const weak: string[] = [];
  for (const name of moduleNames) {
    if (text.includes(name)) {
      weak.push(name);
    }
  }
  if (weak.length > 0) {
    fields["weak_modules"] = weak;
  }

  // student_status
  for (const status of ["在职", "全职", "在校"]) {
    if (text.includes(status)) {
      fields["student_status"] = status;
      break;
    }
  }

  return fields;
}

// ── IntentClassifier ──

export class IntentClassifier {
  classify(text: string, sessionId: string = "default"): IntentDecision {
    // Normalize: strip, lowercase, strip punctuation from both ends (matching Python str.strip)
    const normalized = text
      .trim()
      .toLowerCase()
      .replace(/^[。！!？?~\s]+|[。！!？?~\s]+$/g, "");

    if (GREETING_KEYWORDS.has(normalized)) {
      const state = loadSessionState(sessionId);
      return {
        intent: Intent.CHAT,
        question: "",
        missing_field: null,
        pending_fields: { ...((state.pending_fields as Record<string, unknown>) || {}) },
      };
    }

    const state = loadSessionState(sessionId);
    const pending: Record<string, unknown> = {
      ...((state.pending_fields as Record<string, unknown>) || {}),
    };
    const extracted = extractFields(text);
    Object.assign(pending, extracted);
    const hasGoal = hasActiveGoal();

    if (hasGoal && ADJUST_KEYWORDS.some((keyword) => text.includes(keyword))) {
      saveSessionState({ ...state, pending_fields: pending }, sessionId);
      return {
        intent: Intent.ADJUST,
        question: "",
        missing_field: null,
        pending_fields: pending,
      };
    }

    if (QUERY_KEYWORDS.some((keyword) => text.includes(keyword))) {
      saveSessionState({ ...state, pending_fields: pending }, sessionId);
      return {
        intent: Intent.QUERY_PLAN,
        question: "",
        missing_field: null,
        pending_fields: pending,
      };
    }

    const continuingDiagnostic =
      state.diagnostic_in_progress &&
      looksLikeDiagnosticAnswer(text, extracted);

    if (planningIntent(text) || continuingDiagnostic) {
      const missingEntry = DIAGNOSTIC_FIELDS.find((f) => !pending[f.key]);
      if (missingEntry) {
        saveSessionState(
          { pending_fields: pending, diagnostic_in_progress: true },
          sessionId,
        );
        return {
          intent: Intent.ASK,
          question: missingEntry.question,
          missing_field: missingEntry.key,
          pending_fields: pending,
        };
      }

      saveSessionState(
        { pending_fields: pending, diagnostic_in_progress: false },
        sessionId,
      );

      if (!hasGoal) {
        return {
          intent: Intent.PLAN,
          question: "",
          missing_field: null,
          pending_fields: pending,
        };
      }
      return {
        intent: Intent.ADJUST,
        question: "",
        missing_field: null,
        pending_fields: pending,
      };
    }

    saveSessionState({ ...state, pending_fields: pending }, sessionId);
    return {
      intent: Intent.CHAT,
      question: "",
      missing_field: null,
      pending_fields: pending,
    };
  }
}
