import { getSettings } from "./settings-service.js";
import type { Message, StreamChunk, ToolCall, TokenUsage } from "./llm-types.js";

export interface ApiToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ── Build request body (matches Python _body) ──

function buildBody(
  messages: Message[],
  tools: ApiToolDef[] | null,
  model: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map(messageToDict),
    ...extra,
  };
  if (tools && tools.length > 0) {
    body["tools"] = tools.map((t) => ({ type: "function", function: t }));
    if (!("tool_choice" in body)) {
      body["tool_choice"] = "auto";
    }
  }
  return body;
}

// ── Serialize Message → OpenAI API dict (matches Python _msg_to_dict) ──

export function messageToDict(m: Message): Record<string, unknown> {
  const d: Record<string, unknown> = { role: m.role };
  if (m.content !== null && m.content !== undefined) {
    d["content"] = m.content;
  }
  if (m.tool_calls && m.tool_calls.length > 0) {
    d["tool_calls"] = m.tool_calls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    }));
  }
  if (m.tool_call_id) {
    d["tool_call_id"] = m.tool_call_id;
  }
  if (m.name) {
    d["name"] = m.name;
  }
  return d;
}

// ── Non-streaming chat (matches Python chat) ──

export async function chat(
  messages: Message[],
  tools: ApiToolDef[] | null = null,
  temperature = 0.7,
  maxTokens = 4096,
): Promise<string> {
  const settings = getSettings();
  const body = buildBody(messages, tools, settings.model, {
    temperature,
    max_tokens: maxTokens,
  });

  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`LLM API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content?: string } }>;
  };

  return data.choices[0]?.message?.content || "";
}

// ── Streaming chat (matches Python chat_stream) ──

export async function* chatStream(
  messages: Message[],
  tools: ApiToolDef[] | null = null,
  temperature = 0.7,
  maxTokens = 4096,
): AsyncGenerator<StreamChunk> {
  const settings = getSettings();
  const body = buildBody(messages, tools, settings.model, {
    temperature,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  });

  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`LLM API error ${response.status}: ${errText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();
  let usage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let streamDone = false;

  try {
    while (!streamDone) {
      const result = await reader.read();
      if (result.done) {
        // flush remaining buffer
        const flushed = processLineBuffer(buffer, toolAcc, usage);
        for (const s of flushed) {
          yield s;
        }
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const s = line.slice(6);
        if (s.trim() === "[DONE]") {
          streamDone = true;
          break;
        }
        let chunk: Record<string, unknown>;
        try {
          chunk = JSON.parse(s) as Record<string, unknown>;
        } catch {
          continue;
        }

        // Extract usage from chunk
        if (chunk["usage"]) {
          const u = chunk["usage"] as Record<string, number>;
          usage.prompt_tokens = u["prompt_tokens"] ?? 0;
          usage.completion_tokens = u["completion_tokens"] ?? 0;
          usage.total_tokens = u["total_tokens"] ?? 0;
        }

        const choices = chunk["choices"] as Array<Record<string, unknown>> | undefined;
        if (!choices || choices.length === 0) continue;

        const delta = (choices[0]!["delta"] || {}) as Record<string, unknown>;
        const finish = (choices[0]!["finish_reason"] as string) || "";

        // text delta
        if (typeof delta["content"] === "string" && delta["content"]) {
          yield { type: "text_delta", delta: delta["content"] };
        }

        // accumulate tool call deltas
        const deltaToolCalls = (delta["tool_calls"] as Array<Record<string, unknown>>) || [];
        for (const tc of deltaToolCalls) {
          const idx = (tc["index"] as number) ?? 0;
          if (!toolAcc.has(idx)) {
            toolAcc.set(idx, { id: "", name: "", arguments: "" });
          }
          const acc = toolAcc.get(idx)!;
          if (tc["id"]) acc["id"] = tc["id"] as string;
          const fn = (tc["function"] as Record<string, string>) || {};
          if (fn["name"]) acc["name"] = fn["name"];
          if (fn["arguments"]) acc["arguments"] += fn["arguments"];
        }

        // flush completed tool calls on finish_reason
        if ((finish === "tool_calls" || finish === "stop") && toolAcc.size > 0) {
          for (const acc of toolAcc.values()) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(acc["arguments"]);
            } catch {
              // keep empty args on parse failure
            }
            yield {
              type: "tool_call",
              call: { id: acc["id"], name: acc["name"], arguments: args },
            };
          }
          toolAcc.clear();
        }
      }
    }

    // Flush any remaining tool calls that weren't emitted (edge case)
    if (toolAcc.size > 0) {
      for (const acc of toolAcc.values()) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(acc["arguments"]);
        } catch {
          // keep empty args on parse failure
        }
        yield {
          type: "tool_call",
          call: { id: acc["id"], name: acc["name"], arguments: args },
        };
      }
      toolAcc.clear();
    }

    yield { type: "done", usage };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // reader may already be released
    }
  }
}

// ── Flush final buffer lines (when stream ends without [DONE]) ──

function processLineBuffer(
  buffer: string,
  _toolAcc: Map<number, { id: string; name: string; arguments: string }>,
  _usage: TokenUsage,
): StreamChunk[] {
  // In practice, the buffer after the stream ends is either empty or contains
  // trailing partial JSON that can't be parsed. We don't expect meaningful data.
  // If there is unflushed content, we skip it — same as Python which drops
  // lines after [DONE].
  return [];
}
