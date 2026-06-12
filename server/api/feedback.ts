import { Router, Request, Response } from "express";
import {
  ErrorCandidateExtractRequest,
  ErrorCandidateGenerateRequest,
  ErrorCandidatePatchRequest,
  LearningArtifactRequest,
  PdfReviewAnalyzeRequest,
  WeeklyReviewRequest,
} from "../types.js";
import {
  analyzePdfReviewArtifact,
  createLearningArtifact,
  createWeeklyReview,
  extractErrorCandidates,
  FeedbackError,
  generateErrorCandidate,
  getDailyFeedback,
  getWeeklyReview,
  listErrorCandidates,
  updateErrorCandidate,
  writeDailyReviewDocument,
} from "../services/feedback-service.js";
import { toAppDateString } from "../services/date-utils.js";

const router = Router();

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

router.post("/artifacts/analyze-pdf-review", async (req: Request, res: Response) => {
  const parsed = PdfReviewAnalyzeRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    res.json(await analyzePdfReviewArtifact(parsed.data));
  } catch (exc) {
    if (exc instanceof FeedbackError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

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

router.post("/candidates/extract", async (req: Request, res: Response) => {
  const parsed = ErrorCandidateExtractRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    res.json(await extractErrorCandidates(parsed.data));
  } catch (exc) {
    if (exc instanceof FeedbackError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

router.get("/candidates", (req: Request, res: Response) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json({ candidates: listErrorCandidates(status) });
});

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

router.get("/daily", (req: Request, res: Response) => {
  const date = typeof req.query.date === "string" ? req.query.date : toAppDateString();
  res.json(getDailyFeedback(date));
});

router.post("/daily/document", (req: Request, res: Response) => {
  const date = typeof req.body?.date === "string" ? req.body.date : toAppDateString();
  try {
    const result = writeDailyReviewDocument(date);
    res.json(result);
  } catch (exc) {
    if (exc instanceof FeedbackError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

router.post("/weekly", (req: Request, res: Response) => {
  const parsed = WeeklyReviewRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  try {
    res.json({ review: createWeeklyReview(parsed.data) });
  } catch (exc) {
    if (exc instanceof FeedbackError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: "Internal error" });
    }
  }
});

router.get("/weekly", (req: Request, res: Response) => {
  const weekStart = typeof req.query.week_start === "string" ? req.query.week_start : "";
  if (!weekStart) {
    res.status(400).json({ detail: "week_start is required" });
    return;
  }
  res.json({ review: getWeeklyReview(weekStart) });
});

export default router;
