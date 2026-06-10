import fs from "fs";
import { getWorkspacePath, listTree } from "./workspace-service.js";
import { buildSystemPrompt } from "./agent-context.js";
import {
  appendMessage,
  loadRecentMessages,
  loadSummary,
  saveSummary,
  sessionPath,
} from "./chat-service.js";
import { chat, chatStream } from "./llm-client.js";
import type { Message, StreamChunk, TokenUsage, ToolCall } from "./llm-types.js";
import { ToolRegistry } from "./tool-registry.js";
import { createDocumentTools } from "./tools/document.js";
import { createGeneratePlanTool, validateGeneratedPlan } from "./tools/generate-plan.js";
import { createPlannerTools } from "./tools/planner.js";
import { createWebTools } from "./tools/web.js";

const MAX_ROUNDS = 8;
const SUMMARY_CHAR_THRESHOLD = 64000;

// ── Background summary (fire-and-forget) ──

function shouldSummarize(sessionId: string): boolean {
  const p = sessionPath(sessionId);
  try {
    return fs.existsSync(p) && fs.statSync(p).size > SUMMARY_CHAR_THRESHOLD;
  } catch {
    return false;
  }
}

function fireSummary(sessionId: string): void {
  if (shouldSummarize(sessionId)) {
    generateSummaryInBackground(sessionId).catch(() => {});
  }
}

async function generateSummaryInBackground(sessionId: string): Promise<void> {
  /* Fire-and-forget: summarize older messages for the next turn. Never raises. */
  try {
    const messages = loadRecentMessages(sessionId, 999, 1_000_000);
    if (messages.length === 0) return;

    const split = Math.floor(messages.length / 2);
    const old = messages.slice(0, split);
    if (old.length < 5) return;

    const existing = loadSummary(sessionId) || "";
    let prompt =
      "用中文简要总结以下对话的关键信息，保留：用户目标、计划要点、薄弱模块、已收集的诊断字段。" +
      "不超过 300 字。\n\n";
    if (existing) {
      prompt += `已有摘要：${existing}\n\n`;
    }
    prompt += old
      .slice(-20)
      .map(
        (m) =>
          `${m.role === "user" ? "用户" : "助手"}: ${(m.content || "").slice(0, 300)}`,
      )
      .join("\n");

    const summary = await chat([{ role: "user", content: prompt }]);
    if (summary) {
      saveSummary(sessionId, summary);
    }
  } catch {
    // Background task must never crash
  }
}

// ── File context builder ──

function buildFileContext(): string {
  const wp = getWorkspacePath();
  const tree = listTree("");
  if (tree.length === 0) return "";

  const lines = [
    "# 当前工作区文件",
    `工作区路径: ${wp}`,
  ];
  for (const node of tree.slice(0, 12)) {
    if (node.type === "directory") {
      lines.push(`- ${node.name}/ (目录)`);
      if (node.children) {
        for (const child of node.children.slice(0, 8)) {
          lines.push(`  - ${child.name}`);
        }
      }
    } else {
      lines.push(`- ${node.name}`);
    }
  }
  if (tree.length > 12) {
    lines.push(`... 还有 ${tree.length - 12} 个项目`);
  }
  return lines.join("\n");
}

// ── AgentLoop ──

export class AgentLoop {
  private _tools: ToolRegistry;

  constructor() {
    this._tools = new ToolRegistry();
    for (const t of [
      ...createPlannerTools(),
      ...createWebTools(),
      ...createDocumentTools(),
      createGeneratePlanTool(),
    ]) {
      this._tools.register(t);
    }
  }

  async *run(
    userMessage: string,
    sessionId: string = "default",
    routeContext: string = "",
    abortSignal?: AbortSignal,
  ): AsyncGenerator<Record<string, unknown>> {
    appendMessage(sessionId, "user", userMessage);

    // Build initial messages array
    const messages: Message[] = [
      { role: "system", content: buildSystemPrompt() },
    ];

    const recent = loadRecentMessages(sessionId);
    if (recent.length > 0) {
      // Exclude the just-appended user message (last entry)
      for (const m of recent.slice(0, -1)) {
        messages.push({ role: m.role as Message["role"], content: m.content });
      }
    }

    // Always inject existing summary (fast path — no LLM call)
    const existingSummary = loadSummary(sessionId);
    if (existingSummary) {
      messages.push({
        role: "system",
        content: `## 对话历史摘要\n${existingSummary}`,
      });
    }

    const fileContext = buildFileContext();
    if (fileContext) {
      messages.push({ role: "system", content: fileContext });
    }
    if (routeContext) {
      messages.push({ role: "system", content: routeContext });
    }
    messages.push({ role: "user", content: userMessage });

    const schemas = this._tools.schemas();
    let lastUsage: TokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    const visibleReplyParts: string[] = [];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (abortSignal?.aborted) {
        yield { type: "error", message: "已中断" };
        return;
      }

      const textParts: string[] = [];
      const toolCalls: ToolCall[] = [];

      let stream: AsyncGenerator<StreamChunk>;
      try {
        stream = chatStream(messages, schemas as Array<{ name: string; description: string; parameters: Record<string, unknown> }>);
      } catch (exc) {
        yield { type: "error", message: `LLM 调用失败: ${exc instanceof Error ? exc.message : String(exc)}` };
        return;
      }

      try {
        for await (const chunk of stream) {
          if (abortSignal?.aborted) {
            yield { type: "error", message: "已中断" };
            return;
          }

          if (chunk.type === "text_delta" && chunk.delta) {
            textParts.push(chunk.delta);
            visibleReplyParts.push(chunk.delta);
            yield { type: "text_delta", delta: chunk.delta };
          } else if (chunk.type === "tool_call" && chunk.call) {
            toolCalls.push(chunk.call);
          } else if (chunk.type === "done" && chunk.usage) {
            lastUsage = {
              prompt_tokens: chunk.usage.prompt_tokens,
              completion_tokens: chunk.usage.completion_tokens,
              total_tokens: chunk.usage.total_tokens,
            };
          }
        }
      } catch (exc) {
        yield { type: "error", message: `LLM 调用失败: ${exc instanceof Error ? exc.message : String(exc)}` };
        return;
      }

      if (toolCalls.length === 0) {
        appendMessage(sessionId, "assistant", visibleReplyParts.join(""));
        yield { type: "turn_end", usage: lastUsage };
        fireSummary(sessionId);
        return;
      }

      messages.push({
        role: "assistant",
        content: textParts.join("") || "",
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        if (abortSignal?.aborted) {
          return;
        }

        yield { type: "tool_start", name: tc.name, arguments: tc.arguments };

        if (tc.name === "generate_plan") {
          const { error: validationError } = validateGeneratedPlan(tc.arguments);
          if (validationError) {
            const content = `generate_plan 调用失败：${validationError}。请修正后重新调用。`;
            yield { type: "tool_end", name: tc.name, ok: false, summary: content.slice(0, 200) };
            messages.push({
              role: "tool",
              content,
              tool_call_id: tc.id,
              name: tc.name,
            });
            continue;
          }
        }

        const result = await this._tools.execute(tc.name, tc.arguments);
        yield {
          type: "tool_end",
          name: tc.name,
          ok: result.ok,
          summary: result.content.slice(0, 200),
        };

        if (tc.name === "generate_plan" && result.ok && result.details?.plan_card) {
          yield { type: "plan_card", card: result.details.plan_card };
        }

        messages.push({
          role: "tool",
          content: result.content,
          tool_call_id: tc.id,
          name: tc.name,
        });
      }
    }

    // Max rounds exhausted — save what we have
    appendMessage(sessionId, "assistant", visibleReplyParts.join(""));
    yield { type: "turn_end", usage: lastUsage };
    fireSummary(sessionId);
  }
}
