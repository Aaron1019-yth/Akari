import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { getActiveGoal } from "../services/planner-service.js";
import { serializeProfile } from "../services/profile-service.js";
import type { StudentProfileRow } from "../types.js";

const router = Router();

// GET /api/profile
router.get("/", (_req: Request, res: Response) => {
  const goal = getActiveGoal();
  if (!goal) {
    res.status(404).json({ detail: "Profile not found" });
    return;
  }
  const profileRow = db
    .prepare("SELECT * FROM student_profiles WHERE goal_id = ?")
    .get(goal.id) as StudentProfileRow | undefined;

  if (!profileRow) {
    res.status(404).json({ detail: "Profile not found" });
    return;
  }
  res.json(serializeProfile(profileRow));
});

export default router;
