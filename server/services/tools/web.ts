import { getSettings } from "../settings-service.js";
import type { ToolDef, ToolResult } from "../llm-types.js";

// ── HTML helpers ──

function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function htmlToText(raw: string): string {
  let s = raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  return unescapeHtml(s).trim();
}

// ── Private host check ──

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  // localhost
  if (lower === "localhost" || lower === "localhost.localdomain") return true;
  // IPv4 loopback / private ranges
  if (/^127\./.test(lower)) return true;
  if (/^10\./.test(lower)) return true;
  if (/^192\.168\./.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(lower)) return true;
  // IPv6 loopback
  if (lower === "::1" || lower === "[::1]") return true;
  if (lower === "0.0.0.0") return true;
  return false;
}

// ── Search providers ──

interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

function formatResults(results: SearchResultItem[], provider: string): ToolResult {
  if (results.length === 0) {
    return {
      content: "没有搜索结果。",
      details: { results: [], provider },
      ok: true,
    };
  }

  const lines: string[] = [];
  const normalized: SearchResultItem[] = [];
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const title = item.title || item.url || "Untitled";
    const url = item.url || "";
    const snippet = item.snippet || "";
    lines.push(`${i + 1}. **${title}**\n   ${url}\n   ${snippet}`);
    normalized.push({ title, url, snippet });
  }

  return {
    content: lines.join("\n"),
    details: { results: normalized, provider },
    ok: true,
  };
}

async function searchTavily(
  query: string,
  maxResults: number
): Promise<ToolResult | null> {
  const key = getSettings().tavilyApiKey;
  if (!key) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: maxResults,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    const items: SearchResultItem[] = (payload.results || [])
      .slice(0, maxResults)
      .map((item) => ({
        title: item.title || item.url || "Untitled",
        url: item.url || "",
        snippet: item.content || "",
      }));
    return formatResults(items, "tavily");
  } catch {
    return null;
  }
}

async function searchSerper(
  query: string,
  maxResults: number
): Promise<ToolResult | null> {
  const key = getSettings().serperApiKey;
  if (!key) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: maxResults }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      organic?: { title?: string; link?: string; snippet?: string }[];
    };
    const items: SearchResultItem[] = (payload.organic || [])
      .slice(0, maxResults)
      .map((item) => ({
        title: item.title || item.link || "Untitled",
        url: item.link || "",
        snippet: item.snippet || "",
      }));
    return formatResults(items, "serper");
  } catch {
    return null;
  }
}

async function searchBrave(
  query: string,
  maxResults: number
): Promise<ToolResult | null> {
  const key = getSettings().braveSearchApiKey;
  if (!key) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(maxResults));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-Subscription-Token": key,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      web?: {
        results?: { title?: string; url?: string; description?: string }[];
      };
    };
    const items: SearchResultItem[] = (payload.web?.results || [])
      .slice(0, maxResults)
      .map((item) => ({
        title: item.title || item.url || "Untitled",
        url: item.url || "",
        snippet: item.description || "",
      }));
    return formatResults(items, "brave");
  } catch {
    return null;
  }
}

// ── Tool implementations ──

async function webSearch(
  query: string,
  maxResults: number = 5
): Promise<ToolResult> {
  const providers = [searchTavily, searchSerper, searchBrave];
  for (const provider of providers) {
    const result = await provider(query, maxResults);
    if (result !== null) return result;
  }

  return {
    content:
      "未配置可用搜索 provider。可设置 TAVILY_API_KEY、SERPER_API_KEY 或 BRAVE_SEARCH_API_KEY，" +
      `也可以直接提供要读取的 URL。\n搜索词: ${query}`,
    details: { results: [], provider: null },
    ok: false,
  };
}

async function webFetch(
  url: string,
  maxLength: number = 8000
): Promise<ToolResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { content: "URL 必须是完整的 http(s) 地址。", ok: false };
  }

  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    return { content: "URL 必须是完整的 http(s) 地址。", ok: false };
  }

  if (isPrivateHost(parsed.hostname)) {
    return {
      content: "出于安全限制，不能读取内网或本机地址。",
      ok: false,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(url, {
      headers: { "User-Agent": "Akari/0.1" },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const ctype = response.headers.get("content-type") || "";

    let text: string;
    if (ctype.includes("application/json")) {
      const json = (await response.json()) as unknown;
      text = JSON.stringify(json, null, 2);
    } else {
      const raw = await response.text();
      text =
        ctype.includes("html") || raw.slice(0, 500).toLowerCase().includes("<html")
          ? htmlToText(raw)
          : raw;
    }

    const truncated = text.length > maxLength;
    text = text.slice(0, maxLength);
    if (truncated) {
      text += "\n\n[内容已截断]";
    }

    return {
      content: text,
      details: {
        url,
        status_code: response.status,
        truncated,
      },
      ok: true,
    };
  } catch (err) {
    return {
      content: `获取 URL 失败: ${err instanceof Error ? err.message : String(err)}`,
      ok: false,
    };
  }
}

// ── Factory ──

export function createWebTools(): ToolDef[] {
  return [
    {
      name: "web_search",
      description:
        "搜索互联网获取实时信息。WHEN 需要查找最新资料、验证事实时使用。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          max_results: {
            type: "integer",
            default: 5,
          },
        },
        required: ["query"],
      },
      execute: async (params) =>
        webSearch(
          params.query as string,
          (params.max_results as number) ?? 5
        ),
    },
    {
      name: "web_fetch",
      description:
        "获取指定 URL 的网页内容。WHEN 需要阅读搜索结果中的具体文章时使用。",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          max_length: {
            type: "integer",
            default: 8000,
          },
        },
        required: ["url"],
      },
      execute: async (params) =>
        webFetch(
          params.url as string,
          (params.max_length as number) ?? 8000
        ),
    },
  ];
}
