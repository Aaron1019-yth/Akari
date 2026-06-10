export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_call_id?: string | null;
  name?: string | null;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface StreamChunk {
  type: "text_delta" | "tool_call" | "done";
  delta?: string;
  call?: ToolCall;
  usage?: TokenUsage;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  content: string;
  details?: Record<string, unknown>;
  ok: boolean;
}
