import { randomUUID } from "crypto";
import { db } from "../db.js";
import type {
  GoalRow,
  TrackRow,
  ModuleRow,
  WeeklyPlanRow,
  DailyTaskRow,
  StudentProfileRow,
  GeneratePlanRequest,
  TaskPatchRequest,
  TaskCreateRequest,
  GoalTree,
  PlanCardPayload,
  TrackOut,
  ModuleOut,
  WeeklyPlanOut,
  DailyTaskOut,
} from "../types.js";
import { serializeProfile } from "./profile-service.js";

// ── Constants ──

const TRACKS = [
  ["xingce", "行测", 100, ["言语理解与表达", "资料分析", "判断推理", "数量关系", "常识判断"]],
  ["shenlun", "申论", 50, ["归纳概括", "综合分析", "提出对策", "贯彻执行", "申论作文"]],
  ["interview", "面试", 0, ["结构化表达", "政策理解", "现场应变"]],
] as const;

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

// ── Date helpers ──

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const d2 = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${d2}`;
}

function weekBounds(day: Date): { start: string; end: string } {
  const start = new Date(day);
  start.setDate(start.getDate() - start.getDay() + (start.getDay() === 0 ? -6 : 1)); // Monday
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toDateStr(start), end: toDateStr(end) };
}

function parseDate(str: string): Date {
  return new Date(str + "T00:00:00");
}

// ── JSON helpers ──

function parseJsonList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Query helpers ──

function queryGoal(goalId: string): GoalRow | undefined {
  return db.prepare("SELECT * FROM goals WHERE id = ?").get(goalId) as GoalRow | undefined;
}

function queryTracks(goalId: string): TrackRow[] {
  return db.prepare(
    "SELECT * FROM tracks WHERE goal_id = ? ORDER BY sort_order"
  ).all(goalId) as TrackRow[];
}

function queryModules(trackId: string): ModuleRow[] {
  return db.prepare(
    "SELECT * FROM modules WHERE track_id = ? ORDER BY sort_order"
  ).all(trackId) as ModuleRow[];
}

function queryWeeklyPlan(
  goalId: string,
  weekStart: string,
  weekEnd: string
): WeeklyPlanRow | undefined {
  return db.prepare(
    "SELECT * FROM weekly_plans WHERE goal_id = ? AND week_start <= ? AND week_end >= ? LIMIT 1"
  ).get(goalId, weekStart, weekEnd) as WeeklyPlanRow | undefined;
}

function queryTasks(weeklyPlanId: string): DailyTaskRow[] {
  return db.prepare(
    `SELECT * FROM daily_tasks
     WHERE weekly_plan_id = ?
     ORDER BY date,
       CASE time_slot WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'evening' THEN 2 END,
       sort_order`
  ).all(weeklyPlanId) as DailyTaskRow[];
}

function queryProfile(goalId: string): StudentProfileRow | undefined {
  return db.prepare(
    "SELECT * FROM student_profiles WHERE goal_id = ?"
  ).get(goalId) as StudentProfileRow | undefined;
}

function dailyTaskToOut(task: DailyTaskRow): DailyTaskOut {
  return task as DailyTaskOut;
}

// ── Public API ──

/** Return the active goal, or undefined if none. */
export function getActiveGoal(): GoalRow | undefined {
  return db.prepare(
    "SELECT * FROM goals WHERE status = 'active' LIMIT 1"
  ).get() as GoalRow | undefined;
}

/** Assemble the full nested goal tree (tracks → modules → weekly plan → tasks → profile). */
export function buildGoalTree(goal: GoalRow): GoalTree {
  const today = new Date();
  const { start, end } = weekBounds(today);

  // Tracks with nested modules
  const trackRows = queryTracks(goal.id);
  const tracks: TrackOut[] = trackRows.map((track) => {
    const moduleRows = queryModules(track.id);
    const modules: ModuleOut[] = moduleRows.map((m) => ({ ...m }));
    return {
      id: track.id,
      goal_id: track.goal_id,
      type: track.type as TrackOut["type"],
      title: track.title,
      target_score: track.target_score,
      current_score: track.current_score,
      sort_order: track.sort_order,
      modules,
    };
  });

  // Current week's plan
  const weeklyPlanRow = queryWeeklyPlan(goal.id, start, end);
  let weeklyPlan: WeeklyPlanOut | null = null;
  if (weeklyPlanRow) {
    const taskRows = queryTasks(weeklyPlanRow.id);
    weeklyPlan = {
      id: weeklyPlanRow.id,
      goal_id: weeklyPlanRow.goal_id,
      week_start: weeklyPlanRow.week_start,
      week_end: weeklyPlanRow.week_end,
      focus_areas: parseJsonList(weeklyPlanRow.focus_areas_json),
      target_correct_rate: weeklyPlanRow.target_correct_rate,
      summary: weeklyPlanRow.summary,
      tasks: taskRows.map(dailyTaskToOut),
    };
  }

  const profileRow = queryProfile(goal.id);
  const profile = serializeProfile(profileRow);

  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    target_score: goal.target_score,
    current_estimated_score: goal.current_estimated_score,
    exam_date: goal.exam_date,
    created_at: goal.created_at,
    status: goal.status as GoalTree["status"],
    tracks,
    weekly_plan: weeklyPlan,
    profile,
  };
}

/** Return a summary card for the current plan (or empty state if no plan). */
export function buildPlanCard(): PlanCardPayload {
  const goal = getActiveGoal();
  if (!goal) {
    return {
      has_plan: false,
      title: "暂无计划",
      message: "告诉我你的目标，我来帮你制定第一周计划。",
      tasks_today: [],
      completion_rate: 0,
    };
  }

  const tree = buildGoalTree(goal);
  const plan = tree.weekly_plan;
  if (!plan) {
    return {
      has_plan: false,
      title: goal.title,
      message: "当前目标还没有本周计划。",
      tasks_today: [],
      completion_rate: 0,
    };
  }

  const today = toDateStr(new Date());
  const tasks = plan.tasks;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const todayTasks = tasks.filter((t) => t.date === today);

  return {
    has_plan: true,
    title: goal.title,
    week_start: plan.week_start,
    week_end: plan.week_end,
    completed_count: completed,
    total_count: tasks.length,
    completion_rate: Math.round((completed / Math.max(tasks.length, 1)) * 100),
    tasks_today: todayTasks,
  };
}

/** Generate a new plan: archive old active goal, create goal/tracks/modules/Week1/profile. */
export function generateInitialPlan(payload: GeneratePlanRequest): GoalTree {
  const now = new Date().toISOString(); // UTC datetime for created_at / last_updated
  const todayStr = toDateStr(new Date());

  const goalRow = db.transaction(() => {
    // Archive any existing active goal
    const existing = db.prepare(
      "SELECT * FROM goals WHERE status = 'active' LIMIT 1"
    ).get() as GoalRow | undefined;
    if (existing) {
      db.prepare("UPDATE goals SET status = 'archived' WHERE id = ?").run(existing.id);
    }

    // ── Goal ──
    const goalId = id("goal");
    db.prepare(
      `INSERT INTO goals (id, title, description, target_score, current_estimated_score, exam_date, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      goalId,
      "Akari 公考备考计划",
      "以行测和申论为主线的第一阶段学习计划。",
      payload.target_score,
      0,
      payload.exam_date,
      now,
      "active",
    );

    // ── Tracks + Modules ──
    const moduleByName: Record<string, ModuleRow> = {};

    for (let trackIndex = 0; trackIndex < TRACKS.length; trackIndex++) {
      const [trackType, title, targetScore, moduleNames] = TRACKS[trackIndex];
      const trackId = id("track");

      db.prepare(
        `INSERT INTO tracks (id, goal_id, type, title, target_score, current_score, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(trackId, goalId, trackType, title, targetScore, 0, trackIndex);

      for (let moduleIndex = 0; moduleIndex < moduleNames.length; moduleIndex++) {
        const name = moduleNames[moduleIndex];
        const moduleId = id("module");
        const proficiency = payload.weaknesses.includes(name) ? 0.35 : 0.55;

        const mod: ModuleRow = {
          id: moduleId,
          track_id: trackId,
          name,
          sort_order: moduleIndex,
          weight: Math.round((1 / moduleNames.length) * 10000) / 10000,
          correct_rate: 0,
          total_questions: 0,
          proficiency,
        };

        db.prepare(
          `INSERT INTO modules (id, track_id, name, sort_order, weight, correct_rate, total_questions, proficiency)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          mod.id,
          mod.track_id,
          mod.name,
          mod.sort_order,
          mod.weight,
          mod.correct_rate,
          mod.total_questions,
          mod.proficiency,
        );

        moduleByName[name] = mod;
      }
    }

    // ── Week 1 plan ──
    const { start: weekStart, end: weekEnd } = weekBounds(new Date());
    const focus = payload.weaknesses.length > 0
      ? payload.weaknesses
      : ["资料分析", "言语理解与表达"];

    const weekId = id("week");
    db.prepare(
      `INSERT INTO weekly_plans (id, goal_id, week_start, week_end, focus_areas_json, target_correct_rate, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      weekId,
      goalId,
      weekStart,
      weekEnd,
      JSON.stringify(focus),
      0.72,
      "第一周先建立节奏：每天一组行测练习，穿插申论素材和复盘。",
    );

    // ── Daily tasks (7 days, cycled through weakness modules) ──
    const primaryModules: ModuleRow[] = [];
    for (const name of focus) {
      const m = moduleByName[name];
      if (m) primaryModules.push(m);
    }
    const fallbackModules = [
      moduleByName["资料分析"],
      moduleByName["言语理解与表达"],
      moduleByName["判断推理"],
    ].filter(Boolean) as ModuleRow[];
    const planModules = primaryModules.length > 0 ? primaryModules : fallbackModules;
    const slots = ["morning", "afternoon", "evening"];

    for (let offset = 0; offset < 7; offset++) {
      const mod = planModules[offset % planModules.length];
      const taskDate = parseDate(weekStart);
      taskDate.setDate(taskDate.getDate() + offset);

      db.prepare(
        `INSERT INTO daily_tasks
           (id, weekly_plan_id, module_id, date, title, type, subject,
            question_count, estimated_minutes, actual_minutes, time_slot, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id("task"),
        weekId,
        mod.id,
        toDateStr(taskDate),
        `${mod.name}专项训练`,
        "practice",
        mod.name,
        mod.name !== "申论作文" ? 25 : 1,
        mod.name !== "申论作文" ? 35 : 60,
        0,
        slots[offset % slots.length],
        "pending",
        offset,
      );
    }

    // ── Student profile ──
    const allModules = Object.values(moduleByName);
    const proficiencies: Record<string, number> = {};
    for (const mod of allModules) {
      proficiencies[mod.id] = mod.proficiency;
    }

    const profileId = `profile_${randomUUID().replace(/-/g, "")}`;
    db.prepare(
      `INSERT INTO student_profiles
         (id, goal_id, strengths_json, weaknesses_json, module_proficiencies_json,
          preferred_time_slots_json, avg_daily_study_minutes, learning_style, last_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      profileId,
      goalId,
      JSON.stringify(payload.strengths),
      JSON.stringify(payload.weaknesses),
      JSON.stringify(proficiencies),
      "[]",
      0,
      "steady",
      now,
    );

    // Reload goal row (matches Python db.refresh)
    return queryGoal(goalId)!;
  })();

  return buildGoalTree(goalRow);
}

/** Return all tasks for a given ISO date string (YYYY-MM-DD), sorted by time_slot then sort_order. */
export function getTasksForDate(day: string): DailyTaskRow[] {
  return db.prepare(
    `SELECT * FROM daily_tasks
     WHERE date = ?
     ORDER BY
       CASE time_slot WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'evening' THEN 2 END,
       sort_order`
  ).all(day) as DailyTaskRow[];
}

/** Patch only the non-undefined fields on a task. */
export function updateTask(taskId: string, payload: TaskPatchRequest): void {
  const fieldMap: [string, unknown][] = [
    ["status", payload.status],
    ["actual_minutes", payload.actual_minutes],
    ["time_slot", payload.time_slot],
    ["sort_order", payload.sort_order],
    ["title", payload.title],
    ["type", payload.type],
    ["subject", payload.subject],
    ["estimated_minutes", payload.estimated_minutes],
    ["date", payload.date],
  ];

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [col, val] of fieldMap) {
    if (val !== undefined) {
      setClauses.push(`${col} = ?`);
      values.push(val);
    }
  }

  if (setClauses.length === 0) return;

  values.push(taskId);
  db.prepare(
    `UPDATE daily_tasks SET ${setClauses.join(", ")} WHERE id = ?`
  ).run(...values);
}

/** Delete a task by id. Throws if no task was found. */
export function deleteTask(taskId: string): void {
  const result = db.prepare("DELETE FROM daily_tasks WHERE id = ?").run(taskId);
  if (result.changes === 0) {
    throw new Error("Task not found");
  }
}

/** Create a new task for the given goal, auto-creating a weekly plan if needed. */
export function createTask(goal: GoalRow, payload: TaskCreateRequest): DailyTaskRow {
  const taskDateStr = payload.date || toDateStr(new Date());
  const taskDate = parseDate(taskDateStr);
  const { start, end } = weekBounds(taskDate);

  return db.transaction(() => {
    // Find or create weekly plan covering this task's date
    let weeklyPlan = db.prepare(
      "SELECT * FROM weekly_plans WHERE goal_id = ? AND week_start <= ? AND week_end >= ? LIMIT 1"
    ).get(goal.id, start, end) as WeeklyPlanRow | undefined;

    if (!weeklyPlan) {
      const weekId = id("week");
      db.prepare(
        `INSERT INTO weekly_plans (id, goal_id, week_start, week_end, focus_areas_json, target_correct_rate, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(weekId, goal.id, start, end, "[]", 0.72, "手动添加的本周计划。");
      weeklyPlan = db.prepare("SELECT * FROM weekly_plans WHERE id = ?").get(weekId) as WeeklyPlanRow;
    }

    // Find module: by module_id first, then by subject name, then first module
    const allModules = db.prepare(
      `SELECT m.* FROM modules m
       JOIN tracks t ON m.track_id = t.id
       WHERE t.goal_id = ?`
    ).all(goal.id) as ModuleRow[];

    let module: ModuleRow | undefined;
    if (payload.module_id) {
      module = db.prepare("SELECT * FROM modules WHERE id = ?").get(payload.module_id) as ModuleRow | undefined;
    }
    if (!module) {
      module = allModules.find((m) => m.name === payload.subject);
    }
    if (!module && allModules.length > 0) {
      module = allModules[0];
    }

    if (!module) {
      throw new Error("No modules found for goal");
    }

    // Compute sort_order: max + 1 for same date
    const maxRow = db.prepare(
      "SELECT MAX(sort_order) AS max_order FROM daily_tasks WHERE weekly_plan_id = ? AND date = ?"
    ).get(weeklyPlan.id, taskDateStr) as { max_order: number | null } | undefined;
    const maxOrder = maxRow?.max_order ?? -1;

    const taskId = id("task");
    db.prepare(
      `INSERT INTO daily_tasks
         (id, weekly_plan_id, module_id, date, title, type, subject,
          question_count, estimated_minutes, actual_minutes, time_slot, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      taskId,
      weeklyPlan.id,
      module.id,
      taskDateStr,
      payload.title,
      payload.type,
      payload.subject,
      payload.question_count,
      payload.estimated_minutes,
      0,
      payload.time_slot,
      "pending",
      maxOrder + 1,
    );

    return db.prepare("SELECT * FROM daily_tasks WHERE id = ?").get(taskId) as DailyTaskRow;
  })();
}

/** Create next week's plan (starting 7 days from today), focused on weak modules. */
export function adaptNextWeek(goal: GoalRow): void {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 7);
  const { start: nextStart, end: nextEnd } = weekBounds(nextDate);

  db.transaction(() => {
    const allModules = db.prepare(
      `SELECT m.* FROM modules m
       JOIN tracks t ON m.track_id = t.id
       WHERE t.goal_id = ?`
    ).all(goal.id) as ModuleRow[];

    const weakModules = allModules.filter((m) => m.correct_rate < 0.72);
    const focusModules =
      weakModules.length > 0 ? weakModules.slice(0, 3) : allModules.slice(0, 3);

    const weekId = id("week");
    db.prepare(
      `INSERT INTO weekly_plans (id, goal_id, week_start, week_end, focus_areas_json, target_correct_rate, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      weekId,
      goal.id,
      nextStart,
      nextEnd,
      JSON.stringify(focusModules.map((m) => m.name)),
      0.74,
      "根据最近表现自动增加薄弱模块任务密度。",
    );

    const slots = ["morning", "afternoon", "evening"];
    for (let offset = 0; offset < 7; offset++) {
      const mod = focusModules[offset % focusModules.length];
      const taskDate = parseDate(nextStart);
      taskDate.setDate(taskDate.getDate() + offset);

      db.prepare(
        `INSERT INTO daily_tasks
           (id, weekly_plan_id, module_id, date, title, type, subject,
            question_count, estimated_minutes, actual_minutes, time_slot, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id("task"),
        weekId,
        mod.id,
        toDateStr(taskDate),
        `${mod.name}巩固训练`,
        "practice",
        mod.name,
        30,
        40,
        0,
        slots[offset % 3],
        "pending",
        offset,
      );
    }
  })();
}
