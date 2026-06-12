import { Router, Request, Response } from "express";
import { upload } from "./multer.js";
import {
  ensureWorkspace,
  getWorkspacePath,
  listTree,
  readFile,
  writeFile,
  deleteFile,
  renameFile,
  saveUpload,
  WorkspaceError,
} from "../services/workspace-service.js";

const router = Router();

// GET /api/workspace/tree?dir=.
router.get("/tree", (_req: Request, res: Response) => {
  const dir = (typeof _req.query.dir === "string" ? _req.query.dir : "").trim();
  try {
    ensureWorkspace();
    const tree = listTree(dir);
    res.json({ tree, workspace_path: getWorkspacePath() });
  } catch (exc) {
    res.status(500).json({ detail: exc instanceof Error ? exc.message : "读取文件树失败" });
  }
});

// GET /api/workspace/file?path=rel
router.get("/file", async (req: Request, res: Response) => {
  const p = typeof req.query.path === "string" ? req.query.path : "";
  if (!p) {
    res.status(400).json({ detail: "path 参数必填" });
    return;
  }
  try {
    const result = await readFile(p);
    res.json(result);
  } catch (exc) {
    if (exc instanceof WorkspaceError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: exc instanceof Error ? exc.message : "读取失败" });
    }
  }
});

// POST /api/workspace/file
router.post("/file", (req: Request, res: Response) => {
  const { path: filePath, content } = req.body as { path?: string; content?: string };
  if (!filePath || content === undefined) {
    res.status(400).json({ detail: "path 和 content 必填" });
    return;
  }
  try {
    writeFile(filePath, content);
    const tree = listTree();
    res.json({ ok: true, tree, workspace_path: getWorkspacePath() });
  } catch (exc) {
    if (exc instanceof WorkspaceError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: exc instanceof Error ? exc.message : "写入失败" });
    }
  }
});

// POST /api/workspace/upload
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ detail: "No file provided" });
    return;
  }
  try {
    const target = typeof req.body?.target === "string" ? req.body.target : undefined;
    if (target && target !== "review") {
      res.status(400).json({ detail: "Invalid upload target" });
      return;
    }
    const stored = saveUpload(req.file.originalname, req.file.buffer, target);
    const tree = listTree();
    res.json({ file: stored, tree, workspace_path: getWorkspacePath() });
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : "Upload failed";
    res.status(400).json({ detail: msg });
  }
});

// DELETE /api/workspace/file?path=rel
router.delete("/file", (req: Request, res: Response) => {
  const p = typeof req.query.path === "string" ? req.query.path : "";
  if (!p) {
    res.status(400).json({ detail: "path 参数必填" });
    return;
  }
  try {
    deleteFile(p);
    const tree = listTree();
    res.json({ ok: true, tree, workspace_path: getWorkspacePath() });
  } catch (exc) {
    if (exc instanceof WorkspaceError) {
      res.status(404).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: exc instanceof Error ? exc.message : "删除失败" });
    }
  }
});

// PATCH /api/workspace/file
router.patch("/file", (req: Request, res: Response) => {
  const { old_path, new_path } = req.body as { old_path?: string; new_path?: string };
  if (!old_path || !new_path) {
    res.status(400).json({ detail: "old_path 和 new_path 必填" });
    return;
  }
  try {
    renameFile(old_path, new_path);
    const tree = listTree();
    res.json({ ok: true, tree, workspace_path: getWorkspacePath() });
  } catch (exc) {
    if (exc instanceof WorkspaceError) {
      res.status(400).json({ detail: exc.message });
    } else {
      res.status(500).json({ detail: exc instanceof Error ? exc.message : "重命名失败" });
    }
  }
});

// GET /api/workspace/info
router.get("/info", (_req: Request, res: Response) => {
  res.json({ workspace_path: getWorkspacePath() });
});

export default router;
