import { Router, Request, Response } from "express";
import { upload } from "./multer.js";
import {
  listFiles,
  saveUpload,
  deleteFile,
  renameFile,
} from "../services/files-service.js";

const router = Router();

// POST /api/files/upload
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ detail: "No file provided" });
    return;
  }
  try {
    const stored = saveUpload({
      originalname: req.file.originalname,
      buffer: req.file.buffer,
    });
    res.json(stored);
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : "Upload failed";
    if (msg.includes("10MB")) {
      res.status(413).json({ detail: msg });
    } else {
      res.status(400).json({ detail: msg });
    }
  }
});

// GET /api/files
router.get("/", (_req: Request, res: Response) => {
  res.json({ files: listFiles() });
});

// DELETE /api/files/:fileId
router.delete("/:fileId", (req: Request, res: Response) => {
  const fileId = req.params.fileId as string;
  const ok = deleteFile(fileId);
  if (!ok) {
    res.status(404).json({ detail: "File not found" });
    return;
  }
  res.json({ ok: true });
});

// PATCH /api/files/:fileId
router.patch("/:fileId", (req: Request, res: Response) => {
  const fileId = req.params.fileId as string;
  const { filename } = req.body as { filename?: string };
  if (!filename) {
    res.status(400).json({ detail: "filename is required" });
    return;
  }
  const result = renameFile(fileId, filename);
  if (!result) {
    res.status(404).json({ detail: "File not found" });
    return;
  }
  res.json(result);
});

export default router;
