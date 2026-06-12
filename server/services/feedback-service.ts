import { randomUUID } from "crypto";
import { db } from "../db.js";
import {
  buildGoalTree,
  getActiveGoal,
} from "./planner-service.js";
import { syncActivePlanDocument } from "./plan-document-service.js";
import { chat } from "./llm-client.js";
import { writeFile } from "./workspace-service.js";
import { PdfReviewPriority } from "../types.js";
import type {
  DailyTaskRow,
  ErrorCandidateExtractRequest,
  ErrorCandidateGenerateRequest,
  ErrorCandidateOut,
  ErrorCandidatePatchRequest,
  ErrorCandidateRow,
  GoalTree,
  LearningArtifactOut,
  LearningArtifactRequest,
  LearningArtifactRow,
  ModuleRow,
  PdfReviewAnalyzeRequest,
  PdfReviewReport,
  StudyReviewOut,
  StudyReviewRow,
  TaskFeedbackOut,
  TaskFeedbackRequest,
  TaskFeedbackRow,
  WeeklyReviewRequest,
} from "../types.js";

export class FeedbackError extends Error {}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function taskFeedbackToOut(row: TaskFeedbackRow): TaskFeedbackOut {
  return {
    id: row.id,
    daily_task_id: row.daily_task_id,
    actual_minutes: row.actual_minutes,
    difficulty: row.difficulty as TaskFeedbackOut["difficulty"],
    focus: row.focus as TaskFeedbackOut["focus"],
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function artifactToOut(row: LearningArtifactRow): LearningArtifactOut {
  return {
    id: row.id,
    source_type: row.source_type as LearningArtifactOut["source_type"],
    source_ref: row.source_ref,
    daily_task_id: row.daily_task_id,
    title: row.title,
    raw_text: row.raw_text,
    metadata: parseJsonObject(row.metadata_json),
    created_at: row.created_at,
  };
}

function candidateToOut(row: ErrorCandidateRow): ErrorCandidateOut {
  return {
    id: row.id,
    artifact_id: row.artifact_id,
    daily_task_id: row.daily_task_id,
    module_id: row.module_id,
    subject: row.subject,
    question_type: row.question_type,
    review_kind: row.review_kind,
    question_text: row.question_text,
    user_answer: row.user_answer,
    correct_answer: row.correct_answer,
    choice_reason: row.choice_reason,
    question_summary: row.question_summary,
    mistake_summary: row.mistake_summary,
    cause: row.cause,
    suggested_fix: row.suggested_fix,
    confidence: row.confidence,
    status: row.status as ErrorCandidateOut["status"],
    created_at: row.created_at,
    updated_at: row.updated_at,
    confirmed_at: row.confirmed_at,
  };
}

function reviewToOut(row: StudyReviewRow): StudyReviewOut {
  return {
    id: row.id,
    scope: row.scope as StudyReviewOut["scope"],
    period_start: row.period_start,
    period_end: row.period_end,
    summary: row.summary,
    stats: parseJsonObject(row.stats_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getTask(taskId: string): DailyTaskRow {
  const task = db.prepare("SELECT * FROM daily_tasks WHERE id = ?").get(taskId) as DailyTaskRow | undefined;
  if (!task) throw new FeedbackError("Task not found");
  return task;
}

function getArtifact(artifactId: string): LearningArtifactRow {
  const artifact = db.prepare("SELECT * FROM learning_artifacts WHERE id = ?").get(artifactId) as LearningArtifactRow | undefined;
  if (!artifact) throw new FeedbackError("Artifact not found");
  return artifact;
}

function latestFeedbackForTasks(taskIds: string[]): TaskFeedbackOut[] {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map(() => "?").join(", ");
  const rows = db.prepare(
    `SELECT tf.*
     FROM task_feedback tf
     JOIN (
       SELECT daily_task_id, MAX(updated_at) AS max_updated_at
       FROM task_feedback
       WHERE daily_task_id IN (${placeholders})
       GROUP BY daily_task_id
     ) latest
       ON latest.daily_task_id = tf.daily_task_id
      AND latest.max_updated_at = tf.updated_at
     ORDER BY tf.updated_at DESC`
  ).all(...taskIds) as TaskFeedbackRow[];
  return rows.map(taskFeedbackToOut);
}

export function saveTaskFeedback(
  taskId: string,
  payload: TaskFeedbackRequest
): { feedback: TaskFeedbackOut; goal: GoalTree } {
  const now = nowIso();
  const feedbackId = id("feedback");

  const row = db.transaction(() => {
    getTask(taskId);
    db.prepare(
      `INSERT INTO task_feedback
         (id, daily_task_id, actual_minutes, difficulty, focus, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      feedbackId,
      taskId,
      payload.actual_minutes,
      payload.difficulty,
      payload.focus,
      payload.note,
      now,
      now,
    );

    db.prepare(
      "UPDATE daily_tasks SET actual_minutes = ?, status = 'completed' WHERE id = ?"
    ).run(payload.actual_minutes, taskId);

    return db.prepare("SELECT * FROM task_feedback WHERE id = ?").get(feedbackId) as TaskFeedbackRow;
  })();

  const goal = getActiveGoal();
  if (!goal) throw new FeedbackError("Active goal not found");
  syncActivePlanDocument();
  return { feedback: taskFeedbackToOut(row), goal: buildGoalTree(goal) };
}

function createLearningArtifactRow(payload: LearningArtifactRequest): LearningArtifactRow {
  if (payload.daily_task_id) getTask(payload.daily_task_id);
  const artifactId = id("artifact");
  const now = nowIso();
  db.prepare(
    `INSERT INTO learning_artifacts
       (id, source_type, source_ref, daily_task_id, title, raw_text, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    artifactId,
    payload.source_type,
    payload.source_ref,
    payload.daily_task_id ?? null,
    payload.title,
    payload.raw_text,
    JSON.stringify(payload.metadata),
    now,
  );
  return db.prepare("SELECT * FROM learning_artifacts WHERE id = ?").get(artifactId) as LearningArtifactRow;
}

export function createLearningArtifact(payload: LearningArtifactRequest): LearningArtifactOut {
  return artifactToOut(createLearningArtifactRow(payload));
}

export function createLearningArtifactForAnalysis(payload: LearningArtifactRequest): LearningArtifactRow {
  return createLearningArtifactRow(payload);
}

function modulesForActiveGoal(): ModuleRow[] {
  const goal = getActiveGoal();
  if (!goal) return [];
  return db.prepare(
    `SELECT m.*
     FROM modules m
     JOIN tracks t ON m.track_id = t.id
     WHERE t.goal_id = ?
     ORDER BY t.sort_order, m.sort_order`
  ).all(goal.id) as ModuleRow[];
}

function inferModule(text: string, dailyTaskId: string | null): ModuleRow | undefined {
  if (dailyTaskId) {
    const task = db.prepare("SELECT * FROM daily_tasks WHERE id = ?").get(dailyTaskId) as DailyTaskRow | undefined;
    if (task) {
      const module = db.prepare("SELECT * FROM modules WHERE id = ?").get(task.module_id) as ModuleRow | undefined;
      if (module) return module;
    }
  }

  const modules = modulesForActiveGoal();
  return modules.find((module) => text.includes(module.name)) || modules[0];
}

const CAUSE_RULES = [
  { keyword: "计算", cause: "计算过程不稳" },
  { keyword: "审题", cause: "审题不稳" },
];

function inferCause(text: string): string {
  return CAUSE_RULES.find((rule) => text.includes(rule.keyword))?.cause ?? "需要进一步整理复盘线索";
}

function normalizeReviewKind(value: string): string {
  if (["memory", "understanding", "skill", "mixed"].includes(value)) return value;
  return "mixed";
}

function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  const source = fenced ?? raw;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new FeedbackError("No JSON object found");
  return JSON.parse(source.slice(start, end + 1));
}

function splitQuestionText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const parts = normalized.split(/(?=\n?\s*(?:第\s*)?\d{1,2}[\.、]\s*)/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [normalized.slice(0, 4000)];
}

function compactSummary(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 120) || "待补充题目摘要";
}

export function generateErrorCandidate(payload: ErrorCandidateGenerateRequest): ErrorCandidateOut {
  const artifact = payload.artifact_id ? getArtifact(payload.artifact_id) : createLearningArtifactRow({
    source_type: "manual",
    source_ref: "",
    daily_task_id: payload.daily_task_id ?? null,
    title: "手动复盘素材",
    raw_text: payload.text ?? "",
    metadata: {},
  });

  const text = [artifact.title, artifact.raw_text, payload.text, payload.hint].filter(Boolean).join("\n");
  const dailyTaskId = payload.daily_task_id ?? artifact.daily_task_id;
  if (dailyTaskId) getTask(dailyTaskId);
  const module = inferModule(text, dailyTaskId);
  const now = nowIso();
  const candidateId = id("candidate");
  const questionSummary = compactSummary(text);
  const cause = inferCause(text);

  db.prepare(
    `INSERT INTO error_candidates
       (id, artifact_id, daily_task_id, module_id, subject, question_type, review_kind,
        question_text, user_answer, correct_answer, choice_reason, question_summary,
        mistake_summary, cause, suggested_fix, confidence, status, created_at, updated_at, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    candidateId,
    artifact.id,
    dailyTaskId ?? null,
    module?.id ?? null,
    module?.name ?? "",
    "",
    "mixed",
    text.trim(),
    "",
    "",
    "",
    questionSummary,
    payload.hint || "用户提交了可用于复盘的素材",
    cause,
    module ? `复盘${module.name}相关基础方法，并做同类题巩固。` : "补充题目信息后再复盘同类题。",
    module ? 0.65 : 0.35,
    "pending",
    now,
    now,
    null,
  );

  const row = db.prepare("SELECT * FROM error_candidates WHERE id = ?").get(candidateId) as ErrorCandidateRow;
  return candidateToOut(row);
}

type ExtractedWrongQuestion = {
  question_text: string;
  user_answer?: string;
  correct_answer?: string;
  choice_reason?: string;
  subject?: string;
  question_type?: string;
  review_kind?: string;
  cause?: string;
  suggested_fix?: string;
};

async function extractWrongQuestionsWithLlm(text: string, hint: string): Promise<ExtractedWrongQuestion[]> {
  const content = text.slice(0, 12000);
  const raw = await chat([
    {
      role: "system",
      content: "你是公考错题整理助手。只输出 JSON，不要输出 Markdown。不要编造 PDF 中不存在的答案、图表或用户选择；缺失字段填空字符串。review_kind 只能是 memory、understanding、skill、mixed。",
    },
    {
      role: "user",
      content: `从下面的粉笔错题 PDF 文本中拆分错题，生成 JSON：{\"questions\":[{\"question_text\":\"完整题干和选项；如果图表缺失请写明需要查看原 PDF 图表\",\"user_answer\":\"\",\"correct_answer\":\"\",\"choice_reason\":\"\",\"subject\":\"模块，如资料分析/言语理解\",\"question_type\":\"题型\",\"review_kind\":\"memory|understanding|skill|mixed\",\"cause\":\"简短错因/待补充\",\"suggested_fix\":\"简短复盘建议\"}]}。${hint ? `补充要求：${hint}\n` : ""}\nPDF 文本：\n${content}`,
    },
  ], null, 0, 4096);
  const parsed = extractJsonObject(raw) as { questions?: unknown };
  if (!Array.isArray(parsed.questions)) return [];
  return parsed.questions.map((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      question_text: typeof value.question_text === "string" ? value.question_text.trim() : "",
      user_answer: typeof value.user_answer === "string" ? value.user_answer.trim() : "",
      correct_answer: typeof value.correct_answer === "string" ? value.correct_answer.trim() : "",
      choice_reason: typeof value.choice_reason === "string" ? value.choice_reason.trim() : "",
      subject: typeof value.subject === "string" ? value.subject.trim() : "",
      question_type: typeof value.question_type === "string" ? value.question_type.trim() : "",
      review_kind: typeof value.review_kind === "string" ? normalizeReviewKind(value.review_kind.trim()) : "mixed",
      cause: typeof value.cause === "string" ? value.cause.trim() : "",
      suggested_fix: typeof value.suggested_fix === "string" ? value.suggested_fix.trim() : "",
    };
  }).filter((item) => item.question_text);
}

function fallbackWrongQuestions(text: string): ExtractedWrongQuestion[] {
  return splitQuestionText(text).map((questionText) => ({
    question_text: questionText,
    review_kind: "mixed",
    cause: "待补充复盘线索",
    suggested_fix: "保留原 PDF 题面，补充答案和错因后复盘。",
  }));
}

function normalizePriority(value: string): PdfReviewPriority {
  const parsed = PdfReviewPriority.safeParse(value);
  return parsed.success ? parsed.data : "medium";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePdfReviewReport(value: unknown, fallbackText: string): PdfReviewReport {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const arrayOfObjects = (items: unknown) => Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  const report: PdfReviewReport = {
    overview: asString(source.overview) || compactSummary(fallbackText),
    weak_points: arrayOfObjects(source.weak_points).map((item) => ({
      area: asString(item.area) || "待判断模块",
      evidence: asString(item.evidence) || "PDF 文本证据不足",
      diagnosis: asString(item.diagnosis) || "需要回粉笔结合原题和解析确认",
      priority: normalizePriority(asString(item.priority)),
    })),
    memory_items: arrayOfObjects(source.memory_items).map((item) => ({
      item: asString(item.item),
      reason: asString(item.reason),
      review_method: asString(item.review_method) || "加入日常复盘清单，隔天回看一次",
    })).filter((item) => item.item),
    fenbi_redo_actions: arrayOfObjects(source.fenbi_redo_actions).map((item) => ({
      title: asString(item.title) || "回粉笔重做对应错题",
      reason: asString(item.reason) || "Akari 不保存题图和完整作答环境",
      source_hint: asString(item.source_hint) || "按 PDF 原文件定位题目",
    })),
    plan_suggestions: arrayOfObjects(source.plan_suggestions).map((item) => ({
      suggestion: asString(item.suggestion),
      reason: asString(item.reason),
    })).filter((item) => item.suggestion),
    source_warnings: Array.isArray(source.source_warnings)
      ? source.source_warnings.map(asString).filter(Boolean)
      : [],
  };
  if (!report.weak_points.length) {
    report.weak_points.push({
      area: "错题复盘",
      evidence: compactSummary(fallbackText),
      diagnosis: "PDF 文本可读，但薄弱点需要结合粉笔原题和解析确认",
      priority: "medium",
    });
  }
  if (!report.fenbi_redo_actions.length) {
    report.fenbi_redo_actions.push({
      title: "回粉笔重做本次 PDF 对应错题",
      reason: "PDF 文本无法完整保留图表、选项排版和作答环境",
      source_hint: "打开粉笔错题本，按导出的 PDF 顺序逐题复盘",
    });
  }
  if (!report.source_warnings.length) {
    report.source_warnings.push("Akari 只分析 PDF 可抽取文本；题图、表格细节和完整解析请回粉笔查看。");
  }
  return report;
}

async function analyzePdfReviewWithLlm(text: string, hint: string): Promise<PdfReviewReport> {
  const content = text.slice(0, 14000);
  const raw = await chat([
    {
      role: "system",
      content: "你是公考备考复盘分析助手。Akari 不替代粉笔错题本；你的任务是从错题 PDF 文本中归纳薄弱点、记忆清单、回粉笔重做清单和计划建议。只输出 JSON，不要 Markdown。不要编造题图、答案或 PDF 中没有的信息。priority 只能是 high、medium、low。",
    },
    {
      role: "user",
      content: `分析下面的粉笔错题 PDF 文本，输出 JSON：{\"overview\":\"本次错题结构概览\",\"weak_points\":[{\"area\":\"模块/题型\",\"evidence\":\"来自 PDF 的简短证据\",\"diagnosis\":\"薄弱点判断\",\"priority\":\"high|medium|low\"}],\"memory_items\":[{\"item\":\"需要积累的词语/公式/方法\",\"reason\":\"为什么要记\",\"review_method\":\"怎么复习\"}],\"fenbi_redo_actions\":[{\"title\":\"回粉笔重做动作\",\"reason\":\"为什么回粉笔做\",\"source_hint\":\"如何从 PDF/粉笔定位\"}],\"plan_suggestions\":[{\"suggestion\":\"计划调整建议\",\"reason\":\"依据\"}],\"source_warnings\":[\"来源限制提醒\"]}。${hint ? `补充要求：${hint}\n` : ""}\nPDF 文本：\n${content}`,
    },
  ], null, 0, 4096);
  return normalizePdfReviewReport(extractJsonObject(raw), text);
}

function fallbackPdfReviewReport(text: string): PdfReviewReport {
  return normalizePdfReviewReport({}, text);
}

function renderPdfReviewMarkdown(report: PdfReviewReport, artifact: LearningArtifactRow): string {
  const weakPoints = report.weak_points.map((item) => `- 【${item.priority}】${item.area}：${item.diagnosis}\n  - 证据：${item.evidence}`).join("\n") || "- 暂无";
  const memoryItems = report.memory_items.map((item) => `- ${item.item}：${item.reason}\n  - 复习方式：${item.review_method}`).join("\n") || "- 暂无明确记忆项";
  const redoActions = report.fenbi_redo_actions.map((item) => `- ${item.title}：${item.reason}\n  - 定位：${item.source_hint}`).join("\n") || "- 回粉笔重做本次 PDF 对应错题";
  const suggestions = report.plan_suggestions.map((item) => `- ${item.suggestion}\n  - 依据：${item.reason}`).join("\n") || "- 暂不自动调整计划，先完成本次复盘。";
  const warnings = report.source_warnings.map((item) => `- ${item}`).join("\n");
  return [
    `# 粉笔错题 PDF 复盘分析：${artifact.title || artifact.source_ref || "未命名原件"}`,
    "",
    `<!-- artifact:${artifact.id} -->`,
    "",
    "## 1. 本次错题结构",
    report.overview,
    "",
    "## 2. 薄弱点摘要",
    weakPoints,
    "",
    "## 3. 记忆清单",
    memoryItems,
    "",
    "## 4. 回粉笔重做清单",
    redoActions,
    "",
    "## 5. 计划建议",
    suggestions,
    "",
    "## 6. 来源提醒",
    warnings,
  ].join("\n");
}

function priorityConfidence(priority: PdfReviewPriority): number {
  if (priority === "high") return 0.82;
  if (priority === "low") return 0.6;
  return 0.72;
}

function createConfirmedCandidatesFromPdfReport(report: PdfReviewReport, artifact: LearningArtifactRow, now: string): number {
  const existingCount = (db.prepare(
    "SELECT COUNT(*) AS count FROM error_candidates WHERE artifact_id = ? AND status = 'confirmed'"
  ).get(artifact.id) as { count: number }).count;
  if (existingCount > 0) return 0;

  const moduleFallback = inferModule([artifact.title, artifact.raw_text].filter(Boolean).join("\n"), artifact.daily_task_id);
  const redoText = report.fenbi_redo_actions.map((item) => `${item.title}：${item.reason}（${item.source_hint}）`).join("\n");
  const suggestionText = report.plan_suggestions.map((item) => `${item.suggestion}：${item.reason}`).join("\n");
  const fixes = [redoText, suggestionText].filter(Boolean).join("\n") || "回粉笔查看原题图片、图表和解析后重做对应错题。";
  const weakPoints = [...report.weak_points]
    .sort((a, b) => priorityConfidence(b.priority) - priorityConfidence(a.priority))
    .slice(0, 5);

  for (const weakPoint of weakPoints) {
    const candidateId = id("candidate");
    db.prepare(
      `INSERT INTO error_candidates
         (id, artifact_id, daily_task_id, module_id, subject, question_type, review_kind,
          question_text, user_answer, correct_answer, choice_reason, question_summary,
          mistake_summary, cause, suggested_fix, confidence, status, created_at, updated_at, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      candidateId,
      artifact.id,
      artifact.daily_task_id ?? null,
      moduleFallback?.id ?? null,
      weakPoint.area,
      "PDF诊断",
      "mixed",
      `来自粉笔 PDF 的跨题诊断：${artifact.title || artifact.source_ref || artifact.id}`,
      "",
      "",
      "",
      weakPoint.evidence,
      weakPoint.diagnosis,
      weakPoint.area,
      fixes,
      priorityConfidence(weakPoint.priority),
      "confirmed",
      now,
      now,
      now,
    );
  }

  return weakPoints.length;
}

function mergePdfReviewStats(existing: StudyReviewRow | undefined, report: PdfReviewReport, artifact: LearningArtifactRow): Record<string, unknown> {
  const stats = existing ? parseJsonObject(existing.stats_json) : {};
  const artifactIds = Array.isArray(stats.pdf_artifact_ids) ? stats.pdf_artifact_ids.map(asString).filter(Boolean) : [];
  const reports = Array.isArray(stats.pdf_review_reports) ? stats.pdf_review_reports : [];
  const nextArtifactIds = artifactIds.includes(artifact.id) ? artifactIds : [...artifactIds, artifact.id];
  const nextReports = reports.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).artifact_id === artifact.id)
    ? reports
    : [...reports, { artifact_id: artifact.id, source_ref: artifact.source_ref, report }];

  return {
    ...stats,
    pdf_review_report: report,
    latest_pdf_review_report: report,
    pdf_review_reports: nextReports,
    pdf_artifact_ids: nextArtifactIds,
    pdf_review_count: nextArtifactIds.length,
    artifact_id: artifact.id,
    source_ref: artifact.source_ref,
  };
}

function mergePdfReviewSummary(existing: StudyReviewRow | undefined, rendered: string, artifact: LearningArtifactRow): string {
  if (!existing?.summary) return rendered;
  if (existing.summary.includes(`<!-- artifact:${artifact.id} -->`)) return existing.summary;
  return `${existing.summary}\n\n---\n\n${rendered}`;
}

export async function analyzePdfReviewArtifact(payload: PdfReviewAnalyzeRequest): Promise<{ artifact: LearningArtifactOut; review: StudyReviewOut; report: PdfReviewReport }> {
  const artifact = getArtifact(payload.artifact_id);
  const text = artifact.raw_text.trim();
  if (!text) throw new FeedbackError("Artifact text is empty");

  let report: PdfReviewReport;
  try {
    report = await analyzePdfReviewWithLlm(text, payload.hint);
  } catch {
    report = fallbackPdfReviewReport(text);
  }

  const now = nowIso();
  const today = now.slice(0, 10);
  const rendered = renderPdfReviewMarkdown(report, artifact);
  const existing = db.prepare(
    "SELECT * FROM study_reviews WHERE scope = 'daily' AND period_start = ? AND period_end = ?"
  ).get(today, today) as StudyReviewRow | undefined;

  const row = db.transaction(() => {
    createConfirmedCandidatesFromPdfReport(report, artifact, now);
    const summary = mergePdfReviewSummary(existing, rendered, artifact);
    const stats = mergePdfReviewStats(existing, report, artifact);

    if (existing) {
      db.prepare(
        `UPDATE study_reviews
         SET summary = ?, stats_json = ?, updated_at = ?
         WHERE id = ?`
      ).run(summary, JSON.stringify(stats), now, existing.id);
      return db.prepare("SELECT * FROM study_reviews WHERE id = ?").get(existing.id) as StudyReviewRow;
    }
    const reviewId = id("review");
    db.prepare(
      `INSERT INTO study_reviews
         (id, scope, period_start, period_end, summary, stats_json, created_at, updated_at)
       VALUES (?, 'daily', ?, ?, ?, ?, ?, ?)`
    ).run(reviewId, today, today, summary, JSON.stringify(stats), now, now);
    return db.prepare("SELECT * FROM study_reviews WHERE id = ?").get(reviewId) as StudyReviewRow;
  })();

  return { artifact: artifactToOut(artifact), review: reviewToOut(row), report };
}

export async function extractErrorCandidates(payload: ErrorCandidateExtractRequest): Promise<{ artifact: LearningArtifactOut; candidates: ErrorCandidateOut[] }> {
  const artifact = getArtifact(payload.artifact_id);
  const dailyTaskId = payload.daily_task_id ?? artifact.daily_task_id;
  if (dailyTaskId) getTask(dailyTaskId);
  const text = artifact.raw_text.trim();
  if (!text) throw new FeedbackError("Artifact text is empty");

  let questions: ExtractedWrongQuestion[];
  try {
    questions = await extractWrongQuestionsWithLlm(text, payload.hint);
  } catch {
    questions = fallbackWrongQuestions(text);
  }
  if (!questions.length) questions = fallbackWrongQuestions(text);

  const moduleFallback = inferModule(text, dailyTaskId);
  const now = nowIso();
  const rows = db.transaction(() => questions.map((question, index) => {
    const candidateId = id("candidate");
    const subject = question.subject || moduleFallback?.name || "";
    const questionText = question.question_text.trim();
    const summary = compactSummary(questionText);
    db.prepare(
      `INSERT INTO error_candidates
         (id, artifact_id, daily_task_id, module_id, subject, question_type, review_kind,
          question_text, user_answer, correct_answer, choice_reason, question_summary,
          mistake_summary, cause, suggested_fix, confidence, status, created_at, updated_at, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      candidateId,
      artifact.id,
      dailyTaskId ?? null,
      moduleFallback?.id ?? null,
      subject,
      question.question_type ?? "",
      normalizeReviewKind(question.review_kind ?? "mixed"),
      questionText,
      question.user_answer ?? "",
      question.correct_answer ?? "",
      question.choice_reason ?? "",
      summary,
      `PDF 第 ${index + 1} 条错题，保留原件来源：${artifact.source_ref || artifact.title}`,
      question.cause || inferCause(questionText),
      question.suggested_fix || "补充答案和错因后，按题型归类复盘。",
      0.72,
      "pending",
      now,
      now,
      null,
    );
    return db.prepare("SELECT * FROM error_candidates WHERE id = ?").get(candidateId) as ErrorCandidateRow;
  }))();

  return { artifact: artifactToOut(artifact), candidates: rows.map(candidateToOut) };
}

export function listErrorCandidates(status?: string): ErrorCandidateOut[] {
  const rows = status
    ? db.prepare("SELECT * FROM error_candidates WHERE status = ? ORDER BY updated_at DESC").all(status) as ErrorCandidateRow[]
    : db.prepare("SELECT * FROM error_candidates ORDER BY updated_at DESC").all() as ErrorCandidateRow[];
  return rows.map(candidateToOut);
}

export function updateErrorCandidate(
  candidateId: string,
  payload: ErrorCandidatePatchRequest
): ErrorCandidateOut {
  const existing = db.prepare("SELECT * FROM error_candidates WHERE id = ?").get(candidateId) as ErrorCandidateRow | undefined;
  if (!existing) throw new FeedbackError("Candidate not found");
  if (payload.daily_task_id) getTask(payload.daily_task_id);
  if (payload.module_id) {
    const module = db.prepare("SELECT * FROM modules WHERE id = ?").get(payload.module_id) as ModuleRow | undefined;
    if (!module) throw new FeedbackError("Module not found");
  }

  const now = nowIso();
  const fieldMap: [string, unknown][] = [
    ["status", payload.status],
    ["daily_task_id", payload.daily_task_id],
    ["module_id", payload.module_id],
    ["subject", payload.subject],
    ["question_type", payload.question_type],
    ["review_kind", payload.review_kind],
    ["question_text", payload.question_text],
    ["user_answer", payload.user_answer],
    ["correct_answer", payload.correct_answer],
    ["choice_reason", payload.choice_reason],
    ["question_summary", payload.question_summary],
    ["mistake_summary", payload.mistake_summary],
    ["cause", payload.cause],
    ["suggested_fix", payload.suggested_fix],
    ["confidence", payload.confidence],
  ];
  const setClauses = ["updated_at = ?"];
  const values: unknown[] = [now];

  for (const [column, value] of fieldMap) {
    if (value !== undefined) {
      setClauses.push(`${column} = ?`);
      values.push(value);
    }
  }

  if (payload.status === "confirmed") {
    setClauses.push("confirmed_at = COALESCE(confirmed_at, ?)");
    values.push(now);
  } else if (payload.status === "pending" || payload.status === "dismissed") {
    setClauses.push("confirmed_at = NULL");
  }

  values.push(candidateId);
  db.prepare(`UPDATE error_candidates SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
  const row = db.prepare("SELECT * FROM error_candidates WHERE id = ?").get(candidateId) as ErrorCandidateRow;
  return candidateToOut(row);
}

export function getDailyFeedback(date: string): {
  date: string;
  tasks: DailyTaskRow[];
  feedback: TaskFeedbackOut[];
  confirmed_errors: ErrorCandidateOut[];
  stats: Record<string, unknown>;
  review: StudyReviewOut | null;
} {
  const tasks = db.prepare(
    `SELECT dt.* FROM daily_tasks dt
     JOIN weekly_plans wp ON wp.id = dt.weekly_plan_id
     JOIN goals g ON g.id = wp.goal_id
     WHERE dt.date = ? AND g.status = 'active'
     ORDER BY
       CASE dt.time_slot WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'evening' THEN 2 END,
       dt.sort_order`
  ).all(date) as DailyTaskRow[];
  const feedback = latestFeedbackForTasks(tasks.map((task) => task.id));
  const confirmedRows = db.prepare(
    `SELECT ec.*
     FROM error_candidates ec
     LEFT JOIN daily_tasks dt ON dt.id = ec.daily_task_id
     LEFT JOIN weekly_plans wp ON wp.id = dt.weekly_plan_id
     LEFT JOIN goals g ON g.id = wp.goal_id
     WHERE ec.status = 'confirmed'
       AND (g.status = 'active' OR dt.id IS NULL)
       AND (dt.date = ? OR substr(ec.confirmed_at, 1, 10) = ?)
     ORDER BY ec.confirmed_at DESC`
  ).all(date, date) as ErrorCandidateRow[];
  const confirmedErrors = confirmedRows.map(candidateToOut);
  const reviewRow = db.prepare(
    "SELECT * FROM study_reviews WHERE scope = 'daily' AND period_start = ? AND period_end = ?"
  ).get(date, date) as StudyReviewRow | undefined;
  const topCauses = [...new Set(confirmedErrors.map((candidate) => candidate.cause).filter(Boolean))].slice(0, 5);
  const pdfReviewCount = new Set(confirmedErrors.filter((candidate) => candidate.question_type === "PDF诊断").map((candidate) => candidate.artifact_id)).size;

  return {
    date,
    tasks,
    feedback,
    confirmed_errors: confirmedErrors,
    stats: {
      completed_count: tasks.filter((task) => task.status === "completed").length,
      total_count: tasks.length,
      actual_minutes: feedback.reduce((sum, item) => sum + item.actual_minutes, 0),
      hard_count: feedback.filter((item) => item.difficulty === "hard").length,
      confirmed_error_count: confirmedErrors.length,
      pdf_review_count: pdfReviewCount,
      top_causes: topCauses,
    },
    review: reviewRow ? reviewToOut(reviewRow) : null,
  };
}

function renderWeeklyReviewMarkdown(input: {
  completed: number;
  total: number;
  actualMinutes: number;
  hardCount: number;
  confirmedCount: number;
  topSubjects: string[];
  topCauses: string[];
  verbalCount: number;
  pdfReviewCount: number;
  buckets: { wrong: number; unsure: number; slow: number; lowAccuracy: number };
}): string {
  const subjects = input.topSubjects.length ? input.topSubjects.join("、") : "暂无";
  const causes = input.topCauses.length ? input.topCauses.join("、") : "暂无";

  return [
    "# 本周复盘",
    "",
    "## 1. 学习完成情况",
    `- 任务完成：${input.completed}/${input.total}`,
    `- 实际学习：${input.actualMinutes} 分钟`,
    `- 高负荷任务：${input.hardCount} 个`,
    "",
    "## 2. 复盘素材总览",
    `- 已加入复盘素材：${input.confirmedCount} 条`,
    `- 已纳入 PDF 诊断：${input.pdfReviewCount} 份`,
    `- 高频模块：${subjects}`,
    `- 高频分类：${causes}`,
    `- 言语相关素材：${input.verbalCount} 条`,
    "",
    "## 3. 言语复盘数据整理",
    "| 类型 | 数量 | 需要用户自己检查的问题 |",
    "| --- | ---: | --- |",
    `| 错题 | ${input.buckets.wrong} | 我错在哪里：结构、逻辑、词义，还是选项理解？ |`,
    `| 纠结题 | ${input.buckets.unsure} | 我纠结在哪两个选项？差异词是什么？ |`,
    `| 耗时长 | ${input.buckets.slow} | 哪一步慢：读文段、找对应、排除选项？ |`,
    `| 低准确率 | ${input.buckets.lowAccuracy} | 这个题型是否需要集中训练？ |`,
    "",
    "## 4. 下周复盘动作",
    "- 对照答案前，先写自己的第一反应和排除路径。",
    "- 听/看解析时，只记录与自己思路不同的点。",
    "- 逻辑填空单独沉淀词语、成语、搭配和语境。",
    "- 对耗时长的题，记录慢在读文段、定位信息还是排除选项。",
    "",
    "> 这份复盘只整理数据和提示检查方向，真正的题目理解仍以你自己的思考、答案和解析对照为准。",
  ].join("\n");
}

function renderDailyReviewMarkdown(input: ReturnType<typeof getDailyFeedback>): string {
  const taskLines = input.tasks.length
    ? input.tasks.map((task) => `- [${task.status === "completed" ? "x" : " "}] ${task.title}（${task.subject}，${task.actual_minutes || 0} 分钟）`)
    : ["- 暂无今日任务"];
  const feedbackLines = input.feedback.length
    ? input.feedback.map((item) => `- ${item.difficulty}/${item.focus}：${item.note || "无备注"}`)
    : ["- 暂无任务反馈"];
  const errorLines = input.confirmed_errors.length
    ? input.confirmed_errors.slice(0, 12).map((item) => `- ${item.subject || "综合"}：${item.mistake_summary || item.question_summary} → ${item.suggested_fix}`)
    : ["- 暂无已确认复盘素材"];
  const causes = Array.isArray(input.stats.top_causes) && input.stats.top_causes.length ? input.stats.top_causes.join("、") : "暂无";

  return [
    `# 每日复盘 ${input.date}`,
    "",
    "## 1. 今日任务",
    ...taskLines,
    "",
    "## 2. 任务反馈",
    ...feedbackLines,
    "",
    "## 3. 已确认复盘素材",
    ...errorLines,
    "",
    "## 4. 数据概览",
    `- 完成任务：${input.stats.completed_count}/${input.stats.total_count}`,
    `- 实际学习：${input.stats.actual_minutes} 分钟`,
    `- 高负荷反馈：${input.stats.hard_count} 条`,
    `- 已确认复盘素材：${input.stats.confirmed_error_count} 条`,
    `- PDF 诊断文件：${input.stats.pdf_review_count} 份`,
    `- 高频错因：${causes}`,
    "",
    "## 5. 明日建议",
    "- 优先处理今天已确认复盘素材中的高频错因。",
    "- 回到原平台重做对应错题，Akari 只保留诊断、记忆点和行动清单。",
    "- 如果今天没有明确计入复盘的素材，不要从普通上传文件里自动补素材。",
  ].join("\n");
}

export function writeDailyReviewDocument(date: string): { path: string; review: StudyReviewOut | null } {
  const daily = getDailyFeedback(date);
  const content = renderDailyReviewMarkdown(daily);
  const filePath = `reviews/${date}-daily-review.md`;
  writeFile(filePath, content);
  return { path: filePath, review: daily.review };
}

export function createWeeklyReview(payload: WeeklyReviewRequest): StudyReviewOut {
  const existing = db.prepare(
    "SELECT * FROM study_reviews WHERE scope = 'weekly' AND period_start = ? AND period_end = ?"
  ).get(payload.week_start, payload.week_end) as StudyReviewRow | undefined;
  if (existing && !payload.regenerate) return reviewToOut(existing);

  const tasks = db.prepare(
    `SELECT dt.* FROM daily_tasks dt
     JOIN weekly_plans wp ON wp.id = dt.weekly_plan_id
     JOIN goals g ON g.id = wp.goal_id
     WHERE dt.date >= ? AND dt.date <= ? AND g.status = 'active'
     ORDER BY dt.date, dt.sort_order`
  ).all(payload.week_start, payload.week_end) as DailyTaskRow[];
  const feedback = latestFeedbackForTasks(tasks.map((task) => task.id));
  const confirmed = db.prepare(
    `SELECT ec.*
     FROM error_candidates ec
     LEFT JOIN daily_tasks dt ON dt.id = ec.daily_task_id
     LEFT JOIN weekly_plans wp ON wp.id = dt.weekly_plan_id
     LEFT JOIN goals g ON g.id = wp.goal_id
     WHERE ec.status = 'confirmed'
       AND (g.status = 'active' OR dt.id IS NULL)
       AND (dt.date BETWEEN ? AND ? OR substr(ec.confirmed_at, 1, 10) BETWEEN ? AND ?)
     ORDER BY ec.confirmed_at DESC`
  ).all(payload.week_start, payload.week_end, payload.week_start, payload.week_end) as ErrorCandidateRow[];
  const confirmedErrors = confirmed.map(candidateToOut);
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "completed").length;
  const actualMinutes = feedback.reduce((sum, item) => sum + item.actual_minutes, 0);
  const topCauses = [...new Set(confirmedErrors.map((candidate) => candidate.cause).filter(Boolean))].slice(0, 5);
  const topSubjects = [...new Set(confirmedErrors.map((candidate) => candidate.subject).filter(Boolean))].slice(0, 5);
  const pdfReviewCount = new Set(confirmedErrors.filter((candidate) => candidate.question_type === "PDF诊断").map((candidate) => candidate.artifact_id)).size;
  const stats = {
    completion_rate: total ? Math.round((completed / total) * 100) / 100 : 0,
    completed_count: completed,
    total_count: total,
    actual_minutes: actualMinutes,
    confirmed_error_count: confirmedErrors.length,
    pdf_review_count: pdfReviewCount,
    top_subjects: topSubjects,
    top_causes: topCauses,
  };
  const hardCount = feedback.filter((item) => item.difficulty === "hard").length;
  const bucketCount = (keyword: string) => confirmedErrors.filter((candidate) =>
    [candidate.cause, candidate.mistake_summary, candidate.suggested_fix].some((value) => value.includes(keyword))
  ).length;
  const verbalCount = confirmedErrors.filter((candidate) =>
    [candidate.subject, candidate.question_summary, candidate.mistake_summary, candidate.cause, candidate.suggested_fix]
      .some((value) => /言语|逻辑填空|片段|语句|成语|词语/.test(value))
  ).length;
  const summary = renderWeeklyReviewMarkdown({
    completed,
    total,
    actualMinutes,
    hardCount,
    confirmedCount: confirmedErrors.length,
    topSubjects,
    topCauses,
    verbalCount,
    pdfReviewCount,
    buckets: {
      wrong: bucketCount("错"),
      unsure: bucketCount("纠结"),
      slow: bucketCount("耗时"),
      lowAccuracy: bucketCount("低准确率"),
    },
  });
  const now = nowIso();

  if (existing) {
    db.prepare(
      `UPDATE study_reviews
       SET summary = ?, stats_json = ?, updated_at = ?
       WHERE id = ?`
    ).run(summary, JSON.stringify(stats), now, existing.id);
    const row = db.prepare("SELECT * FROM study_reviews WHERE id = ?").get(existing.id) as StudyReviewRow;
    return reviewToOut(row);
  }

  const reviewId = id("review");
  db.prepare(
    `INSERT INTO study_reviews
       (id, scope, period_start, period_end, summary, stats_json, created_at, updated_at)
     VALUES (?, 'weekly', ?, ?, ?, ?, ?, ?)`
  ).run(reviewId, payload.week_start, payload.week_end, summary, JSON.stringify(stats), now, now);
  const row = db.prepare("SELECT * FROM study_reviews WHERE id = ?").get(reviewId) as StudyReviewRow;
  return reviewToOut(row);
}

export function getWeeklyReview(weekStart: string): StudyReviewOut | null {
  const row = db.prepare(
    "SELECT * FROM study_reviews WHERE scope = 'weekly' AND period_start = ?"
  ).get(weekStart) as StudyReviewRow | undefined;
  return row ? reviewToOut(row) : null;
}
