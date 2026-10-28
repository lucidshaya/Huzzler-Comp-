import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// DeepSeek chat completions (OpenAI-compatible HTTP API). DeepSeek has JSON mode but no strict
// schema, so the schema goes into the system prompt and callStructured re-validates with Zod.

const BASE = "https://api.deepseek.com";

export class DeepSeekApiError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

export type DeepSeekResult = {
  json: unknown;
  finish: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

/** Claude-style content blocks (what the callers build) → DeepSeek message parts. */
function toParts(blocks: Anthropic.ContentBlockParam[]): Part[] {
  const parts: Part[] = [];
  for (const b of blocks) {
    if (b.type === "text") parts.push({ type: "text", text: b.text });
    else if (b.type === "image" && b.source.type === "base64") parts.push({ type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } });
  }
  return parts;
}

// Thinking is billed as output, so low-effort features skip it and the rest think briefly.
const EFFORT = { low: "none", medium: "low", high: "high" } as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function deepseekJson(opts: {
  apiKey: string;
  model: string;
  maxTokens: number;
  effort: "low" | "medium" | "high";
  system: string[];
  content: Anthropic.ContentBlockParam[];
  schema: z.ZodType;
}): Promise<DeepSeekResult> {
  const schema = JSON.stringify(z.toJSONSchema(opts.schema, { io: "input" }));
  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    response_format: { type: "json_object" },
    reasoning_effort: EFFORT[opts.effort],
    messages: [
      { role: "system", content: `${opts.system.join("\n\n")}\n\nReply with one JSON object only (no prose, no code fences) that matches this JSON schema:\n${schema}` },
      { role: "user", content: toParts(opts.content) },
    ],
  };

  // Same policy as the Anthropic SDK client: retry 429/5xx/network errors up to 3 times with backoff.
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      if (attempt < 3) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new DeepSeekApiError(null, String(err));
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 3) {
        await sleep(Number(res.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt);
        continue;
      }
    }
    if (!res.ok) throw new DeepSeekApiError(res.status, (await res.text()).slice(0, 400));

    const data: any = await res.json();
    const choice = data.choices?.[0];
    const u = data.usage ?? {};
    const hit = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
    const usage = { input: (u.prompt_cache_miss_tokens ?? (u.prompt_tokens ?? 0) - hit) || 0, output: u.completion_tokens ?? 0, cacheRead: hit, cacheWrite: 0 };
    let json: unknown = null;
    try {
      const text = String(choice?.message?.content ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { json, finish: choice?.finish_reason ?? "unknown", usage };
  }
}
