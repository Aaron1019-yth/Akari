import fs from "fs";
import path from "path";
import { db } from "../db.js";
import { buildGoalTree, getActiveGoal } from "./planner-service.js";
import { deleteFile, getWorkspacePath, writeFile } from "./workspace-service.js";
import { toAppDateString } from "./date-utils.js";
import type { GoalRow, PlanVersionSummaryOut } from "../types.js";
import type { DailyTask, GoalTree, TaskStatus, TimeSlot } from "../../shared/exam-schema.js";

const SLOT_LABEL: Record<TimeSlot, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "待开始",
  in_progress: "进行中",
  completed: "已完成",
  skipped: "已跳过",
};

export class PlanDocumentError extends Error {}

export class ActivePlanDeleteError extends Error {}

function escapeCell(value: string | number): string {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function taskLine(task: DailyTask): string {
  const status = STATUS_LABEL[task.status] ?? task.status;
  const slot = SLOT_LABEL[task.time_slot] ?? task.time_slot;
  const actual = task.actual_minutes ? `${task.actual_minutes}` : "";
  return `| ${escapeCell(task.date)} | ${escapeCell(slot)} | ${escapeCell(task.title)} | ${escapeCell(task.subject)} | ${escapeCell(task.type)} | ${escapeCell(actual)} | ${escapeCell(status)} |`;
}

function groupTasksByDate(tasks: DailyTask[]): Map<string, DailyTask[]> {
  const map = new Map<string, DailyTask[]>();
  for (const task of tasks) {
    map.set(task.date, [...(map.get(task.date) ?? []), task]);
  }
  return map;
}

export function renderPlanMarkdown(goal: GoalTree): string {
  const plan = goal.weekly_plan;
  const lines: string[] = [
    "# Akari 当前计划",
    "",
    `> Last synced: ${new Date().toISOString()}`,
    "",
    "## 目标",
    "",
    `- ID：${goal.id}`,
    `- 标题：${goal.title}`,
    `- 描述：${goal.description || "无"}`,
    `- 目标分数：${goal.target_score}`,
    `- 当前估分：${goal.current_estimated_score}`,
    `- 考试日期：${goal.exam_date}`,
    `- 计划状态：${goal.status}`,
    "",
  ];

  if (!plan) {
    lines.push("## 本周计划", "", "当前目标还没有本周计划。", "");
    return lines.join("\n");
  }

  const completed = plan.tasks.filter((task) => task.status === "completed").length;
  const actualMinutes = plan.tasks.reduce((sum, task) => sum + (task.actual_minutes || 0), 0);

  lines.push(
    "## 本周计划",
    "",
    `- 周期：${plan.week_start} 至 ${plan.week_end}`,
    `- 重点：${plan.focus_areas.join("、") || "无"}`,
    `- 目标正确率：${Math.round(plan.target_correct_rate * 100)}%`,
    `- 完成进度：${completed}/${plan.tasks.length}`,
    `- 已记录学习：${actualMinutes} 分钟`,
    "",
    plan.summary,
    "",
    "## 每日任务",
    "",
  );

  const tasksByDate = groupTasksByDate(plan.tasks);
  for (const [date, tasks] of tasksByDate) {
    lines.push(`### ${date}`, "");
    lines.push("| 日期 | 时段 | 任务 | 科目 | 类型 | 实际分钟 | 状态 |");
    lines.push("|---|---|---|---|---:|---:|---|");
    for (const task of tasks) {
      lines.push(taskLine(task));
    }
    lines.push("");
  }

  lines.push(
    "## 手动编辑说明",
    "",
    "- 这份 Markdown 是当前数据库计划的可读同步文件。",
    "- 现阶段从数据库单向同步到 Markdown；直接编辑本文件暂不会自动回写任务表。",
    "- 后续会加入 Markdown 导入/回写与计划版本管理。",
    "",
  );

  return lines.join("\n");
}

function writeHistoryPlanDocument(goal: GoalRow): string {
  const tree = buildGoalTree(goal);
  const content = renderPlanMarkdown(tree);
  const documentPath = planDocumentPath(tree.id);
  writeFile(documentPath, content);
  return documentPath;
}

function deleteHistoryPlanDocuments(goalId: string): string[] {
  const historyDir = path.join(getWorkspacePath(), "plans", "history");
  let names: string[];
  try {
    names = fs.readdirSync(historyDir);
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT") return [];
    throw err;
  }

  const deleted: string[] = [];
  for (const name of names) {
    if (!name.endsWith(`-${goalId}.md`)) continue;
    const documentPath = `plans/history/${name}`;
    deleteFile(documentPath);
    deleted.push(documentPath);
  }
  return deleted;
}

export function syncActivePlanDocument(): string | null {
  const goal = getActiveGoal();
  if (!goal) return null;
  const tree = buildGoalTree(goal);
  const content = renderPlanMarkdown(tree);
  writeFile("plans/current-plan.md", content);
  writeFile(`plans/history/${toAppDateString()}-${tree.id}.md`, content);
  return "plans/current-plan.md";
}

export function planDocumentPath(goalId: string): string {
  return `plans/history/${toAppDateString()}-${goalId}.md`;
}

export function listPlanVersions(): PlanVersionSummaryOut[] {
  const rows = db.prepare(
    `SELECT
       g.id AS goal_id,
       g.title AS title,
       g.status AS status,
       g.created_at AS created_at,
       g.exam_date AS exam_date,
       wp.week_start AS week_start,
       wp.week_end AS week_end,
       COUNT(dt.id) AS task_count,
       SUM(CASE WHEN dt.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
       COALESCE(SUM(dt.actual_minutes), 0) AS actual_minutes
     FROM goals g
     LEFT JOIN weekly_plans wp ON wp.goal_id = g.id
     LEFT JOIN daily_tasks dt ON dt.weekly_plan_id = wp.id
     GROUP BY g.id, wp.id
     ORDER BY
       CASE g.status WHEN 'active' THEN 0 ELSE 1 END,
       g.created_at DESC,
       wp.week_start DESC`
  ).all() as Array<{
    goal_id: string;
    title: string;
    status: string;
    created_at: string;
    exam_date: string;
    week_start: string | null;
    week_end: string | null;
    task_count: number;
    completed_count: number;
    actual_minutes: number;
  }>;

  return rows.map((row) => ({
    goal_id: row.goal_id,
    title: row.title,
    status: row.status as PlanVersionSummaryOut["status"],
    created_at: row.created_at,
    exam_date: row.exam_date,
    week_start: row.week_start,
    week_end: row.week_end,
    task_count: row.task_count,
    completed_count: row.completed_count,
    actual_minutes: row.actual_minutes,
    document_path: row.status === "active" ? "plans/current-plan.md" : planDocumentPath(row.goal_id),
  }));
}

export function restorePlanVersion(goalId: string): GoalTree {
  const goal = db.prepare("SELECT * FROM goals WHERE id = ?").get(goalId) as GoalRow | undefined;
  if (!goal) throw new PlanDocumentError("Plan version not found");

  db.transaction(() => {
    db.prepare("UPDATE goals SET status = 'archived' WHERE status = 'active' AND id <> ?").run(goalId);
    db.prepare("UPDATE goals SET status = 'active' WHERE id = ?").run(goalId);
  })();

  syncActivePlanDocument();
  const active = getActiveGoal();
  if (!active) throw new PlanDocumentError("Active goal not found after restore");
  return buildGoalTree(active);
}

export function archivePlanVersion(goalId: string): { goal: GoalTree | null; documentPath: string } {
  const goal = db.prepare("SELECT * FROM goals WHERE id = ?").get(goalId) as GoalRow | undefined;
  if (!goal) throw new PlanDocumentError("Plan version not found");
  if (goal.status !== "active") throw new PlanDocumentError("Only active plan can be archived");

  db.prepare("UPDATE goals SET status = 'archived' WHERE id = ?").run(goalId);
  const archivedGoal = db.prepare("SELECT * FROM goals WHERE id = ?").get(goalId) as GoalRow;
  const documentPath = writeHistoryPlanDocument(archivedGoal);
  const active = getActiveGoal();
  return { goal: active ? buildGoalTree(active) : null, documentPath };
}

export function deletePlanVersion(goalId: string): { deletedGoalId: string; deletedDocumentPaths: string[] } {
  const goal = db.prepare("SELECT * FROM goals WHERE id = ?").get(goalId) as GoalRow | undefined;
  if (!goal) throw new PlanDocumentError("Plan version not found");
  if (goal.status === "active") throw new ActivePlanDeleteError("Active plan cannot be deleted");

  const trackIds = (db.prepare("SELECT id FROM tracks WHERE goal_id = ?").all(goalId) as Array<{ id: string }>).map((row) => row.id);
  const moduleIds = trackIds.length
    ? (db.prepare(`SELECT id FROM modules WHERE track_id IN (${trackIds.map(() => "?").join(",")})`).all(...trackIds) as Array<{ id: string }>).map((row) => row.id)
    : [];
  const weekIds = (db.prepare("SELECT id FROM weekly_plans WHERE goal_id = ?").all(goalId) as Array<{ id: string }>).map((row) => row.id);
  const taskIds = weekIds.length
    ? (db.prepare(`SELECT id FROM daily_tasks WHERE weekly_plan_id IN (${weekIds.map(() => "?").join(",")})`).all(...weekIds) as Array<{ id: string }>).map((row) => row.id)
    : [];
  const artifactIds = taskIds.length
    ? (db.prepare(`SELECT id FROM learning_artifacts WHERE daily_task_id IN (${taskIds.map(() => "?").join(",")})`).all(...taskIds) as Array<{ id: string }>).map((row) => row.id)
    : [];

  db.transaction(() => {
    if (artifactIds.length) db.prepare(`DELETE FROM error_candidates WHERE artifact_id IN (${artifactIds.map(() => "?").join(",")})`).run(...artifactIds);
    if (taskIds.length) {
      const placeholders = taskIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM error_candidates WHERE daily_task_id IN (${placeholders})`).run(...taskIds);
      db.prepare(`DELETE FROM learning_artifacts WHERE daily_task_id IN (${placeholders})`).run(...taskIds);
      db.prepare(`DELETE FROM task_feedback WHERE daily_task_id IN (${placeholders})`).run(...taskIds);
    }
    if (moduleIds.length) {
      const placeholders = moduleIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM error_candidates WHERE module_id IN (${placeholders})`).run(...moduleIds);
      db.prepare(`DELETE FROM error_records WHERE module_id IN (${placeholders})`).run(...moduleIds);
      db.prepare(`DELETE FROM practice_sessions WHERE module_id IN (${placeholders})`).run(...moduleIds);
    }
    if (taskIds.length) db.prepare(`DELETE FROM daily_tasks WHERE id IN (${taskIds.map(() => "?").join(",")})`).run(...taskIds);
    if (weekIds.length) db.prepare(`DELETE FROM weekly_plans WHERE id IN (${weekIds.map(() => "?").join(",")})`).run(...weekIds);
    db.prepare("DELETE FROM student_profiles WHERE goal_id = ?").run(goalId);
    if (moduleIds.length) db.prepare(`DELETE FROM modules WHERE id IN (${moduleIds.map(() => "?").join(",")})`).run(...moduleIds);
    if (trackIds.length) db.prepare(`DELETE FROM tracks WHERE id IN (${trackIds.map(() => "?").join(",")})`).run(...trackIds);
    db.prepare("DELETE FROM goals WHERE id = ?").run(goalId);
  })();

  return { deletedGoalId: goalId, deletedDocumentPaths: deleteHistoryPlanDocuments(goalId) };
}
