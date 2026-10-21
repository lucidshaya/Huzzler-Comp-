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
  | "workstation";

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
};

let cache: { at: number; overrides: Partial<Record<AiFeature, Partial<FeatureConfig>>> } | null = null;

export async function featureConfig(feature: AiFeature): Promise<FeatureConfig> {
  if (!cache || Date.now() - cache.at > 60_000) {
    const { data } = await db.from("feature_flags").select("value").eq("key", "ai_models").maybeSingle();
    cache = { at: Date.now(), overrides: (data?.value as typeof cache extends null ? never : any) ?? {} };
  }
  return { ...DEFAULTS[feature], ...(cache.overrides[feature] ?? {}) };
}

/** USD per million tokens, prompts ≤100K tokens (we keep every prompt well under that). */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export function costUsd(model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number }, batch = false): number {
  const p = PRICES[model] ?? PRICES["claude-haiku-5-5"];
  const raw = (u.input * p.input + u.cacheRead * p.input * 0.1 + u.cacheWrite * p.input * 1.25 + u.output * p.output) / 1_000_000;
  return batch ? raw / 2 : raw;
}
