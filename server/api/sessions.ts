import { Router, Request, Response } from "express";
import { listSessions, getSessionMessages } from "../services/chat-service.js";

const router = Router();

// GET /api/sessions
router.get("/", (_req: Request, res: Response) => {
  res.json({ sessions: listSessions() });
});

// GET /api/sessions/:sessionId
router.get("/:sessionId", (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const messages = getSessionMessages(sessionId);
  res.json({ session_id: sessionId, messages });
});

export default router;
