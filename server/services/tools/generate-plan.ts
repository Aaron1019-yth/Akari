import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "../../db.js";
import { getActiveGoal, buildPlanCard } from "../planner-service.js";
import { recalculateProfile } from "../profile-service.js";
import { syncActivePlanDocument } from "../plan-document-service.js";
import type { ToolDef, ToolResult } from "../llm-types.js";
import type {
  DailyTaskRow,
  GoalRow,
  ModuleRow,
  WeeklyPlanRow,
} from "../../types.js";

// ── Constants ──

const TRACKS = [
  ["xingce", "行测", 100, ["言语理解与表达", "资料分析", "判断推理", "数量关系", "常识判断"]],
  ["shenlun", "申论", 50, ["归纳概括", "综合分析", "提出对策", "贯彻执行", "申论作文"]],
  ["interview", "面试", 0, ["结构化表达", "政策理解", "现场应变"]],
] as const;

// ── Helpers ──

function genId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const d2 = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${d2}`;
}

function monday(day: Date): Date {
  const d = new Date(day);
  const dow = d.getDay(); // 0=Sun, 1=Mon
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Zod validation (mirrors Python GeneratedPlan) ──

const GeneratedTaskSchema = z.object({
  title: z.string().min(1).max(40),
  type: z.enum(["study", "practice", "review", "mock_exam", "essay"]),
  subject: z.string().min(1),
  time_slot: z.enum(["morning", "afternoon", "evening"]),
  date: z.string(),
  module_id: z.string().nullable().optional(),
});

const GeneratedPlanSchema = z.object({
  week_start: z.string(),
  tasks: z.array(GeneratedTaskSchema).min(1).max(35),
});

type GeneratedPlan = z.infer<typeof GeneratedPlanSchema>;

// ── Validation ──

export function validateGeneratedPlan(
  params: Record<string, unknown>
): { plan: GeneratedPlan | null; error: string | null } {
  const result = GeneratedPlanSchema.safeParse(params);
  if (result.success) {
    return { plan: result.data, error: null };
  }
  const errors = result.error.errors.map(
    (err) => `${err.path.join(".")}: ${err.message}`
  );
  return { plan: null, error: errors.join("; ") };
}

// ── Subject normalization ──

function normalizeSubject(subject: string): string {
  const mapping: Record<string, string> = {
    "言语理解": "言语理解与表达",
    "申论": "申论作文",
  };
  return mapping[subject] || subject;
}

// ── Ensure goal exists (mirrors Python _ensure_goal) ──

function ensureGoal(): GoalRow {
  const existing = getActiveGoal();
  if (existing) return existing;

  const examDate = new Date();
  examDate.setDate(examDate.getDate() + 150);
  const now = new Date().toISOString();

  const goalId = genId("goal");
  db.prepare(
    `INSERT INTO goals (id, title, description, target_score, current_estimated_score, exam_date, created_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    goalId,
    "Akari 公考备考计划",
    "由对话教练生成的第一阶段学习计划。",
    150,
    0,
    toDateStr(examDate),
    now,
    "active",
  );

  for (let trackIndex = 0; trackIndex < TRACKS.length; trackIndex++) {
    const [trackType, title, targetScore, moduleNames] = TRACKS[trackIndex];
    const trackId = genId("track");

    db.prepare(
      `INSERT INTO tracks (id, goal_id, type, title, target_score, current_score, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(trackId, goalId, trackType, title, targetScore, 0, trackIndex);

    for (let moduleIndex = 0; moduleIndex < moduleNames.length; moduleIndex++) {
      const name = moduleNames[moduleIndex];
      const moduleId = genId("module");
      db.prepare(
        `INSERT INTO modules (id, track_id, name, sort_order, weight, correct_rate, total_questions, proficiency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        moduleId,
        trackId,
        name,
        moduleIndex,
        Math.round((1 / moduleNames.length) * 10000) / 10000,
        0,
        0,
        0.45,
      );
    }
  }

  recalculateProfile(goalId);

  return db.prepare("SELECT * FROM goals WHERE id = ?").get(goalId) as GoalRow;
}

// ── Generate plan (mirrors Python _generate_plan) ──

function generatePlan(weekStart: string, tasks: Record<string, unknown>[]): ToolResult {
  const { plan, error } = validateGeneratedPlan({ week_start: weekStart, tasks });
  if (error || !plan) {
    return {
      content: `generate_plan 参数校验失败: ${error}`,
      ok: false,
    };
  }

  try {
    const writePlan = db.transaction(() => {
      const goal = ensureGoal();

      // Load all modules for this goal
      const allModules = db.prepare(
        `SELECT m.* FROM modules m
         JOIN tracks t ON m.track_id = t.id
         WHERE t.goal_id = ?`,
      ).all(goal.id) as ModuleRow[];

      const weekEnd = new Date(plan.week_start + "T00:00:00");
      weekEnd.setDate(weekEnd.getDate() + 6);
      const weekEndStr = toDateStr(weekEnd);

      // Delete old plans for same week_start (FK → delete tasks first if needed)
      const oldPlans = db.prepare(
        "SELECT * FROM weekly_plans WHERE goal_id = ? AND week_start = ?",
      ).all(goal.id, plan.week_start) as WeeklyPlanRow[];
      for (const old of oldPlans) {
        db.prepare("DELETE FROM daily_tasks WHERE weekly_plan_id = ?").run(old.id);
        db.prepare("DELETE FROM weekly_plans WHERE id = ?").run(old.id);
      }

      // Create weekly plan
      const weekId = genId("week");
      const focusAreas = [...new Set(plan.tasks.map((t) => t.subject))].sort();
      db.prepare(
        `INSERT INTO weekly_plans (id, goal_id, week_start, week_end, focus_areas_json, target_correct_rate, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        weekId,
        goal.id,
        plan.week_start,
        weekEndStr,
        JSON.stringify(focusAreas),
        0.72,
        "由 Akari 对话教练生成的本周计划。",
      );

      // Create tasks
      for (let index = 0; index < plan.tasks.length; index++) {
        const task = plan.tasks[index];

        // Module resolution: try module_id first, then name match, then first module
        let module: ModuleRow | undefined;
        if (task.module_id) {
          module = db.prepare("SELECT * FROM modules WHERE id = ?").get(
            task.module_id,
          ) as ModuleRow | undefined;
        }
        if (!module) {
          module = allModules.find(
            (m) => m.name === task.subject || task.subject.includes(m.name),
          );
        }
        if (!module && allModules.length > 0) {
          module = allModules[0];
        }
        if (!module) {
          throw new Error("无法找到对应模块，计划生成失败。");
        }

        const taskId = genId("task");
        const questionCount =
          task.type === "practice" || task.type === "mock_exam" ? 25 : 0;

        db.prepare(
          `INSERT INTO daily_tasks
             (id, weekly_plan_id, module_id, date, title, type, subject,
              question_count, actual_minutes, time_slot, status, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          taskId,
          weekId,
          module.id,
          task.date,
          task.title,
          task.type,
          task.subject,
          questionCount,
          0,
          task.time_slot,
          "pending",
          index,
        );
      }
    });

    writePlan();
    syncActivePlanDocument();

    const card = buildPlanCard();
    return {
      content: `已生成 ${plan.tasks.length} 个任务。`,
      details: { plan_card: card },
      ok: true,
    };
  } catch (exc) {
    return {
      content: `计划生成失败: ${exc instanceof Error ? exc.message : String(exc)}`,
      ok: false,
    };
  }
}

// ── Diagnostic → Plan (mirrors Python generate_plan_from_diagnostic) ──

interface DiagnosticFields {
  weak_modules?: string[];
  daily_hours?: number | string;
}

function tasksFromDiagnostic(
  fields: DiagnosticFields,
  weekStart: Date
): Record<string, unknown>[] {
  const weakModules = fields.weak_modules || ["资料分析", "言语理解与表达"];
  const normalizedWeak = weakModules.map(normalizeSubject);
  const dailyHours = Number(fields.daily_hours || 2);

  let slots: string[];

  if (dailyHours < 2) {
    slots = ["evening"];
  } else if (dailyHours < 4) {
    slots = ["afternoon", "evening"];
  } else {
    slots = ["morning", "afternoon", "evening"];
  }

  const tasks: Record<string, unknown>[] = [];

  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + offset);
    const dayStr = toDateStr(day);

    const primary = normalizedWeak[offset % normalizedWeak.length];

    // Primary practice task
    tasks.push({
      title: `${primary}专项训练`,
      type: "practice",
      subject: primary,
      time_slot: slots[0],
      date: dayStr,
    });

    // Review task (if 2+ slots)
    if (slots.length >= 2) {
      const reviewSubject =
        normalizedWeak[(offset + 1) % normalizedWeak.length];
      tasks.push({
        title: `${reviewSubject}错题复盘`,
        type: "review",
        subject: reviewSubject,
        time_slot: slots[1],
        date: dayStr,
      });
    }

    // Essay study (if 3 slots, every other day)
    if (slots.length >= 3 && offset % 2 === 0) {
      tasks.push({
        title: "申论素材积累",
        type: "study",
        subject: "申论作文",
        time_slot: slots[2],
        date: dayStr,
      });
    }
  }

  return tasks;
}

export function generatePlanFromDiagnostic(
  fields: DiagnosticFields
): ToolResult {
  const weekStart = monday(new Date());
  const tasks = tasksFromDiagnostic(fields, weekStart);
  return generatePlan(toDateStr(weekStart), tasks);
}

// ── Factory ──

export function createGeneratePlanTool(): ToolDef {
  return {
    name: "generate_plan",
    description:
      "根据已确认用户信息生成每日计划并写入数据库。仅在所有必填信息完整且用户明确要计划后调用。",
    parameters: {
      type: "object",
      properties: {
        week_start: {
          type: "string",
          description: "YYYY-MM-DD",
        },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              type: {
                type: "string",
                enum: ["study", "practice", "review", "mock_exam", "essay"],
              },
              subject: { type: "string" },
              time_slot: {
                type: "string",
                enum: ["morning", "afternoon", "evening"],
              },
              date: {
                type: "string",
                description: "YYYY-MM-DD",
              },
              module_id: { type: "string" },
            },
            required: [
              "title",
              "type",
              "subject",
              "time_slot",
              "date",
            ],
          },
        },
      },
      required: ["week_start", "tasks"],
    },
    execute: async (params) =>
      generatePlan(
        params.week_start as string,
        params.tasks as Record<string, unknown>[]
      ),
  };
}
