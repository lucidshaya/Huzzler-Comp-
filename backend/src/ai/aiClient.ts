import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { featureConfig, costUsd, type AiFeature } from "./features.js";
import { deepseekJson, DeepSeekApiError } from "./deepseek.js";

/** Thrown when AI is not configured yet (no API key) — callers park the work as `awaiting_ai`. */
export class AiUnavailableError extends Error {
  constructor(reason = "AI is not configured") {
    super(reason);
  }
}
/** Thrown when the monthly AI budget is exhausted — callers send work to human review. */
export class AiBudgetError extends Error {}
/** Thrown when the model's output fails validation twice — callers send work to human review. */
export class AiOutputError extends Error {}

let client: Anthropic | null = null;
export type AiProvider = "anthropic" | "deepseek";
/** DeepSeek when its key is set (unless AI_PROVIDER says otherwise), else Claude. */
export function aiProvider(): AiProvider | null {
  if (env.AI_PROVIDER === "anthropic" && env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.AI_PROVIDER === "deepseek" && env.DEEPSEEK_API_KEY) return "deepseek";
  return env.DEEPSEEK_API_KEY ? "deepseek" : env.ANTHROPIC_API_KEY ? "anthropic" : null;
}
export const aiConfigured = () => aiProvider() !== null;
/** Staff-facing name of the model provider (learners only ever see "Huzzler AI"). */
export const providerName = () => (aiProvider() === "anthropic" ? "Claude" : "DeepSeek");
function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new AiUnavailableError();
  // maxRetries covers 429/5xx/connection errors with backoff; BullMQ retries on top of that.
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 3, timeout: 120_000 });
  return client;
}

export type StructuredCall<T extends z.ZodType> = {
  feature: AiFeature;
  userId?: string | null;
  roleId?: string | null;
  promptVersion: string;
  /** Fixed content first (rules, rubric, guidelines): marked cacheable. */
  cachedSystem: string[];
  /** Per-request content (exemplars, task, the untrusted submission). */
  userContent: Anthropic.ContentBlockParam[];
  schema: T;
};

let budgetCache: { at: number; spent: number; limit: number } | null = null;
async function assertBudget() {
  if (!budgetCache || Date.now() - budgetCache.at > 5 * 60_000) {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const { data } = await db.from("ai_calls").select("cost_usd").gte("created_at", start.toISOString());
    const spent = (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
    const { data: flag } = await db.from("feature_flags").select("value").eq("key", "monthly_ai_budget_usd").maybeSingle();
    const limit = Number((flag?.value as { amount?: number } | null)?.amount ?? env.AI_MONTHLY_BUDGET_USD);
    budgetCache = { at: Date.now(), spent, limit };
  }
  if (budgetCache.spent >= budgetCache.limit) throw new AiBudgetError("Monthly AI budget reached");
}

async function logCall(row: Record<string, unknown>) {
  const { error } = await db.from("ai_calls").insert(row);
  if (error) logger.error({ err: error }, "ai_calls insert failed");
  if (budgetCache && typeof row.cost_usd === "number") budgetCache.spent += row.cost_usd;
}

/** Which fields failed, e.g. "chart: too small; summary: too big", so failures can be fixed at the prompt. */
function issueSummary(err: z.ZodError): string {
  return err.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`).join("; ").slice(0, 300);
}

/**
 * The single entry point for live Claude calls. Structured output is enforced with a JSON schema
 * (output_config.format) and re-validated with Zod; on a validation failure we retry once, then
 * raise AiOutputError so the caller can route the item to human review.
 */
export async function callStructured<T extends z.ZodType>(call: StructuredCall<T>): Promise<{ data: z.infer<T>; model: string }> {
  const provider = aiProvider();
  if (!provider) throw new AiUnavailableError();
  await assertBudget();
  const cfg = await featureConfig(call.feature, provider);
  if (provider === "deepseek") return callDeepSeek(call, cfg);
  const anthropic = getClient();

  const system: Anthropic.TextBlockParam[] = call.cachedSystem.map((text, i) => ({
    type: "text",
    text,
    ...(i === call.cachedSystem.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    try {
      const res = await anthropic.messages.parse({
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        system,
        messages: [{ role: "user", content: call.userContent }],
        output_config: { format: zodOutputFormat(call.schema as any), effort: cfg.effort },
      });
      const u = res.usage;
      const usage = {
        input: u.input_tokens,
        output: u.output_tokens,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
      };
      const base = {
        feature: call.feature, model: cfg.model, user_id: call.userId ?? null, role_id: call.roleId ?? null,
        input_tokens: usage.input, output_tokens: usage.output, cache_read_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite,
        cost_usd: costUsd(cfg.model, usage), latency_ms: Date.now() - started, prompt_version: call.promptVersion,
      };
      if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") {
        await logCall({ ...base, success: false, error: `stop_reason=${res.stop_reason}` });
        lastErr = new AiOutputError(`stop_reason=${res.stop_reason}`);
        continue;
      }
      const parsed = call.schema.safeParse(res.parsed_output);
      if (!parsed.success) {
        await logCall({ ...base, success: false, error: `schema validation failed: ${issueSummary(parsed.error)}` });
        lastErr = new AiOutputError(parsed.error.message);
        continue;
      }
      await logCall({ ...base, success: true });
      return { data: parsed.data, model: cfg.model };
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        await logCall({
          feature: call.feature, model: cfg.model, user_id: call.userId ?? null, role_id: call.roleId ?? null,
          success: false, error: `${err.status ?? "network"}: ${err.message}`.slice(0, 500), latency_ms: Date.now() - started, prompt_version: call.promptVersion,
        });
        // Bad requests won't get better on retry; rate limits and 5xx are retried by the SDK and then the queue.
        throw err;
      }
      lastErr = err;
    }
  }
  throw lastErr instanceof AiOutputError ? lastErr : new AiOutputError(String(lastErr));
}

async function callDeepSeek<T extends z.ZodType>(call: StructuredCall<T>, cfg: Awaited<ReturnType<typeof featureConfig>>): Promise<{ data: z.infer<T>; model: string }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    const who = { feature: call.feature, model: cfg.model, user_id: call.userId ?? null, role_id: call.roleId ?? null, prompt_version: call.promptVersion };
    try {
      const r = await deepseekJson({ apiKey: env.DEEPSEEK_API_KEY!, model: cfg.model, maxTokens: cfg.maxTokens, effort: cfg.effort, system: call.cachedSystem, content: call.userContent, schema: call.schema });
      const base = {
        ...who,
        input_tokens: r.usage.input, output_tokens: r.usage.output, cache_read_tokens: r.usage.cacheRead, cache_write_tokens: 0,
        cost_usd: costUsd(cfg.model, r.usage), latency_ms: Date.now() - started,
      };
      if (r.finish !== "stop") {
        await logCall({ ...base, success: false, error: `finish_reason=${r.finish}` });
        lastErr = new AiOutputError(`finish_reason=${r.finish}`);
        continue;
      }
      const parsed = call.schema.safeParse(r.json);
      if (!parsed.success) {
        await logCall({ ...base, success: false, error: r.json === null ? "empty or invalid JSON" : `schema validation failed: ${issueSummary(parsed.error)}` });
        lastErr = new AiOutputError(parsed.error.message);
        continue;
      }
      await logCall({ ...base, success: true });
      return { data: parsed.data, model: cfg.model };
    } catch (err) {
      if (err instanceof DeepSeekApiError) {
        await logCall({ ...who, success: false, error: `${err.status ?? "network"}: ${err.message}`.slice(0, 500), latency_ms: Date.now() - started });
        // Auth/billing errors (401/402) mean AI is effectively off: callers send work to human review.
        if (err.status === 401 || err.status === 402) throw new AiUnavailableError(`DeepSeek ${err.status}`);
        throw err;
      }
      lastErr = err;
    }
  }
  throw lastErr instanceof AiOutputError ? lastErr : new AiOutputError(String(lastErr));
}
