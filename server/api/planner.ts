import { Router, Request, Response } from "express";
import {
  getActiveGoal,
  buildGoalTree,
  generateInitialPlan,
  createManualPlan,
  updateActiveGoal,
  getTasksForDate,
  updateTask,
  createTask,
  deleteTask,
  adaptNextWeek,
} from "../services/planner-service.js";
import {
  GeneratePlanRequest,
  ManualPlanRequest,
  GoalPatchRequest,
  TaskPatchRequest,
  TaskCreateRequest,
  TaskFeedbackRequest,
} from "../types.js";
import { FeedbackError, saveTaskFeedback } from "../services/feedback-service.js";
import { toAppDateString } from "../services/date-utils.js";
import {
  ActivePlanDeleteError,
  archivePlanVersion,
  deletePlanVersion,
  listPlanVersions,
  PlanDocumentError,
  restorePlanVersion,
  syncActivePlanDocument,
} from "../services/plan-document-service.js";

const router = Router();

router.get("/goal", (_req: Request, res: Response) => {
  const goal = getActiveGoal();
  if (!goal) {
    res.json(null);
    return;
  }
  res.json(buildGoalTree(goal));
});

router.post("/generate", (req: Request, res: Response) => {
  const parsed = GeneratePlanRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  const tree = generateInitialPlan(parsed.data);
  syncActivePlanDocument();
  res.json(tree);
});

router.post("/manual", (req: Request, res: Response) => {
  const parsed = ManualPlanRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  const tree = createManualPlan(parsed.data);
  syncActivePlanDocument();
  res.json(tree);
});

router.patch("/goal", (req: Request, res: Response) => {
  const parsed = GoalPatchRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    const tree = updateActiveGoal(parsed.data);
    syncActivePlanDocument();
    res.json(tree);
  } catch {
    res.status(404).json({ detail: "Active goal not found" });
  }
});

router.get("/today", (_req: Request, res: Response) => {
  const dateStr = toAppDateString();
  const tasks = getTasksForDate(dateStr);
  res.json({ date: dateStr, tasks });
});

router.get("/versions", (_req: Request, res: Response) => {
  res.json({ versions: listPlanVersions() });
});

router.post("/versions/:goalId/restore", (req: Request, res: Response) => {
  const goalId = req.params.goalId as string;
  try {
    res.json({ goal: restorePlanVersion(goalId), document_path: "plans/current-plan.md" });
  } catch (exc) {
    if (exc instanceof PlanDocumentError) {
      res.status(404).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

router.post("/versions/:goalId/archive", (req: Request, res: Response) => {
  const goalId = req.params.goalId as string;
  try {
    const result = archivePlanVersion(goalId);
    res.json({ goal: result.goal, versions: listPlanVersions(), document_path: result.documentPath });
  } catch (exc) {
    if (exc instanceof PlanDocumentError) {
      res.status(404).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

router.delete("/versions/:goalId", (req: Request, res: Response) => {
  const goalId = req.params.goalId as string;
  try {
    const result = deletePlanVersion(goalId);
    res.json({ ok: true, deleted_goal_id: result.deletedGoalId, deleted_document_paths: result.deletedDocumentPaths, versions: listPlanVersions() });
  } catch (exc) {
    if (exc instanceof ActivePlanDeleteError) {
      res.status(409).json({ detail: exc.message });
    } else if (exc instanceof PlanDocumentError) {
      res.status(404).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

router.post("/document/sync", (_req: Request, res: Response) => {
  const path = syncActivePlanDocument();
  if (!path) {
    res.status(404).json({ detail: "Active goal not found" });
    return;
  }
  res.json({ document_path: path });
});

router.patch("/task/:taskId", (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  const parsed = TaskPatchRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    updateTask(taskId, parsed.data);
    syncActivePlanDocument();
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

router.patch("/task/:taskId/feedback", (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  const parsed = TaskFeedbackRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    const result = saveTaskFeedback(taskId, parsed.data);
    res.json(result);
  } catch (exc) {
    if (exc instanceof FeedbackError) {
      res.status(404).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

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
    syncActivePlanDocument();
  } catch (err) {
    res.status(400).json({ detail: err instanceof Error ? err.message : "Create task failed" });
    return;
  }
  res.json(buildGoalTree(goal));
});

router.delete("/task/:taskId", (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  try {
    deleteTask(taskId);
    syncActivePlanDocument();
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

router.post("/adapt", (_req: Request, res: Response) => {
  const goal = getActiveGoal();
  if (!goal) {
    res.status(404).json({ detail: "Active goal not found" });
    return;
  }
  adaptNextWeek(goal);
  syncActivePlanDocument();
  res.json(buildGoalTree(goal));
});

export default router;
