import { Router, Request, Response } from "express";
import { listSessions, getSessionMessages, deleteSession } from "../services/chat-service.js";
import { clearSessionState } from "../services/intent.js";

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

function removeSession(req: Request, res: Response) {
  const sessionId = req.params.sessionId as string;
  deleteSession(sessionId);
  clearSessionState(sessionId);
  res.json({ ok: true });
}

// DELETE /api/sessions/:sessionId
router.delete("/:sessionId", removeSession);
router.post("/:sessionId/delete", removeSession);

export default router;
