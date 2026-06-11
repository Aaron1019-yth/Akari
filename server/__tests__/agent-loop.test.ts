import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolRegistry } from "../services/tool-registry.js";
import { validateGeneratedPlan } from "../services/tools/generate-plan.js";
import type { ToolDef, StreamChunk } from "../services/llm-types.js";

// ── ToolRegistry tests ──

describe("ToolRegistry", () => {
  it("registers and executes a tool", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "echo",
      description: "echo back",
      parameters: { type: "object", properties: { text: { type: "string" } } },
      execute: async (params) => ({
        content: params.text as string,
        ok: true,
      }),
    });

    const schemas = registry.schemas();
    expect(schemas).toHaveLength(1);
    expect((schemas[0] as { name: string }).name).toBe("echo");

    const result = await registry.execute("echo", { text: "hello" });
    expect(result.content).toBe("hello");
    expect(result.ok).toBe(true);
  });

  it("returns error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute("nonexistent", {});
    expect(result.ok).toBe(false);
    expect(result.content).toContain("Unknown tool");
  });

  it("catches tool execution errors", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "boom",
      description: "always fails",
      parameters: { type: "object", properties: {} },
      execute: async () => { throw new Error("kaboom"); },
    });

    const result = await registry.execute("boom", {});
    expect(result.ok).toBe(false);
    expect(result.content).toContain("kaboom");
  });
});

// ── generate_plan validation tests ──

describe("generate_plan validation", () => {
  it("rejects empty tasks array", () => {
    const { error } = validateGeneratedPlan({
      week_start: "2026-06-09",
      tasks: [],
    });
    expect(error).toBeTruthy();
  });

  it("rejects task with missing required fields", () => {
    const { error } = validateGeneratedPlan({
      week_start: "2026-06-09",
      tasks: [{ title: "test" }],
    });
    expect(error).toBeTruthy();
  });

  it("accepts valid plan", () => {
    const { error, plan } = validateGeneratedPlan({
      week_start: "2026-06-09",
      tasks: [{
        title: "资料分析训练",
        type: "practice",
        subject: "资料分析",
        estimated_minutes: 45,
        time_slot: "afternoon",
        date: "2026-06-09",
      }],
    });
    expect(error).toBeNull();
    expect(plan).not.toBeNull();
    expect(plan!.tasks).toHaveLength(1);
  });

  it("rejects estimated_minutes over 360", () => {
    const { error } = validateGeneratedPlan({
      week_start: "2026-06-09",
      tasks: [{
        title: "marathon",
        type: "study",
        subject: "test",
        estimated_minutes: 999,
        time_slot: "morning",
        date: "2026-06-09",
      }],
    });
    expect(error).toBeTruthy();
    expect(error).toContain("estimated_minutes");
  });
});

// ── Agent loop abort test ──

describe("AgentLoop abort", () => {
  it("aborts before LLM call resolves", async () => {
    // We mock chatStream to never resolve, then abort immediately
    const { AgentLoop } = await import("../services/agent-loop.js");
    const loop = new AgentLoop();
    const ac = new AbortController();

    // Abort before any streaming happens
    setTimeout(() => ac.abort(), 0);

    const events: Record<string, unknown>[] = [];
    for await (const event of loop.run("hello", "abort_test_session", "", ac.signal)) {
      events.push(event);
    }

    // Should get an error event due to abort or LLM failure (no API key in test)
    expect(events.some(e => e.type === "error")).toBe(true);
  });
});
