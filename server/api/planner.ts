import { Router, Request, Response } from "express";
import {
  getActiveGoal,
  buildGoalTree,
  generateInitialPlan,
  getTasksForDate,
  updateTask,
  createTask,
  deleteTask,
  adaptNextWeek,
} from "../services/planner-service.js";
import {
  GeneratePlanRequest,
  TaskPatchRequest,
  TaskCreateRequest,
} from "../types.js";

const router = Router();

// GET /api/planner/goal
router.get("/goal", (_req: Request, res: Response) => {
  const goal = getActiveGoal();
  if (!goal) {
    res.json(null);
    return;
  }
  res.json(buildGoalTree(goal));
});

// POST /api/planner/generate
router.post("/generate", (req: Request, res: Response) => {
  const parsed = GeneratePlanRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  const tree = generateInitialPlan(parsed.data);
  res.json(tree);
});

// GET /api/planner/today
router.get("/today", (_req: Request, res: Response) => {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const tasks = getTasksForDate(dateStr);
  res.json({ date: dateStr, tasks });
});

// PATCH /api/planner/task/:taskId
router.patch("/task/:taskId", (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  const parsed = TaskPatchRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    updateTask(taskId, parsed.data);
  } catch {
    res.status(404).json({ detail: "Task not found" });
    return;
  }
  const goal = getActiveGoal();
  if (!goal) {
    res.status(404).json({ detail: "Active goal not found" });
    return;
  }
  res.json(buildGoalTree(goal));
});

// POST /api/planner/task
router.post("/task", (req: Request, res: Response) => {
  const parsed = TaskCreateRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  const goal = getActiveGoal();
  if (!goal) {
    res.status(404).json({ detail: "Active goal not found" });
    return;
  }
  try {
    createTask(goal, parsed.data);
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : "Create task failed" });
    return;
  }
  res.json(buildGoalTree(goal));
});

// DELETE /api/planner/task/:taskId
router.delete("/task/:taskId", (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  try {
    deleteTask(taskId);
  } catch {
    res.status(404).json({ detail: "Task not found" });
    return;
  }
  const goal = getActiveGoal();
  if (!goal) {
    res.status(404).json({ detail: "Active goal not found" });
    return;
  }
  res.json(buildGoalTree(goal));
});

// POST /api/planner/adapt
router.post("/adapt", (_req: Request, res: Response) => {
  const goal = getActiveGoal();
  if (!goal) {
    res.status(404).json({ detail: "Active goal not found" });
    return;
  }
  adaptNextWeek(goal);
  res.json(buildGoalTree(goal));
});

export default router;
