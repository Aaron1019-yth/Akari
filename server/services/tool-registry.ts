import type { ToolDef } from "./llm-types.js";

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool);
  }

  schemas(): object[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  async execute(
    name: string,
    params: Record<string, unknown>,
  ): Promise<{ content: string; details?: Record<string, unknown>; ok: boolean }> {
    const tool = this.tools.get(name);
    if (!tool) return { content: `Unknown tool: ${name}`, ok: false };
    try {
      return await tool.execute(params);
    } catch (err: unknown) {
      return {
        content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
        ok: false,
      };
    }
  }
}
