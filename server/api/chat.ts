import { Router, Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { ChatRequest } from "../types.js";
import { chat } from "../services/llm-client.js";
import type { Message } from "../services/llm-types.js";
import { AgentLoop } from "../services/agent-loop.js";
import { IntentClassifier, Intent, clearSessionState } from "../services/intent.js";
import { appendMessage } from "../services/chat-service.js";
import { listTree, ensureWorkspace } from "../services/workspace-service.js";
import { buildPlanCard } from "../services/planner-service.js";
import { generatePlanFromDiagnostic } from "../services/tools/generate-plan.js";

const router = Router();

// ── Helpers ──

function getWorkspaceFileTree() {
  ensureWorkspace();
  return listTree();
}

// ── Legacy non-streaming POST ──

router.post("/", async (req: Request, res: Response) => {
  const parsed = ChatRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.errors });
    return;
  }
  const { message, session_id } = parsed.data;

  const systemPrompt = "你是 Akari，一个公考备考助手。帮用户制定学习计划、跟踪进度、分析薄弱模块。回复简洁，不要客套。";

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  let reply: string;
  try {
    reply = await chat(messages);
  } catch (err) {
    res.status(500).json({ detail: err instanceof Error ? err.message : "LLM error" });
    return;
  }

  res.json({
    session_id: session_id || "default",
    message: {
      role: "assistant",
      content: reply,
      created_at: new Date().toISOString(),
    },
  });
});

// ── WebSocket streaming ──

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket) => {
    const agent = new AgentLoop();
    const classifier = new IntentClassifier();

    let abortController: AbortController | null = null;
    let currentTask: Promise<void> | null = null;

    async function runLoop(text: string, sessionId: string = "default", displayText = text): Promise<void> {
      const ac = new AbortController();
      abortController = ac;

      try {
        const decision = classifier.classify(text, sessionId);

        // ── QUERY_PLAN: return plan card immediately ──
        if (decision.intent === Intent.QUERY_PLAN) {
          appendMessage(sessionId, "user", displayText);
          const card = buildPlanCard();
          send(ws, { type: "plan_card", card });
          const reply = "我把当前计划放到右侧了。";
          appendMessage(sessionId, "assistant", reply);
          send(ws, { type: "text_delta", delta: reply });
          send(ws, { type: "turn_end", usage: {} });
          return;
        }

        // ── PLAN: generate plan from diagnostic fields ──
        if (decision.intent === Intent.PLAN) {
          appendMessage(sessionId, "user", displayText);
          const result = generatePlanFromDiagnostic(
            decision.pending_fields as {
              weak_modules?: string[];
              daily_hours?: number | string;
            },
          );
          if (result.ok) {
            clearSessionState(sessionId);
            const card = result.details?.plan_card;
            if (card) {
              send(ws, { type: "plan_card", card });
            }
            const reply = planCreatedReply(
              decision.pending_fields as Record<string, unknown>,
              result.content,
            );
            appendMessage(sessionId, "assistant", reply);
            send(ws, { type: "text_delta", delta: reply });
            send(ws, { type: "file_list", files: getWorkspaceFileTree() });
            send(ws, { type: "turn_end", usage: {} });
            return;
          }
          send(ws, { type: "error", message: result.content });
          return;
        }

        // ── Route context for ASK intent ──
        const routeContext = buildRouteContext(decision);

        // ── Main agent loop ──
        const events = agent.run(text, sessionId, routeContext, ac.signal, displayText);

        for await (const event of events) {
          if (ac.signal.aborted) break;
          if (event.type === "turn_end") {
            send(ws, { type: "file_list", files: getWorkspaceFileTree() });
          }
          send(ws, event);
        }
      } catch (err) {
        console.error("Agent error:", err);
        try {
          send(ws, { type: "error", message: "Agent 内部错误" });
        } catch {
          // socket may be closed
        }
      }
    }

    ws.on("message", (raw) => {
      let msg: { type?: string; text?: string; display_text?: string; session_id?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: "error", message: "Invalid JSON" });
        return;
      }

      const t = msg.type || "";

      if (t === "prompt") {
        const text = (msg.text || "").trim();
        const sessionId = (msg.session_id || "default").trim() || "default";

        if (!text) {
          send(ws, { type: "error", message: "消息为空" });
          return;
        }

        // Abort any running task
        if (abortController && !abortController.signal.aborted) {
          abortController.abort();
        }
        if (currentTask) {
          currentTask.catch(() => {}); // suppress unhandled rejection
        }

        const displayText = (msg.display_text || text).trim();
        currentTask = runLoop(text, sessionId, displayText);
        currentTask.catch(() => {}); // suppress unhandled rejection
      } else if (t === "abort") {
        if (abortController) {
          abortController.abort();
        }
        if (currentTask) {
          currentTask.catch(() => {});
        }
        send(ws, { type: "turn_end", usage: {} });
      } else if (t === "steer") {
        // reserved — do nothing
      } else {
        send(ws, { type: "error", message: `Unknown type: ${t}` });
      }
    });

    ws.on("close", () => {
      // Abort any running task on disconnect
      if (abortController) {
        abortController.abort();
      }
      if (currentTask) {
        currentTask.catch(() => {});
      }
    });

    ws.on("error", () => {
      // silence transport errors
    });
  });
}

// ── Helpers ──

function send(ws: WebSocket, data: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function buildFileRouteContext(intent: string): string {
  const base = "# 文件意图路由\n附件已上传到工作区。先用 read_document 读取相关文件，再按本轮意图回答。";
  switch (intent) {
    case Intent.FILE_SUMMARY:
      return `${base}\n意图：文件总结。只总结/梳理内容，不写入复盘数据。`;
    case Intent.FILE_EXTRACT:
      return `${base}\n意图：信息提取。按用户要求提取或结构化内容，不写入复盘数据。`;
    case Intent.REVIEW_RECORD:
      return `${base}\n意图：明确计入复盘。允许调用 record_pdf_review，confirmed_by_user 必须为 true；如果用户没有说明关联任务，daily_task_id 传 null。\n\n回复必须使用以下 Markdown 模板，缺失字段写"（暂无）"，不要新增段落或调整顺序：\n\n## 本次诊断\n- 主要问题：\n- 高频失误：\n- 不是知识点问题，而是：\n\n## 记忆清单\n1.\n2.\n3.\n\n## 回粉笔重做清单\n- 题号/题型：\n- 重做重点：\n- 不需要在 Akari 重做，回粉笔完成即可。\n\n## 明日计划建议\n- 建议增加：\n- 建议减少：\n- 暂不调整：`;
    case Intent.TASK_LINK_REVIEW:
      return `${base}\n意图：关联任务复盘。先确认要关联的今日任务；明确后才能调用 record_pdf_review。确认后回复同样使用上述四段式：本次诊断 / 记忆清单 / 回粉笔重做清单 / 明日计划建议。`;
    case Intent.FILE_CHAT:
      return `${base}\n意图：普通文件对话。回答用户问题；如果用户没说明用途，简短说明文件内容并询问下一步。不要写入复盘数据。`;
    default:
      return "";
  }
}

function buildRouteContext(decision: { intent: string; missing_field: string | null; question: string; pending_fields: Record<string, unknown> }): string {
  const fileContext = buildFileRouteContext(decision.intent);
  if (fileContext) return fileContext;
  if (decision.intent !== Intent.ASK) return "";

  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(decision.pending_fields)) {
    if (value) {
      fields[key] = value;
    }
  }

  return (
    "# 对话路由提示\n" +
    "用户正在建立备考计划，但信息还不完整。不要直接生成计划。" +
    "请先自然回应用户这句话，然后只追问一个最关键的缺失信息。" +
    "如果这个追问适合选择题，请在回复末尾单独写一行：[选项: 选项1 | 选项2 | 选项3 | 不确定]。" +
    "不要像表单，不要提到 IntentClassifier、路由或内部状态。\n" +
    `- 当前缺失字段: ${decision.missing_field}\n` +
    `- 建议追问: ${decision.question}\n` +
    `- 已收集字段: ${JSON.stringify(fields)}`
  );
}

function planCreatedReply(fields: Record<string, unknown>, toolSummary: string): string {
  const weakModules = (fields.weak_modules as string[]) || [];
  const weak = weakModules.length > 0 ? weakModules.join("、") : "基础模块";
  const hours = fields.daily_hours;
  const hoursText = hours ? `每天约 ${hours} 小时` : "按当前可用时间";

  return (
    `计划已经生成好了，我放到右侧「我的规划」里了。\n\n` +
    `这版先按${hoursText}来排，重点照顾 ${weak}。` +
    `${toolSummary} 接下来你可以先照今天任务跑一轮，觉得太满或太松再告诉我，我会继续调。`
  );
}

export default router;
