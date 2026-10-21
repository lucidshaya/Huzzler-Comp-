import { db } from "../lib/supabase.js";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import { badRequest, notFound } from "../lib/errors.js";
import { enqueue } from "../jobs/queue.js";
import { getJourney } from "./journey.js";
import { maybeFinalizeAttempt } from "./onboarding.js";

// Human grading, split by where it happens: onboarding tests are graded in Admin, project work
// (deliverables and demo day) in the AI PM portal next to the squads it belongs to.

export type Scope = "onboarding" | "projects";
export const SUBJECTS: Record<Scope, string[]> = { onboarding: ["test_submission"], projects: ["deliverable", "demo"] };

export async function reviewQueue(scope: Scope) {
  if (scope === "onboarding") {
    const [{ data: subs }, { data: grades }] = await Promise.all([
      db.from("test_submissions").select("id, user_id, test_no, answers, status, score, submitted_at, test_bank:test_bank_id(title, kind, role_id, content), profile:user_id(full_name, username)").in("status", ["needs_review", "awaiting_ai"]).order("submitted_at").limit(100),
      db.from("grades").select("id, subject_type, subject_id, user_id, score, criteria, feedback, strengths, gaps, flags, model, needs_review, created_at, profile:user_id(full_name)").eq("needs_review", true).eq("is_final", true).eq("subject_type", "test_submission").order("created_at").limit(200),
    ]);
    return { test_submissions: subs ?? [], flagged_grades: grades ?? [] };
  }
  const [{ data: dels }, { data: grades }] = await Promise.all([
    db.from("deliverables").select("id, user_id, content, links, status, score, submitted_at, task:task_id(title, description, role_id), profile:user_id(full_name, username)").in("status", ["needs_review", "awaiting_ai"]).order("submitted_at").limit(100),
    db.from("grades").select("id, subject_type, subject_id, user_id, score, criteria, feedback, strengths, gaps, flags, model, needs_review, created_at, profile:user_id(full_name)").eq("needs_review", true).eq("is_final", true).in("subject_type", ["deliverable", "demo"]).order("created_at").limit(200),
  ]);
  return { deliverables: dels ?? [], flagged_grades: grades ?? [] };
}

/** Human grade: becomes the final grade for the item and unblocks the attempt/project. */
export async function resolveGrade(actorId: string, subjectType: string, subjectId: string, b: { score: number; feedback?: string; user_id?: string }, ip?: string) {
  if (!["test_submission", "deliverable", "demo"].includes(subjectType)) throw notFound();
  const table = subjectType === "test_submission" ? "test_submissions" : subjectType === "deliverable" ? "deliverables" : null;
  let userId = b.user_id;
  if (table) {
    const { data: row } = await db.from(table).select("user_id").eq("id", subjectId).single();
    userId = row?.user_id;
  }
  if (!userId) throw badRequest("user_id required");
  await db.from("grades").update({ is_final: false, needs_review: false }).eq("subject_type", subjectType).eq("subject_id", subjectId).eq("user_id", userId).eq("is_final", true);
  await db.from("grades").insert({ subject_type: subjectType, subject_id: subjectId, user_id: userId, grader: "human", score: b.score, feedback: b.feedback ?? null, criteria: {}, next_steps: [], is_final: true });
  if (table === "test_submissions") {
    const { data: sub } = await db.from("test_submissions").update({ score: b.score, status: "graded" }).eq("id", subjectId).select("attempt_id").single();
    if (sub) await maybeFinalizeAttempt(sub.attempt_id);
  } else if (table === "deliverables") {
    const { data: d } = await db.from("deliverables").update({ score: b.score, status: "graded" }).eq("id", subjectId).select("task_id, project_instance_id").single();
    if (d) {
      await db.from("team_tasks").update({ status: "done" }).eq("id", d.task_id);
      await enqueue("compute_project_results", { instanceId: d.project_instance_id, onlyIfComplete: true });
    }
  }
  await db.from("ai_decisions").update({ status: "overridden" }).eq("kind", "grading").eq("subject_id", subjectId);
  await audit(actorId, "grading.resolve", subjectType, subjectId, { score: b.score }, ip);
}

export async function listAppeals(scope: Scope) {
  const { data } = await db
    .from("appeals")
    .select("*, grade:grade_id(subject_type, subject_id, score, criteria, feedback, strengths, gaps, model, rubric_version), profile:user_id(full_name, username)")
    .order("due_at")
    .limit(200);
  return (data ?? []).filter((a: any) => SUBJECTS[scope].includes(a.grade?.subject_type));
}

export async function answerAppeal(actorId: string, scope: Scope, appealId: string, b: { status: "upheld" | "adjusted" | "rejected"; response: string; new_score?: number }, ip?: string) {
  const { data: appeal } = await db.from("appeals").select("*, grade:grade_id(*)").eq("id", appealId).single();
  if (!appeal || appeal.status !== "open") throw badRequest("Appeal is not open");
  const g = (appeal as any).grade;
  if (!SUBJECTS[scope].includes(g?.subject_type)) throw badRequest(scope === "onboarding" ? "Project appeals are handled in the AI PM portal." : "Onboarding appeals are handled in Admin.");
  await db.from("appeals").update({ status: b.status, response: b.response, new_score: b.new_score ?? null, resolved_by: actorId, resolved_at: new Date().toISOString() }).eq("id", appealId);
  if (b.status === "adjusted" && b.new_score !== undefined) {
    await db.from("grades").update({ is_final: false }).eq("id", g.id);
    await db.from("grades").insert({ ...g, id: undefined, created_at: undefined, updated_at: undefined, grader: "human", score: b.new_score, feedback: b.response, is_final: true, needs_review: false });
    if (g.subject_type === "test_submission") {
      const { data: sub } = await db.from("test_submissions").update({ score: b.new_score }).eq("id", g.subject_id).select("attempt_id").single();
      // Re-evaluate the attempt with the adjusted score.
      if (sub) {
        await db.from("test_attempts").update({ status: "grading" }).eq("id", sub.attempt_id).in("status", ["failed"]);
        const j = await getJourney(appeal.user_id);
        if (j.status === "TESTS_FAILED") await maybeFinalizeAttempt(sub.attempt_id);
      }
    } else if (g.subject_type === "deliverable") {
      await db.from("deliverables").update({ score: b.new_score }).eq("id", g.subject_id);
    }
  }
  await notify(appeal.user_id, "appeal.resolved", "Your appeal has been answered", b.response.slice(0, 200));
  await audit(actorId, "appeal.resolve", "appeal", appealId, { status: b.status, new_score: b.new_score }, ip);
}
