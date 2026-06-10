import { Router, Request, Response } from "express";
import { PracticeSessionRequest, ErrorBatchRequest } from "../types.js";
import { createPracticeSession, createErrorBatch, PracticeError } from "../services/practice-service.js";

const router = Router();

// POST /api/practice/session
router.post("/practice/session", (req: Request, res: Response) => {
  const parsed = PracticeSessionRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    const result = createPracticeSession(parsed.data);
    res.json(result);
  } catch (exc) {
    if (exc instanceof PracticeError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

// POST /api/errors/batch
router.post("/errors/batch", (req: Request, res: Response) => {
  const parsed = ErrorBatchRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    const result = createErrorBatch(parsed.data);
    res.json(result);
  } catch (exc) {
    if (exc instanceof PracticeError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

export default router;
