import { describe, it, expect } from "vitest";

// ── SSRF protection tests (unit tests on internal logic) ──
// We test isPrivateIP logic by importing the web tools module and testing
// the web_fetch tool with various URLs.

describe("web_fetch SSRF protection", () => {
  it("rejects localhost", async () => {
    const { createWebTools } = await import("../services/tools/web.js");
    const tools = createWebTools();
    const fetchTool = tools.find((t) => t.name === "web_fetch")!;

    const result = await fetchTool.execute({ url: "http://localhost:3000/api" });
    expect(result.ok).toBe(false);
    expect(result.content).toContain("内网");
  });

  it("rejects 127.0.0.1", async () => {
    const { createWebTools } = await import("../services/tools/web.js");
    const tools = createWebTools();
    const fetchTool = tools.find((t) => t.name === "web_fetch")!;

    const result = await fetchTool.execute({ url: "http://127.0.0.1:3000/api" });
    expect(result.ok).toBe(false);
    expect(result.content).toContain("内网");
  });

  it("rejects 192.168.x.x", async () => {
    const { createWebTools } = await import("../services/tools/web.js");
    const tools = createWebTools();
    const fetchTool = tools.find((t) => t.name === "web_fetch")!;

    const result = await fetchTool.execute({ url: "http://192.168.1.1/admin" });
    expect(result.ok).toBe(false);
    expect(result.content).toContain("内网");
  });

  it("rejects 10.x.x.x", async () => {
    const { createWebTools } = await import("../services/tools/web.js");
    const tools = createWebTools();
    const fetchTool = tools.find((t) => t.name === "web_fetch")!;

    const result = await fetchTool.execute({ url: "http://10.0.0.1/internal" });
    expect(result.ok).toBe(false);
  });

  it("rejects 172.16.x.x (private range)", async () => {
    const { createWebTools } = await import("../services/tools/web.js");
    const tools = createWebTools();
    const fetchTool = tools.find((t) => t.name === "web_fetch")!;

    const result = await fetchTool.execute({ url: "http://172.16.0.1/secret" });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid URL", async () => {
    const { createWebTools } = await import("../services/tools/web.js");
    const tools = createWebTools();
    const fetchTool = tools.find((t) => t.name === "web_fetch")!;

    const result = await fetchTool.execute({ url: "not-a-url" });
    expect(result.ok).toBe(false);
    expect(result.content).toContain("http");
  });

  it("rejects ftp protocol", async () => {
    const { createWebTools } = await import("../services/tools/web.js");
    const tools = createWebTools();
    const fetchTool = tools.find((t) => t.name === "web_fetch")!;

    const result = await fetchTool.execute({ url: "ftp://example.com/file" });
    expect(result.ok).toBe(false);
  });
});

describe("web_search fallback", () => {
  it("returns failure when no providers configured", async () => {
    const { createWebTools } = await import("../services/tools/web.js");
    const tools = createWebTools();
    const searchTool = tools.find((t) => t.name === "web_search")!;

    // Without any API keys configured, should return ok: false
    const result = await searchTool.execute({ query: "test query" });
    expect(result.ok).toBe(false);
    expect(result.content).toContain("搜索");
  });
});
