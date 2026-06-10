import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { initDatabase } from "../db.js";
import { ensureWorkspace, getWorkspacePath, listTree, writeFile, readFile, deleteFile, renameFile } from "../services/workspace-service.js";

const testDir = path.join(os.tmpdir(), `akari-workspace-test-${Date.now()}`);

import { getSettings, saveSettings } from "../services/settings-service.js";

beforeAll(() => {
  initDatabase();
  const s = getSettings();
  saveSettings({ ...s, workspacePath: testDir });
  ensureWorkspace();
});

afterAll(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("workspace-service", () => {
  it("getWorkspacePath returns configured path", () => {
    expect(getWorkspacePath()).toBe(testDir);
  });

  it("ensureWorkspace creates directory", () => {
    const wp = ensureWorkspace();
    expect(fs.existsSync(wp)).toBe(true);
  });

  it("listTree returns empty for new workspace", () => {
    const tree = listTree();
    expect(Array.isArray(tree)).toBe(true);
  });

  it("writeFile and readFile roundtrip", async () => {
    writeFile("test.md", "# Hello\nWorld");
    const result = await readFile("test.md");
    expect(result.content).toBe("# Hello\nWorld");
    expect(result.mime).toBe("text/markdown");
  });

  it("writeFile creates parent directories", () => {
    writeFile("notes/2024/plan.md", "# Plan");
    expect(fs.existsSync(path.join(testDir, "notes", "2024", "plan.md"))).toBe(true);
  });

  it("listTree reflects file structure", () => {
    const tree = listTree();
    expect(tree.length).toBeGreaterThan(0);
  });

  it("deleteFile removes file", () => {
    writeFile("to-delete.txt", "delete me");
    deleteFile("to-delete.txt");
    expect(fs.existsSync(path.join(testDir, "to-delete.txt"))).toBe(false);
  });

  it("renameFile renames file", () => {
    writeFile("old-name.txt", "content");
    renameFile("old-name.txt", "new-name.txt");
    expect(fs.existsSync(path.join(testDir, "new-name.txt"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "old-name.txt"))).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(() => writeFile("../outside.txt", "x")).toThrow();
  });

  it("rejects absolute paths outside workspace", () => {
    expect(() => writeFile("/etc/passwd", "x")).toThrow();
  });
});
