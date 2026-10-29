import { db } from "../lib/supabase.js";

export type AiFeature =
  | "onboarding_grading"
  | "project_grading"
  | "second_grading"
  | "mentor_chat"
  | "integrity_review"
  | "demo_grading"
  | "content_batch"
  | "aipm_wbs"
  | "help_bot"
  | "workstation"
  | "cv_builder"
  | "squad_matching"
  | "team_review"
  | "test_generation"
  | "standin_agent"
  | "meeting_notes"
  | "task_checklist";

export type FeatureConfig = { model: string; maxTokens: number; effort: "low" | "medium" | "high" };

// Defaults: Claude Haiku 5.5 everywhere. Admins can move a single feature to another model by
// setting feature_flags['ai_models'].value = {"mentor_chat": {"model": "claude-sonnet-5-5"}} —
// no deploy needed.
const DEFAULTS: Record<AiFeature, FeatureConfig> = {
  onboarding_grading: { model: "claude-haiku-5-5", maxTokens: 6000, effort: "medium" },
  project_grading: { model: "claude-haiku-5-5", maxTokens: 6000, effort: "medium" },
  second_grading: { model: "claude-haiku-5-5", maxTokens: 6000, effort: "medium" },
  mentor_chat: { model: "claude-haiku-5-5", maxTokens: 1500, effort: "low" },
  integrity_review: { model: "claude-haiku-5-5", maxTokens: 2000, effort: "low" },
  demo_grading: { model: "claude-haiku-5-5", maxTokens: 6000, effort: "medium" },
  content_batch: { model: "claude-haiku-5-5", maxTokens: 16000, effort: "medium" },
  aipm_wbs: { model: "claude-haiku-5-5", maxTokens: 8000, effort: "medium" },
  help_bot: { model: "claude-haiku-5-5", maxTokens: 1200, effort: "low" },
  workstation: { model: "claude-haiku-5-5", maxTokens: 2500, effort: "low" },
  cv_builder: { model: "claude-haiku-5-5", maxTokens: 4000, effort: "medium" },
  squad_matching: { model: "claude-haiku-5-5", maxTokens: 2000, effort: "low" },
  team_review: { model: "claude-haiku-5-5", maxTokens: 4000, effort: "medium" },
  test_generation: { model: "claude-haiku-5-5", maxTokens: 12000, effort: "medium" },
  standin_agent: { model: "claude-haiku-5-5", maxTokens: 4000, effort: "low" },
  meeting_notes: { model: "claude-haiku-5-5", maxTokens: 4000, effort: "medium" },
  task_checklist: { model: "claude-haiku-5-5", maxTokens: 1500, effort: "low" },
};

let cache: { at: number; overrides: Partial<Record<AiFeature, Partial<FeatureConfig>>> } | null = null;

/** Claude defaults map to DeepSeek Flash when DeepSeek is the provider; admin overrides still win. */
export async function featureConfig(feature: AiFeature, provider: "anthropic" | "deepseek" = "anthropic"): Promise<FeatureConfig> {
  if (!cache || Date.now() - cache.at > 60_000) {
    const { data } = await db.from("feature_flags").select("value").eq("key", "ai_models").maybeSingle();
    cache = { at: Date.now(), overrides: (data?.value as typeof cache extends null ? never : any) ?? {} };
  }
  const base = provider === "deepseek" ? { ...DEFAULTS[feature], model: "deepseek-flash" } : DEFAULTS[feature];
  const merged = { ...base, ...(cache.overrides[feature] ?? {}) };
  // An override naming the other provider's model is ignored.
  if (provider === "deepseek" !== merged.model.startsWith("deepseek")) merged.model = base.model;
  return merged;
}

/** USD per million tokens, prompts ≤100K tokens (we keep every prompt well under that). */
const PRICES: Record<string, { input: number; output: number; cacheRead?: number }> = {
  // DeepSeek off-peak list prices (Oct 2026); peak hours cost double, see deepseekPeak.
  "deepseek-flash": { input: 0.15, output: 0.6, cacheRead: 0.003 },
  "deepseek-v4-pro": { input: 0.66, output: 1.98, cacheRead: 0.022 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

/** DeepSeek peak: weekdays 01:00–04:00 and 06:00–10:00 UTC (Chinese public holidays aside). */
export function deepseekPeak(at = new Date()) {
  const d = at.getUTCDay();
  const h = at.getUTCHours();
  return d >= 1 && d <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10));
}

export function costUsd(model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number }, batch = false, at = new Date()): number {
  const p = PRICES[model] ?? PRICES["claude-haiku-5-5"];
  const cacheRead = p.cacheRead ?? p.input * 0.1;
  const raw = (u.input * p.input + u.cacheRead * cacheRead + u.cacheWrite * p.input * 1.25 + u.output * p.output) / 1_000_000;
  const peak = model.startsWith("deepseek") && deepseekPeak(at) ? 2 : 1;
  return (batch ? raw / 2 : raw) * peak;
}
