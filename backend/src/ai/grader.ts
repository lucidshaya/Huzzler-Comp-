import type Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { weightedRubricScore } from "../domain/grading.js";
import { callStructured, AiUnavailableError, type StructuredCall } from "./aiClient.js";
import { ModelGrade, type SharedGrade } from "./schemas.js";
import { getRubric, rubricWeights } from "./rubrics.js";
import { GRADING_RULES, PROMPT_VERSIONS, rubricBlock } from "./prompts.js";
import { exemplarsFor } from "./rag.js";
import type { AiFeature } from "./features.js";

export type GradeRequest = {
  feature: Extract<AiFeature, "onboarding_grading" | "project_grading" | "second_grading" | "demo_grading">;
  userId: string;
  roleId: string;
  rubricId: string;
  taskPrompt: string;
  submission: string;
  automatedResults?: string;
  images?: Array<{ mediaType: "image/png" | "image/jpeg" | "image/webp"; base64: string }>;
};

export type GradeOutcome = SharedGrade & { model: string; promptVersion: string; rubricVersion: string; needsReview: boolean };

const escapeTags = (s: string) => s.replace(/<\/?submission[^>]*>/gi, "[tag removed]");

export async function gradeWithRubric(req: GradeRequest): Promise<GradeOutcome> {
  const rubric = getRubric(req.rubricId);
  const weights = rubricWeights(rubric);

  if (!env.ANTHROPIC_API_KEY) {
    if (env.AI_MOCK && env.NODE_ENV !== "production") return mockGrade(req, rubric.version, Object.keys(weights));
    throw new AiUnavailableError();
  }

  const exemplars = await exemplarsFor(req.rubricId, req.submission);
  const content: Anthropic.ContentBlockParam[] = [];
  content.push({ type: "text", text: `<task>\n${req.taskPrompt}\n</task>` });
  for (const ex of exemplars) {
    content.push({ type: "text", text: `<calibration_example score="${ex.score}">\n${ex.body}\n</calibration_example>` });
  }
  if (req.automatedResults) content.push({ type: "text", text: `<automated_results>\n${req.automatedResults}\n</automated_results>` });
  for (const img of req.images ?? []) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
  }
  content.push({ type: "text", text: `<submission untrusted="true">\n${escapeTags(req.submission)}\n</submission>\n\nGrade the submission against the rubric.` });

  const call: StructuredCall<typeof ModelGrade> = {
    feature: req.feature,
    userId: req.userId,
    roleId: req.roleId,
    promptVersion: PROMPT_VERSIONS.grading,
    cachedSystem: [GRADING_RULES, rubricBlock(rubric)],
    userContent: content,
    schema: ModelGrade,
  };
  const { data, model } = await callStructured(call);
  return toOutcome(data, weights, req.submission, { model, promptVersion: PROMPT_VERSIONS.grading, rubricVersion: rubric.version });
}

function toOutcome(
  g: ModelGrade,
  weights: Record<string, number>,
  submission: string,
  meta: { model: string; promptVersion: string; rubricVersion: string },
): GradeOutcome {
  const criteria_breakdown: SharedGrade["criteria_breakdown"] = {};
  for (const c of g.criteria) if (c.criterion_id in weights) criteria_breakdown[c.criterion_id] = { score: c.score, note: c.note };
  const missing = Object.keys(weights).filter((k) => !(k in criteria_breakdown));
  const score = weightedRubricScore(criteria_breakdown, weights);

  // Anomaly: a very high score on a very short answer is suspicious (possible injection).
  const words = submission.trim().split(/\s+/).filter(Boolean).length;
  const anomaly = score >= 85 && words < 60 ? `score ${score} on a ${words}-word submission` : undefined;
  const flags = { ...g.flags, ...(anomaly ? { anomaly } : {}) };

  return {
    score,
    criteria_breakdown,
    strengths: g.strengths,
    gaps: g.gaps,
    next_steps: g.next_steps.slice(0, 5),
    feedback: g.feedback,
    flags,
    ...meta,
    needsReview: missing.length > 0 || flags.possible_prompt_injection || Boolean(anomaly),
  };
}

/** Development-only stand-in so the full flow can be exercised before the API key exists. */
function mockGrade(req: GradeRequest, rubricVersion: string, criteria: string[]): GradeOutcome {
  const words = req.submission.trim().split(/\s+/).filter(Boolean).length;
  const base = Math.min(92, 40 + Math.round(Math.log2(words + 1) * 6));
  const criteria_breakdown = Object.fromEntries(criteria.map((c, i) => [c, { score: Math.max(0, Math.min(100, base + ((i % 3) - 1) * 4)), note: "Mock grade (AI not configured)." }]));
  return {
    score: weightedRubricScore(criteria_breakdown, Object.fromEntries(criteria.map((c) => [c, 1]))),
    criteria_breakdown,
    strengths: "Mock grading is on: this score is based on length only.",
    gaps: "Configure ANTHROPIC_API_KEY to get real rubric feedback.",
    next_steps: ["Re-grade once AI grading is enabled."],
    feedback: "This is a development mock grade.",
    flags: { possible_prompt_injection: false, possible_ai_generated: false },
    model: "mock",
    promptVersion: PROMPT_VERSIONS.grading,
    rubricVersion,
    needsReview: false,
  };
}
