import { Router, Request, Response } from "express";
import {
  ErrorCandidateGenerateRequest,
  ErrorCandidatePatchRequest,
  LearningArtifactRequest,
  WeeklyReviewRequest,
} from "../types.js";
import {
  createLearningArtifact,
  createWeeklyReview,
  FeedbackError,
  generateErrorCandidate,
  getDailyFeedback,
  getWeeklyReview,
  listErrorCandidates,
  updateErrorCandidate,
} from "../services/feedback-service.js";
import { toAppDateString } from "../services/date-utils.js";

const router = Router();

// POST /api/feedback/artifacts
router.post("/artifacts", (req: Request, res: Response) => {
  const parsed = LearningArtifactRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    res.json({ artifact: createLearningArtifact(parsed.data) });
  } catch (exc) {
    if (exc instanceof FeedbackError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

// POST /api/feedback/candidates/generate
router.post("/candidates/generate", (req: Request, res: Response) => {
  const parsed = ErrorCandidateGenerateRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    res.json({ candidate: generateErrorCandidate(parsed.data) });
  } catch (exc) {
    if (exc instanceof FeedbackError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

// GET /api/feedback/candidates?status=pending
router.get("/candidates", (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json({ candidates: listErrorCandidates(status) });
});

// PATCH /api/feedback/candidates/:candidateId
router.patch("/candidates/:candidateId", (req: Request, res: Response) => {
  const candidateId = req.params.candidateId as string;
  const parsed = ErrorCandidatePatchRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    res.json({ candidate: updateErrorCandidate(candidateId, parsed.data) });
  } catch (exc) {
    if (exc instanceof FeedbackError) {
      res.status(404).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

// GET /api/feedback/daily?date=YYYY-MM-DD
router.get("/daily", (req: Request, res: Response) => {
  const date = typeof req.query.date === "string" ? req.query.date : toAppDateString();
  res.json(getDailyFeedback(date));
});

// POST /api/feedback/weekly
router.post("/weekly", (req: Request, res: Response) => {
  const parsed = WeeklyReviewRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  res.json({ review: createWeeklyReview(parsed.data) });
});

// GET /api/feedback/weekly?week_start=YYYY-MM-DD
router.get("/weekly", (req: Request, res: Response) => {
  const weekStart = typeof req.query.week_start === "string" ? req.query.week_start : "";
  if (!weekStart) {
    res.status(400).json({ detail: "week_start is required" });
    return;
  }
  res.json({ review: getWeeklyReview(weekStart) });
});

export default router;
