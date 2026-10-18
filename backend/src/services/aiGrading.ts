import { db, must } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { isBorderline, gradingsDisagree, round2 } from "../domain/grading.js";
import { gradeWithRubric, type GradeRequest, type GradeOutcome } from "../ai/grader.js";
import { AiUnavailableError, AiBudgetError, AiOutputError } from "../ai/aiClient.js";
import { flagPossibleAi } from "./integrity.js";

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
  let first: GradeOutcome;
  try {
    first = await gradeWithRubric(req);
  } catch (err) {
    if (err instanceof AiUnavailableError) return { state: "awaiting_ai" };
    if (err instanceof AiBudgetError || err instanceof AiOutputError) {
      logger.warn({ err: String(err), subject }, "AI grading failed, routing to human review");
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
  return needsReview ? { state: "needs_review", score: finalScore, gradeId, reason } : { state: "graded", score: finalScore, gradeId };
}
