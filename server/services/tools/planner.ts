import { db } from "../../db.js";
import {
  getActiveGoal,
  buildGoalTree,
  getTasksForDate,
  createTask,
  updateTask,
} from "../planner-service.js";
import type { ToolDef, ToolResult } from "../llm-types.js";
import type {
  DailyTaskRow,
  GoalRow,
  ModuleRow,
  TaskCreateRequest,
  TaskPatchRequest,
  TrackRow,
} from "../../types.js";

// ── Helpers ──

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const d2 = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${d2}`;
}

function formatTask(task: DailyTaskRow): string {
  const slot: Record<string, string> = {
    morning: "上午",
    afternoon: "下午",
    evening: "晚上",
  };
  const status: Record<string, string> = {
    pending: "待开始",
    in_progress: "进行中",
    completed: "已完成",
    skipped: "已跳过",
  };
  const slotLabel = slot[task.time_slot] || task.time_slot;
  const statusLabel = status[task.status] || task.status;
  const actual = task.actual_minutes ? ` 实际${task.actual_minutes}分钟` : "";
  return `- [${statusLabel}] ${task.title} (${slotLabel} 预计${task.estimated_minutes}分钟${actual}) [${task.id}]`;
}

// ── Tool Implementations ──

function getPlannerContext(): ToolResult {
  const goal = getActiveGoal();
  if (!goal) {
    return {
      content: "当前没有活跃的备考目标。引导用户生成第一周计划。",
      details: { goal: null },
      ok: true,
    };
  }

  const tree = buildGoalTree(goal);
  const tasks = tree.weekly_plan?.tasks ?? [];
  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;

  const todayStr = toDateStr(new Date());
  const examDate = new Date(goal.exam_date + "T00:00:00");
  const todayDate = new Date(todayStr + "T00:00:00");
  const daysLeft = Math.max(0, Math.floor((examDate.getTime() - todayDate.getTime()) / 86400000));

  const weak: { name: string; correct_rate: number }[] = [];
  for (const track of tree.tracks) {
    for (const mod of track.modules) {
      if (mod.correct_rate < 0.6) {
        weak.push({ name: mod.name, correct_rate: mod.correct_rate });
      }
    }
  }
  const weakStr =
    weak.length > 0
      ? weak.map((m) => `${m.name}(${Math.round(m.correct_rate * 100)}%)`).join(", ")
      : "无";

  const completionPct = Math.round((completed / Math.max(total, 1)) * 100);
  const content =
    `当前备考状态:\n` +
    `目标: ${goal.title} | 目标分数: ${goal.target_score}分 | 考试: ${goal.exam_date} | 剩余 ${daysLeft} 天\n` +
    `本周: ${completed}/${total} 完成 (${completionPct}%)\n` +
    `薄弱模块: ${weakStr}`;

  return {
    content,
    details: { goal_id: goal.id, days_left: daysLeft },
    ok: true,
  };
}

function getTodayTasks(dateParam?: string): ToolResult {
  const day = dateParam || toDateStr(new Date());
  const tasks = getTasksForDate(day);

  if (tasks.length === 0) {
    return {
      content: `${day} 暂无任务。`,
      details: { date: day, tasks: [] },
      ok: true,
    };
  }

  const lines = [`${day} 任务（共${tasks.length}项）:`];
  for (const t of tasks) {
    lines.push(formatTask(t));
  }

  return {
    content: lines.join("\n"),
    details: { date: day, tasks: tasks.map((t) => t.id) },
    ok: true,
  };
}

function getWeekTasks(weekStart: string): ToolResult {
  const startDate = new Date(weekStart + "T00:00:00");
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  const endStr = toDateStr(endDate);

  const tasks = db
    .prepare(
      `SELECT * FROM daily_tasks
       WHERE date >= ? AND date <= ?
       ORDER BY date,
         CASE time_slot WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'evening' THEN 2 END,
         sort_order`
    )
    .all(weekStart, endStr) as DailyTaskRow[];

  if (tasks.length === 0) {
    return {
      content: `${weekStart} 周暂无任务。`,
      details: { week_start: weekStart, tasks: [] },
      ok: true,
    };
  }

  const byDay: Record<string, DailyTaskRow[]> = {};
  for (const t of tasks) {
    if (!byDay[t.date]) byDay[t.date] = [];
    byDay[t.date].push(t);
  }

  const lines = [`${weekStart} ~ ${endStr} 周任务:`];
  for (const [dayStr, dayTasks] of Object.entries(byDay)) {
    lines.push(`\n${dayStr}:`);
    for (const t of dayTasks) {
      lines.push(formatTask(t));
    }
  }

  return {
    content: lines.join("\n"),
    details: { week_start: weekStart },
    ok: true,
  };
}

function createTaskTool(
  title: string,
  taskDate: string,
  timeSlot: string = "morning",
  subject: string = "综合",
  estimatedMinutes: number = 60
): ToolResult {
  try {
    const goal = getActiveGoal();
    if (!goal) {
      return {
        content: "没有活跃的备考目标，无法创建任务。请先生成计划。",
        ok: false,
      };
    }

    const payload: TaskCreateRequest = {
      title: title.slice(0, 15),
      type: "practice",
      subject,
      estimated_minutes: estimatedMinutes,
      time_slot: timeSlot as TaskCreateRequest["time_slot"],
      date: taskDate,
      question_count: 0,
    };

    const task = createTask(goal, payload);
    return {
      content: `已创建: ${task.title} (${task.date} ${task.time_slot}) [${task.id}]`,
      details: { task_id: task.id },
      ok: true,
    };
  } catch (exc) {
    return {
      content: `创建失败: ${exc instanceof Error ? exc.message : String(exc)}`,
      ok: false,
    };
  }
}

function updateTaskTool(
  taskId: string,
  status?: string,
  actualMinutes?: number,
  timeSlot?: string
): ToolResult {
  try {
    const task = db
      .prepare("SELECT * FROM daily_tasks WHERE id = ?")
      .get(taskId) as DailyTaskRow | undefined;

    if (!task) {
      return {
        content: `任务 ${taskId} 未找到。`,
        ok: false,
      };
    }

    const payload: TaskPatchRequest = {};
    if (status !== undefined && status !== null) payload.status = status as TaskPatchRequest["status"];
    if (actualMinutes !== undefined && actualMinutes !== null) payload.actual_minutes = actualMinutes;
    if (timeSlot !== undefined && timeSlot !== null) payload.time_slot = timeSlot as TaskPatchRequest["time_slot"];

    updateTask(taskId, payload);

    // Reload to get updated status
    const updated = db
      .prepare("SELECT * FROM daily_tasks WHERE id = ?")
      .get(taskId) as DailyTaskRow;

    return {
      content: `已更新: ${updated.title} (状态:${updated.status}) [${updated.id}]`,
      details: { task_id: updated.id, status: updated.status },
      ok: true,
    };
  } catch (exc) {
    return {
      content: `更新失败: ${exc instanceof Error ? exc.message : String(exc)}`,
      ok: false,
    };
  }
}

function getModuleStats(): ToolResult {
  const goal = getActiveGoal();
  if (!goal) {
    return {
      content: "无活跃目标。",
      details: { modules: [] },
      ok: true,
    };
  }

  const trackRows = db
    .prepare("SELECT * FROM tracks WHERE goal_id = ? ORDER BY sort_order")
    .all(goal.id) as TrackRow[];

  const allModules: ModuleRow[] = [];
  for (const track of trackRows) {
    const modules = db
      .prepare("SELECT * FROM modules WHERE track_id = ? ORDER BY sort_order")
      .all(track.id) as ModuleRow[];
    allModules.push(...modules);
  }

  if (allModules.length === 0) {
    return {
      content: "暂无模块数据。",
      details: { modules: [] },
      ok: true,
    };
  }

  allModules.sort((a, b) => a.correct_rate - b.correct_rate);

  const lines = ["模块统计:"];
  for (const m of allModules) {
    const icon = m.correct_rate >= 0.7 ? "🟢" : m.correct_rate >= 0.5 ? "🟡" : "🔴";
    lines.push(
      `  ${icon} ${m.name}: 正确率${Math.round(m.correct_rate * 100)}% | 熟练度${Math.round(m.proficiency * 100)}% | ${m.total_questions}题`
    );
  }

  return {
    content: lines.join("\n"),
    details: {
      modules: allModules.map((m) => ({ name: m.name, correct_rate: m.correct_rate })),
    },
    ok: true,
  };
}

// ── Factory ──

export function createPlannerTools(): ToolDef[] {
  return [
    {
      name: "get_planner_context",
      description:
        "获取当前备考全局上下文：目标、考试日期、剩余天数、科目、薄弱模块、本周进度。WHEN 用户问整体进度、备考状态、复习规划。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      execute: async () => getPlannerContext(),
    },
    {
      name: "get_today_tasks",
      description:
        "获取今日/指定日期任务列表，含完成状态和实际用时。WHEN 用户问今天学了什么、还有什么任务。",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD，默认今天" },
        },
        required: [],
      },
      execute: async (params) => getTodayTasks(params.date as string | undefined),
    },
    {
      name: "get_week_tasks",
      description: "获取本周任务，按天分组。WHEN 用户问本周安排、周进度。",
      parameters: {
        type: "object",
        properties: {
          week_start: { type: "string", description: "周一日期 YYYY-MM-DD" },
        },
        required: ["week_start"],
      },
      execute: async (params) => getWeekTasks(params.week_start as string),
    },
    {
      name: "create_task",
      description:
        "在当前计划中创建新任务。WHEN 用户说加任务、明天想学xxx、帮我安排。创建前先检查该时段是否已有任务。",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "任务标题，≤15字" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time_slot: {
            type: "string",
            enum: ["morning", "afternoon", "evening"],
          },
          subject: { type: "string", description: "科目" },
          estimated_minutes: {
            type: "integer",
            description: "预计分钟，默认60",
          },
        },
        required: ["title", "date"],
      },
      execute: async (params) =>
        createTaskTool(
          params.title as string,
          params.date as string,
          (params.time_slot as string) || "morning",
          (params.subject as string) || "综合",
          (params.estimated_minutes as number) ?? 60
        ),
    },
    {
      name: "update_task",
      description:
        "更新任务状态/实际用时/时段。WHEN 用户说完成/跳过/改用时/调整时段。需要 task_id。",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "任务ID，从中括号 [id] 获取" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed", "skipped"],
          },
          actual_minutes: {
            type: "integer",
            description: "实际用时（分钟）",
          },
          time_slot: {
            type: "string",
            enum: ["morning", "afternoon", "evening"],
          },
        },
        required: ["task_id"],
      },
      execute: async (params) =>
        updateTaskTool(
          params.task_id as string,
          params.status as string | undefined,
          params.actual_minutes as number | undefined,
          params.time_slot as string | undefined
        ),
    },
    {
      name: "get_module_stats",
      description:
        "获取各模块正确率/熟练度/题目数统计。WHEN 用户问哪个模块弱、正确率、薄弱项。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      execute: async () => getModuleStats(),
    },
  ];
}
