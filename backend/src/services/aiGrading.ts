import { db, must } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { isBorderline, gradingsDisagree, round2 } from "../domain/grading.js";
import { gradeWithRubric, type GradeRequest, type GradeOutcome } from "../ai/grader.js";
import { AiUnavailableError, AiBudgetError, AiOutputError } from "../ai/aiClient.js";
import { flagPossibleAi } from "./integrity.js";
import { recordDecision } from "../lib/decisions.js";

export type AiGradeResult =
  | { state: "graded"; score: number; gradeId: string }
  | { state: "needs_review"; score: number | null; gradeId: string | null; reason: string }
  | { state: "awaiting_ai" };

type Subject = { subjectType: "test_submission" | "deliverable" | "demo"; subjectId: string };

async function storeGrade(s: Subject, userId: string, g: GradeOutcome, opts: { score?: number; isFinal: boolean; needsReview: boolean }) {
  const row = must(
    await db
      .from("grades")
      .insert({
        subject_type: s.subjectType, subject_id: s.subjectId, user_id: userId, grader: g.model === "mock" ? "auto" : "ai",
        score: opts.score ?? g.score, criteria: g.criteria_breakdown, strengths: g.strengths, gaps: g.gaps, next_steps: g.next_steps,
        feedback: g.feedback, flags: g.flags, model: g.model, prompt_version: g.promptVersion, rubric_version: g.rubricVersion,
        needs_review: opts.needsReview, is_final: opts.isFinal,
      })
      .select("id")
      .single(),
    "grade insert",
  );
  return row.id as string;
}

/**
 * AI grading with the brief's safety net: a second independent grading when the score is within
 * 5 points of 70, human review when the two disagree by more than 10, and human review for
 * injection/anomaly flags or invalid output. The model never decides pass/fail.
 */
export async function gradeSubjectWithAi(subject: Subject, req: GradeRequest): Promise<AiGradeResult> {
  const started = Date.now();
  let first: GradeOutcome;
  try {
    first = await gradeWithRubric(req);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      await logGradeDecision(subject, req, { state: "awaiting_ai", score: null, model: "none" });
      return { state: "awaiting_ai" };
    }
    if (err instanceof AiBudgetError || err instanceof AiOutputError) {
      logger.warn({ err: String(err), subject }, "AI grading failed, routing to human review");
      await logGradeDecision(subject, req, { state: "needs_review", score: null, model: "none", reason: String(err.message) });
      return { state: "needs_review", score: null, gradeId: null, reason: String(err.message) };
    }
    throw err; // API errors: let the queue retry with backoff
  }

  if (first.flags.possible_ai_generated) await flagPossibleAi(subject.subjectType, subject.subjectId, req.userId);

  let finalScore = first.score;
  let needsReview = first.needsReview;
  let reason = needsReview ? "flagged by grader" : "";

  if (!needsReview && isBorderline(first.score) && first.model !== "mock") {
    try {
      const second = await gradeWithRubric({ ...req, feature: "second_grading" });
      await storeGrade(subject, req.userId, second, { isFinal: false, needsReview: false });
      if (gradingsDisagree(first.score, second.score)) {
        needsReview = true;
        reason = `gradings disagree (${first.score} vs ${second.score})`;
      }
      finalScore = round2((first.score + second.score) / 2);
    } catch (err) {
      logger.warn({ err: String(err) }, "second grading failed; sending borderline item to review");
      needsReview = true;
      reason = "borderline and second grading failed";
    }
  }

  const gradeId = await storeGrade(subject, req.userId, first, { score: finalScore, isFinal: true, needsReview });
  await logGradeDecision(subject, req, { state: needsReview ? "needs_review" : "graded", score: finalScore, model: first.model, reason, grade: first, latencyMs: Date.now() - started });
  return needsReview ? { state: "needs_review", score: finalScore, gradeId, reason } : { state: "graded", score: finalScore, gradeId };
}

/** Logs why a grade came out the way it did, criterion by criterion, for the AI PM portal. */
async function logGradeDecision(
  s: Subject,
  req: GradeRequest,
  r: { state: "graded" | "needs_review" | "awaiting_ai"; score: number | null; model: string; reason?: string; grade?: GradeOutcome; latencyMs?: number },
) {
  const engine = r.state === "awaiting_ai" || r.model === "none" ? "rules" : r.model === "mock" ? "mock" : "ai";
  const what = s.subjectType.replace("_", " ");
  await recordDecision({
    kind: "grading",
    engine,
    model: engine === "ai" ? r.model : null,
    userId: req.userId,
    subjectType: s.subjectType,
    subjectId: s.subjectId,
    summary:
      r.state === "awaiting_ai"
        ? `Parked a ${what} (${req.rubricId}) for AI grading: no API key yet, so it waits for the key or a person.`
        : r.score === null
          ? `Couldn't grade a ${what} automatically; sent to a person (${r.reason ?? "review"}).`
          : `Graded a ${what} (${req.rubricId}): ${r.score}/100${r.state === "needs_review" ? `, sent to a person (${r.reason || "review"})` : ""}.`,
    reasoning: [
      ...Object.entries(r.grade?.criteria_breakdown ?? {}).map(([id, c]) => ({ label: id, detail: c.note || "No note.", weight: c.score })),
      ...(r.grade?.strengths ? [{ label: "Strengths", detail: r.grade.strengths.slice(0, 400) }] : []),
      ...(r.grade?.gaps ? [{ label: "Gaps", detail: r.grade.gaps.slice(0, 400) }] : []),
      ...(r.state === "needs_review" ? [{ label: "Safety net", detail: r.reason || "Flagged for a human." }] : []),
      ...(r.state === "awaiting_ai" ? [{ label: "Waiting", detail: "Once ANTHROPIC_API_KEY is set, the retry job grades everything parked here." }] : []),
    ],
    confidence: r.score === null ? null : r.state === "needs_review" ? 0.5 : 0.85,
    latencyMs: r.latencyMs ?? null,
    status: r.state === "needs_review" ? "flagged" : "committed",
  });
}
