import crypto from "node:crypto";
import { db, must } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { notify, emailUser, emailLayout } from "../lib/notify.js";
import { render } from "../lib/templates.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { HINTS_PER_TASK, INACTIVITY_REMOVE_DAYS, INACTIVITY_WARN_DAYS, MAX_FAILED_PROJECTS, PROJECT_PASS_MARK } from "../domain/constants.js";
import { peerScore, projectTotal, reliabilityScore, round2 } from "../domain/grading.js";
import { projectStatus } from "../domain/journey.js";
import { PROJECT_INTRO, STANDUP_SUMMARY, NUDGE_OVERDUE } from "../content/templates.js";
import { projectGuide } from "../content/projectGuide.js";
import { transition, getJourney } from "./journey.js";
import { postSystemMessage, removeMember, assertTeamMember, ensureSeated } from "./teams.js";
import { gradeSubjectWithAi } from "./aiGrading.js";
import { checkSimilarity } from "./integrity.js";
import { enqueue } from "../jobs/queue.js";
import { audit } from "../lib/audit.js";
import { pmWindowOver, reviewTeamProject, type TeamReview } from "./teamReview.js";

const DAY = 86_400_000;

type TemplateTask = {
  key: string;
  role_id: string;
  title: string;
  description: string;
  milestone_key: string;
  depends_on?: string[];
  hints: string[];
  standin_deliverable?: string;
};

/** Copies the project template into a live project: milestones, role tasks, due dates. No AI. */
export async function startProject(teamId: string, level: number) {
  const { data: team } = await db.from("teams").select("*").eq("id", teamId).single();
  if (!team) throw notFound("team");
  const { data: tpl } = await db
    .from("project_templates")
    .select("*")
    .eq("archetype_id", team.archetype_id)
    .eq("level", level)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (!tpl) throw new Error(`No approved project template for ${team.archetype_id} level ${level}`);

  const start = new Date();
  const instance = must(
    await db
      .from("project_instances")
      .insert({ team_id: teamId, template_id: tpl.id, level, due_at: new Date(start.getTime() + tpl.length_days * DAY).toISOString(), repo_url: tpl.starter_repo_url })
      .select()
      .single(),
    "project instance",
  );

  const milestoneRows = (tpl.milestones as Array<{ key: string; title: string; day_offset: number }>).map((m) => ({
    project_instance_id: instance.id, key: m.key, title: m.title, due_at: new Date(start.getTime() + m.day_offset * DAY).toISOString(),
  }));
  const milestones = must(await db.from("milestones").insert(milestoneRows).select("id, key, due_at"), "milestones");
  const mByKey = new Map(milestones.map((m) => [m.key, m]));

  const { data: members } = await db.from("team_members").select("id, user_id, role_id, is_standin").eq("team_id", teamId).eq("status", "active");
  const byRole = new Map<string, NonNullable<typeof members>>();
  for (const m of members ?? []) byRole.set(m.role_id, [...(byRole.get(m.role_id) ?? []), m]);

  // Tasks for roles not on this team are dropped; same-role members split tasks round-robin.
  const tasks = (tpl.role_tasks as TemplateTask[]).filter((t) => byRole.has(t.role_id));
  const rr = new Map<string, number>();
  const rows = tasks.map((t, i) => {
    const pool = byRole.get(t.role_id)!;
    const idx = rr.get(t.role_id) ?? 0;
    rr.set(t.role_id, idx + 1);
    const assignee = pool[idx % pool.length];
    const ms = mByKey.get(t.milestone_key);
    return {
      project_instance_id: instance.id, milestone_id: ms?.id ?? null, template_task_key: t.key, role_id: t.role_id,
      assignee_id: assignee.user_id, assignee_member_id: assignee.id, title: t.title, description: t.description,
      hints: t.hints.slice(0, HINTS_PER_TASK), rubric_id: `${t.role_id}.project`, due_at: ms?.due_at ?? instance.due_at, sort_order: i,
      status: "todo",
    };
  });
  const inserted = must(await db.from("team_tasks").insert(rows).select("id, template_task_key, assignee_member_id, status"), "tasks");
  const idByKey = new Map(inserted.map((r) => [r.template_task_key, r.id]));
  for (const t of tasks) {
    if (t.depends_on?.length) {
      await db.from("team_tasks").update({ depends_on: t.depends_on.map((k) => idByKey.get(k)).filter(Boolean) }).eq("id", idByKey.get(t.key)!);
    }
  }
  // Stand-ins start on their unblocked tasks straight away so dependants aren't held up.
  if ((members ?? []).some((m) => m.is_standin)) await enqueue("standin_work", { teamId });

  await db.from("teams").update({ current_level: level }).eq("id", teamId);
  for (const m of members ?? []) {
    if (!m.user_id) continue;
    const j = await getJourney(m.user_id);
    const target = projectStatus(level);
    if (j.status !== target && j.status !== "LAPSED" && j.status !== "SUSPENDED") await transition(m.user_id, target, `project ${level} started`).catch((err) => logger.warn({ err: String(err) }, "project transition skipped"));
  }
  if (level > 1) {
    await postSystemMessage(teamId, render(PROJECT_INTRO, { level, project_title: tpl.title, days: tpl.length_days, due_date: new Date(instance.due_at).toDateString(), brief: tpl.brief }));
  }
  return { ...instance, title: tpl.title };
}

/**
 * Someone joining a running project (an open seat, not a stand-in's) gets the template tasks for
 * their role in it. Tasks that already exist for the role are left alone.
 */
export async function addRoleTasks(teamId: string, memberId: string, userId: string, roleId: string) {
  const project = await currentProject(teamId);
  if (!project || project.status !== "active") return 0;
  const { data: tpl } = await db.from("project_templates").select("role_tasks").eq("id", project.template_id).single();
  const wanted = ((tpl?.role_tasks ?? []) as TemplateTask[]).filter((t) => t.role_id === roleId);
  if (!wanted.length) return 0;
  const [{ data: existing }, { data: milestones }] = await Promise.all([
    db.from("team_tasks").select("template_task_key").eq("project_instance_id", project.id),
    db.from("milestones").select("id, key, due_at").eq("project_instance_id", project.id),
  ]);
  const have = new Set((existing ?? []).map((t) => t.template_task_key));
  const mByKey = new Map((milestones ?? []).map((m) => [m.key, m]));
  const rows = wanted
    .filter((t) => !have.has(t.key))
    .map((t, i) => ({
      project_instance_id: project.id, milestone_id: mByKey.get(t.milestone_key)?.id ?? null, template_task_key: t.key, role_id: t.role_id,
      assignee_id: userId, assignee_member_id: memberId, title: t.title, description: t.description, hints: t.hints.slice(0, HINTS_PER_TASK),
      rubric_id: `${t.role_id}.project`, due_at: mByKey.get(t.milestone_key)?.due_at ?? project.due_at, sort_order: 100 + i, status: "todo",
    }));
  if (rows.length) must(await db.from("team_tasks").insert(rows).select("id"), "joiner tasks");
  return rows.length;
}

export async function currentProject(teamId: string) {
  const { data } = await db.from("project_instances").select("*, template:template_id(title, brief, length_days, acceptance_tests, assets)").eq("team_id", teamId).order("level", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function workspace(userId: string) {
  const teamId = await ensureSeated(userId).catch(() => null);
  const m = teamId ? { team_id: teamId } : null;
  if (!m) return null;
  const project = await currentProject(m.team_id);
  if (!project) return { project: null, milestones: [], tasks: [] };
  const [{ data: milestones }, { data: tasks }, { data: myCheckin }, { data: results }, { data: team }] = await Promise.all([
    db.from("milestones").select("*").eq("project_instance_id", project.id).order("due_at"),
    db.from("team_tasks").select("id, milestone_id, role_id, assignee_id, assignee_member_id, title, description, depends_on, due_at, status, sort_order").eq("project_instance_id", project.id).order("sort_order"),
    db.from("checkins").select("id").eq("project_instance_id", project.id).eq("user_id", userId).eq("checkin_date", new Date().toISOString().slice(0, 10)).maybeSingle(),
    db.from("project_results").select("project_instance_id, total, passed, deliverables_score, team_score, peer_score, reliability_score").eq("user_id", userId),
    db.from("teams").select("archetype_id").eq("id", m.team_id).single(),
  ]);
  return {
    project, milestones: milestones ?? [], tasks: tasks ?? [], checkedInToday: Boolean(myCheckin), results: results ?? [],
    guide: projectGuide(project.level), roadmap: team ? await roadmap(team.archetype_id) : [],
  };
}

/** The five projects a squad of this company type works through, newest approved version of each. */
async function roadmap(archetypeId: string) {
  const { data } = await db.from("project_templates").select("level, version, title, brief, length_days").eq("archetype_id", archetypeId).eq("status", "approved").order("version", { ascending: false });
  const byLevel = new Map<number, { level: number; title: string; brief: string; length_days: number }>();
  for (const t of data ?? []) if (!byLevel.has(t.level)) byLevel.set(t.level, { level: t.level, title: t.title, brief: t.brief, length_days: t.length_days });
  return [...byLevel.values()].sort((a, b) => a.level - b.level);
}

async function loadTaskForUser(userId: string, taskId: string) {
  const { data: task } = await db.from("team_tasks").select("*, project:project_instance_id(id, team_id, status, level)").eq("id", taskId).single();
  if (!task) throw notFound();
  const member = await assertTeamMember(userId, (task as any).project.team_id);
  if (!member) throw forbidden();
  return { task: task as any, member };
}

export async function updateTask(userId: string, taskId: string, patch: { status?: string; sort_order?: number; due_at?: string }) {
  const { task, member } = await loadTaskForUser(userId, taskId);
  const isPm = member.role_id === "product_manager";
  const update: Record<string, unknown> = {};
  if (patch.status) {
    if (task.assignee_id !== userId && !isPm) throw forbidden("Only the assignee or PM can change this task.");
    if (patch.status === "done") throw badRequest("Tasks are completed by submitting a deliverable.");
    if (patch.status === "in_progress" && task.depends_on?.length) {
      const { data: deps } = await db.from("team_tasks").select("status").in("id", task.depends_on);
      if (deps?.some((d) => d.status !== "done")) update.status = "blocked";
    }
    update.status ??= patch.status;
  }
  // The PM can reorder within the sprint; due dates can't move past the project deadline.
  if (patch.sort_order !== undefined || patch.due_at) {
    if (!isPm) throw forbidden("Only the PM can reorder the sprint.");
    if (patch.sort_order !== undefined) update.sort_order = patch.sort_order;
    if (patch.due_at) {
      const { data: pi } = await db.from("project_instances").select("due_at").eq("id", task.project_instance_id).single();
      if (new Date(patch.due_at) > new Date(pi!.due_at)) throw badRequest("Due date can't be after the project deadline.");
      update.due_at = patch.due_at;
    }
  }
  return must(await db.from("team_tasks").update(update).eq("id", taskId).select().single(), "task update");
}

export async function getTaskDetail(userId: string, taskId: string) {
  const { task } = await loadTaskForUser(userId, taskId);
  const [{ data: unlocks }, { data: deliverables }] = await Promise.all([
    db.from("hint_unlocks").select("hint_index").eq("task_id", taskId).eq("user_id", userId),
    db.from("deliverables").select("id, content, links, status, score, submitted_at, user_id, standin_member_id").eq("task_id", taskId).order("submitted_at", { ascending: false }),
  ]);
  const unlocked = new Set((unlocks ?? []).map((u) => u.hint_index));
  const hints = (task.hints as string[]).map((h, i) => (unlocked.has(i) ? { index: i, text: h } : { index: i, locked: true }));
  const ids = (deliverables ?? []).map((d) => d.id);
  const { data: grades } = ids.length ? await db.from("grades").select("id, subject_id, score, criteria, strengths, gaps, next_steps, feedback").in("subject_id", ids).eq("is_final", true) : { data: [] };
  return { task, hints, mentorOpen: unlocked.size >= HINTS_PER_TASK, deliverables: (deliverables ?? []).map((d) => ({ ...d, grade: (grades ?? []).find((g) => g.subject_id === d.id) ?? null })) };
}

/** Hints unlock strictly in order. */
export async function unlockHint(userId: string, taskId: string) {
  const { task } = await loadTaskForUser(userId, taskId);
  const { data: unlocks } = await db.from("hint_unlocks").select("hint_index").eq("task_id", taskId).eq("user_id", userId);
  const next = unlocks?.length ?? 0;
  if (next >= (task.hints as string[]).length) throw conflict("All hints are unlocked. Mentor chat is open.");
  await db.from("hint_unlocks").insert({ user_id: userId, task_id: taskId, hint_index: next });
  return { index: next, text: (task.hints as string[])[next], mentorOpen: next + 1 >= HINTS_PER_TASK };
}

export async function submitDeliverable(userId: string, taskId: string, input: { content: string; links: string[]; file_paths: string[]; ai_declaration: boolean }) {
  const { task } = await loadTaskForUser(userId, taskId);
  if (task.assignee_id !== userId) throw forbidden("Only the assignee can submit this task.");
  if (task.project.status !== "active") throw conflict("This project is closed.");
  if (!input.ai_declaration) throw badRequest("Please confirm the work is your own.", "DECLARATION_REQUIRED");
  for (const p of input.file_paths) if (!p.startsWith(`${userId}/`)) throw forbidden("Invalid file");
  const d = must(
    await db.from("deliverables").insert({ task_id: taskId, project_instance_id: task.project_instance_id, user_id: userId, content: input.content, links: input.links, file_paths: input.file_paths, ai_declaration: true, status: "grading" }).select().single(),
    "deliverable",
  );
  await db.from("team_tasks").update({ status: "review" }).eq("id", taskId);
  await enqueue("grade_deliverable", { deliverableId: d.id }, { jobId: `grade-del-${d.id}` });
  return d;
}

export async function gradeDeliverable(deliverableId: string) {
  const d = must(await db.from("deliverables").select("*").eq("id", deliverableId).single(), "deliverable");
  if (d.status === "graded" || d.status === "needs_review") return;
  const task = must(await db.from("team_tasks").select("*, project:project_instance_id(team_id, level, template:template_id(title, brief))").eq("id", d.task_id).single(), "task") as any;
  const res = await gradeSubjectWithAi(
    { subjectType: "deliverable", subjectId: d.id },
    {
      feature: "project_grading",
      userId: d.user_id,
      roleId: task.role_id,
      rubricId: task.rubric_id ?? `${task.role_id}.project`,
      taskPrompt: `Project level ${task.project.level}: ${task.project.template.title}\n${task.project.template.brief}\n\nTask: ${task.title}\n${task.description}`,
      submission: `${d.content}${(d.links as string[]).length ? `\n\nLinks: ${(d.links as string[]).join(", ")}` : ""}`,
    },
  );
  if (res.state === "awaiting_ai") {
    await db.from("deliverables").update({ status: "awaiting_ai" }).eq("id", d.id);
    return;
  }
  await db.from("deliverables").update({ status: res.state === "graded" ? "graded" : "needs_review", score: res.score }).eq("id", d.id);
  await db.from("team_tasks").update({ status: "done" }).eq("id", d.task_id);
  await checkSimilarity("deliverable", d.id, d.user_id, task.template_task_key, d.content).catch(() => {});
  await maybeCloseMilestones(task.project_instance_id);
  // This may unblock a stand-in's task.
  await enqueue("standin_work", { teamId: task.project.team_id });
}

export async function maybeCloseMilestones(instanceId: string) {
  const { data: tasks } = await db.from("team_tasks").select("milestone_id, status").eq("project_instance_id", instanceId);
  const byMs = new Map<string, string[]>();
  for (const t of tasks ?? []) if (t.milestone_id) byMs.set(t.milestone_id, [...(byMs.get(t.milestone_id) ?? []), t.status]);
  for (const [ms, statuses] of byMs) if (statuses.every((s) => s === "done")) await db.from("milestones").update({ status: "submitted" }).eq("id", ms).eq("status", "open");
  if ((tasks ?? []).every((t) => t.status === "done")) {
    const { data: pi } = await db.from("project_instances").select("team_id, level").eq("id", instanceId).single();
    await postSystemMessage(pi!.team_id, `✅ Every task in project ${pi!.level} is done. Please submit peer reviews for each teammate — results are computed once they're in (or 3 days after the deadline).`);
  }
}

export async function submitCheckin(userId: string, input: { yesterday: string; today: string; blockers?: string }) {
  const { data: m } = await db.from("team_members").select("team_id").eq("user_id", userId).eq("status", "active").order("joined_at", { ascending: false }).limit(1).maybeSingle();
  if (!m) throw forbidden("You're not on a team yet.");
  const project = await currentProject(m.team_id);
  if (!project || project.status !== "active") throw conflict("No active project.");
  const { error } = await db.from("checkins").insert({ team_id: m.team_id, project_instance_id: project.id, user_id: userId, ...input });
  if (error?.code === "23505") throw conflict("You've already checked in today.");
  if (error) throw error;
  return { ok: true };
}

/** Code (not AI) compiles the day's check-ins into one team chat message. */
export async function compileStandups() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: teams } = await db.from("teams").select("id").eq("status", "active");
  for (const t of teams ?? []) {
    const { data: checkins } = await db.from("checkins").select("user_id, yesterday, today, blockers, profile:user_id(full_name)").eq("team_id", t.id).eq("checkin_date", today);
    const { data: members } = await db.from("team_members").select("user_id, profile:user_id(full_name)").eq("team_id", t.id).eq("status", "active").not("user_id", "is", null);
    const done = new Set((checkins ?? []).map((c) => c.user_id));
    const first = (p: any) => (p?.full_name ?? "Teammate").split(" ")[0];
    const entries = (checkins ?? []).map((c: any) => `• ${first(c.profile)}: ✅ ${c.yesterday} → 🎯 ${c.today}${c.blockers ? ` ⚠️ Blocker: ${c.blockers}` : ""}`).join("\n");
    const missing = (members ?? []).filter((m) => !done.has(m.user_id)).map((m: any) => first(m.profile));
    if (!entries && !missing.length) continue;
    await postSystemMessage(t.id, render(STANDUP_SUMMARY, { date: today, entries: entries || "No check-ins yet.", missing: missing.length ? `Still to check in: ${missing.join(", ")}` : "Everyone checked in 🙌" }));
  }
}

/** Overdue / blocked task nudges (scheduled, no AI). */
export async function sendNudges() {
  const { data: overdue } = await db.from("team_tasks").select("id, title, due_at, assignee_id, project:project_instance_id(team_id, status)").in("status", ["todo", "in_progress", "blocked"]).lt("due_at", new Date().toISOString()).not("assignee_id", "is", null);
  for (const t of (overdue ?? []) as any[]) {
    if (t.project?.status !== "active") continue;
    await notify(t.assignee_id, "task.overdue", "Task overdue", render(NUDGE_OVERDUE, { task: t.title, due: new Date(t.due_at).toDateString() }), { taskId: t.id });
  }
}

export async function submitPeerReviews(userId: string, instanceId: string, reviews: Array<{ reviewee_id: string; ratings: Record<string, number>; comment?: string }>) {
  const { data: pi } = await db.from("project_instances").select("team_id, status").eq("id", instanceId).single();
  if (!pi) throw notFound();
  if (!(await assertTeamMember(userId, pi.team_id))) throw forbidden();
  const { data: mates } = await db.from("team_members").select("user_id").eq("team_id", pi.team_id).eq("status", "active").not("user_id", "is", null);
  const allowed = new Set((mates ?? []).map((m) => m.user_id).filter((u) => u !== userId));
  const rows = reviews.filter((r) => allowed.has(r.reviewee_id)).map((r) => ({ project_instance_id: instanceId, reviewer_id: userId, reviewee_id: r.reviewee_id, ratings: r.ratings, comment: r.comment ?? null }));
  if (!rows.length) throw badRequest("No valid reviews");
  await db.from("peer_reviews").upsert(rows, { onConflict: "project_instance_id,reviewer_id,reviewee_id" });
  await enqueue("compute_project_results", { instanceId, onlyIfComplete: true });
  return { ok: true };
}

export async function submitDemo(userId: string, instanceId: string, input: { summary: string; video_url?: string }) {
  const { data: pi } = await db.from("project_instances").select("team_id, level, status").eq("id", instanceId).single();
  if (!pi || pi.level !== 5) throw badRequest("Demo day is part of the capstone (project 5).");
  const member = await assertTeamMember(userId, pi.team_id);
  if (!member) throw forbidden();
  const existing = await db.from("grades").select("id").eq("subject_type", "demo").eq("subject_id", instanceId).eq("user_id", userId).maybeSingle();
  if (existing.data) throw conflict("You've already submitted your demo summary.");
  await enqueue("grade_demo", { instanceId, userId, roleId: member.role_id, summary: input.summary, videoUrl: input.video_url ?? null });
  return { ok: true };
}

export async function gradeDemo(p: { instanceId: string; userId: string; roleId: string; summary: string; videoUrl: string | null }) {
  const res = await gradeSubjectWithAi(
    { subjectType: "demo", subjectId: p.instanceId },
    {
      feature: "demo_grading", userId: p.userId, roleId: p.roleId, rubricId: "common.demo",
      taskPrompt: "Capstone demo day: summarise your own contribution to the product your team built.",
      submission: `${p.summary}${p.videoUrl ? `\n\nRecording: ${p.videoUrl}` : ""}`,
    },
  );
  if (res.state === "awaiting_ai") throw new Error("AI not configured; demo grading will retry");
  // Demo grades always get an admin look (brief: AI rubric plus peer and admin review).
  if (res.gradeId) await db.from("grades").update({ needs_review: true }).eq("id", res.gradeId);
}

/** Signed token GitHub Actions uses to post acceptance-test results for a project. */
export const ciToken = (instanceId: string) => crypto.createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY).update(`ci:${instanceId}`).digest("hex").slice(0, 40);

export async function recordCiResult(instanceId: string, token: string, passed: number, total: number) {
  const expected = ciToken(instanceId);
  if (token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw forbidden();
  const score = total ? round2((passed / total) * 100) : 0;
  await db.from("project_instances").update({ team_outcome_score: score }).eq("id", instanceId);
  return { score };
}

/**
 * Per-user project results: deliverables 50 (incl. capstone demo), team outcome 25, peers 15,
 * reliability 10. Runs when all tasks are done and peer reviews are in, or 3 days after the deadline.
 */
export async function computeProjectResults(instanceId: string, onlyIfComplete = false) {
  const pi = must(await db.from("project_instances").select("*").eq("id", instanceId).single(), "instance");
  if (pi.status === "completed") return;
  const { data: members } = await db.from("team_members").select("user_id, role_id").eq("team_id", pi.team_id).eq("status", "active").not("user_id", "is", null);
  const userIds = (members ?? []).map((m) => m.user_id as string);
  const { data: tasks } = await db.from("team_tasks").select("id, assignee_id, status, due_at").eq("project_instance_id", instanceId);
  const { data: reviews } = await db.from("peer_reviews").select("reviewer_id, reviewee_id, ratings").eq("project_instance_id", instanceId);
  const { data: dels } = await db.from("deliverables").select("id, task_id, user_id, score, status, submitted_at").eq("project_instance_id", instanceId);

  const pastGrace = Date.now() > new Date(pi.due_at).getTime() + 3 * DAY;
  const allDone = (tasks ?? []).every((t) => t.status === "done");
  const pendingGrades = (dels ?? []).some((d) => d.status === "grading" || d.status === "awaiting_ai" || d.status === "needs_review");
  const reviewsIn = userIds.every((u) => (reviews ?? []).filter((r) => r.reviewer_id === u).length >= Math.min(2, userIds.length - 1));
  if (pendingGrades) return;
  if (onlyIfComplete && !(allDone && reviewsIn)) return;
  if (!onlyIfComplete && !allDone && !pastGrace) return;

  const { data: claimed } = await db.from("project_instances").update({ status: "grading" }).eq("id", instanceId).eq("status", "active").select("id");
  if (!claimed?.length) return;

  const deliverableAvg = (u: string) => {
    const mine = (tasks ?? []).filter((t) => t.assignee_id === u);
    if (!mine.length) return 0;
    const scores = mine.map((t) => {
      const best = (dels ?? []).filter((d) => d.task_id === t.id && d.user_id === u).map((d) => Number(d.score ?? 0));
      return best.length ? Math.max(...best) : 0;
    });
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };
  const teamDeliverableAvg = userIds.length ? userIds.map(deliverableAvg).reduce((a, b) => a + b, 0) / userIds.length : 0;
  // Team outcome: CI acceptance tests or a PM-confirmed score when set; otherwise the AI team review
  // (when the key is set), falling back to the team's average deliverable score.
  let teamScore: number;
  if (pi.team_outcome_score !== null) {
    teamScore = Number(pi.team_outcome_score);
  } else {
    let review = (pi.team_review as TeamReview | null) ?? null;
    if (!review) {
      review = await reviewTeamProject(instanceId, teamDeliverableAvg).catch((err) => {
        logger.error({ err: String(err), instanceId }, "team review failed; using the deliverable average");
        return null;
      });
      if (review) await db.from("project_instances").update({ team_review: review }).eq("id", instanceId);
      if (review?.status === "needs_pm") await notifyPms(pi.team_id, pi.level, review);
    }
    if (review?.status === "needs_pm" && !pmWindowOver(review)) {
      // Wait for a PM in AI PM → Project grading. Reopen so their confirmation (or a run after the
      // window) can close the project.
      await db.from("project_instances").update({ status: "active" }).eq("id", instanceId).eq("status", "grading");
      return;
    }
    teamScore = review ? review.score : teamDeliverableAvg;
    if (review) {
      const settled: TeamReview = review.status === "needs_pm" ? { ...review, status: "applied", reason: `${review.reason ?? "Needed a PM"}; no PM confirmed within the window, so the AI score was applied.` } : review;
      await db.from("project_instances").update({ team_outcome_score: teamScore, team_review: settled }).eq("id", instanceId);
    }
  }

  const { data: checkins } = await db.from("checkins").select("user_id").eq("project_instance_id", instanceId);
  const checkinDays = Math.max(1, Math.round((Math.min(Date.now(), new Date(pi.due_at).getTime()) - new Date(pi.started_at).getTime()) / DAY) - Math.floor(((new Date(pi.due_at).getTime() - new Date(pi.started_at).getTime()) / DAY / 7) * 2));

  for (const u of userIds) {
    let deliverables = deliverableAvg(u);
    if (pi.level === 5) {
      const { data: demo } = await db.from("grades").select("score").eq("subject_type", "demo").eq("subject_id", instanceId).eq("user_id", u).eq("is_final", true).maybeSingle();
      deliverables = (deliverables * 3 + Number(demo?.score ?? 0)) / 4;
    }
    const mineReviews = (reviews ?? []).filter((r) => r.reviewee_id === u).map((r) => r.ratings as Record<string, number>);
    const myTasks = (tasks ?? []).filter((t) => t.assignee_id === u);
    const onTime = myTasks.filter((t) => {
      const sub = (dels ?? []).filter((d) => d.task_id === t.id && d.user_id === u).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))[0];
      return sub && t.due_at && new Date(sub.submitted_at) <= new Date(t.due_at);
    }).length;
    const reliability = reliabilityScore({ tasksDue: myTasks.length, tasksOnTime: onTime, checkinDays, checkinsDone: (checkins ?? []).filter((c) => c.user_id === u).length });
    // Squads with no other real member (only AI stand-ins), or whose teammates never reviewed them,
    // have no peer input: the AI PM team review stands in so nobody loses 15% for something they can't control.
    const peer = mineReviews.length ? peerScore(mineReviews) : round2(teamScore);
    const { total, passed } = projectTotal({ deliverables, team: teamScore, peer, reliability });
    await db.from("project_results").upsert(
      { project_instance_id: instanceId, user_id: u, deliverables_score: round2(deliverables), team_score: round2(teamScore), peer_score: peer, reliability_score: reliability, total, passed, peer_review_count: mineReviews.length },
      { onConflict: "project_instance_id,user_id" },
    );
    await notify(u, "project.result", `Project ${pi.level} results`, passed ? `You passed with ${total}%.` : `You scored ${total}% (pass mark ${PROJECT_PASS_MARK}%). A remediation task has been added.`);
    if (!passed) await handleFailedProject(u, pi.team_id, pi.level);
  }

  await db.from("project_instances").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", instanceId);

  if (pi.level < 5) {
    await startProject(pi.team_id, pi.level + 1);
  } else {
    await db.from("teams").update({ status: "completed" }).eq("id", pi.team_id);
    for (const u of userIds) await enqueue("issue_certificate", { userId: u });
  }
}

async function handleFailedProject(userId: string, teamId: string, level: number) {
  const j = await getJourney(userId);
  const failed = j.failed_projects + 1;
  await db.from("user_journey").update({ failed_projects: failed }).eq("user_id", userId);
  if (failed >= MAX_FAILED_PROJECTS) {
    await removeMember(userId, `failed ${failed} projects`, { journeyTo: "OFFER_PENDING" });
    await notify(userId, "track.removed", "You've been moved to a new cohort", "After two failed projects you're off this team, but you can rejoin a new cohort. Your work is saved.");
    await enqueue("generate_offers", { userId });
    return;
  }
  await notify(userId, "project.remediation", "Remediation task", `Review the feedback on your project ${level} deliverables and resubmit your weakest one this week. You stay with your team.`);
  await postSystemMessage(teamId, `A teammate has a remediation task from project ${level}. They stay with the team.`);
}

/**
 * Inactivity: no squad work (check-ins, deliverables, chat, meeting notes) on an active project for
 * INACTIVITY_WARN_DAYS -> warning; INACTIVITY_REMOVE_DAYS -> removed from the squad, a stand-in takes the
 * seat, and they choose a new opportunity. Signing in alone doesn't count. The clock starts no earlier
 * than when they joined or the project started.
 */
export async function runInactivityCheck() {
  const { data: members } = await db.from("team_members").select("user_id, team_id, joined_at").eq("status", "active").not("user_id", "is", null);
  if (!members?.length) return;
  const { data: projects } = await db.from("project_instances").select("team_id, started_at").eq("status", "active").in("team_id", [...new Set(members.map((m) => m.team_id))]);
  const started = new Map((projects ?? []).map((p) => [p.team_id as string, new Date(p.started_at).getTime()]));
  // Squads between projects (or waiting on grades) have nothing to do yet.
  const working = members.filter((m) => started.has(m.team_id));
  if (!working.length) return;

  const ids = working.map((m) => m.user_id as string);
  const since = new Date(Date.now() - INACTIVITY_REMOVE_DAYS * DAY).toISOString();
  const [checkins, deliverables, messages, meetings, journeys, warnings] = await Promise.all([
    db.from("checkins").select("user_id, created_at").in("user_id", ids).gte("created_at", since),
    db.from("deliverables").select("user_id, created_at").in("user_id", ids).gte("created_at", since),
    db.from("messages").select("user_id, created_at").in("user_id", ids).eq("kind", "user").gte("created_at", since),
    db.from("team_meetings").select("user_id:created_by, created_at").in("created_by", ids).gte("created_at", since),
    db.from("user_journey").select("user_id, status").in("user_id", ids),
    db.from("notifications").select("user_id, created_at").in("user_id", ids).eq("type", "team.inactive").gte("created_at", since),
  ]);
  for (const r of [checkins, deliverables, messages, meetings, journeys, warnings]) if (r.error) throw new Error(`inactivity check: ${r.error.message}`);
  const lastWork = new Map<string, number>();
  for (const r of [...checkins.data!, ...deliverables.data!, ...messages.data!, ...meetings.data!] as Array<{ user_id: string; created_at: string }>) {
    lastWork.set(r.user_id, Math.max(lastWork.get(r.user_id) ?? 0, new Date(r.created_at).getTime()));
  }
  const status = new Map(journeys.data!.map((j) => [j.user_id as string, j.status as string]));
  const warnedAt = new Map<string, number>();
  for (const w of warnings.data!) warnedAt.set(w.user_id, Math.max(warnedAt.get(w.user_id) ?? 0, new Date(w.created_at).getTime()));

  for (const m of working) {
    // A lapsed plan has its own path (handleLapsedMember / backfillLapsed).
    if (status.get(m.user_id) === "LAPSED") continue;
    const last = Math.max(lastWork.get(m.user_id) ?? 0, new Date(m.joined_at).getTime(), started.get(m.team_id)!);
    const days = (Date.now() - last) / DAY;
    // Nobody is removed without a warning first (e.g. already past the line when this rule shipped).
    const warned = (warnedAt.get(m.user_id) ?? 0) > last;
    if (days >= INACTIVITY_REMOVE_DAYS && warned) {
      await removeMember(m.user_id, `inactive for ${INACTIVITY_REMOVE_DAYS} days`, { journeyTo: "OFFER_PENDING" });
      const body = `There were no check-ins, deliverables or messages from you for ${INACTIVITY_REMOVE_DAYS} days, so an AI stand-in has taken your seat. Your progress is saved. Choose a new opportunity to join another squad.`;
      await notify(m.user_id, "team.removed", "You've been removed from your squad", body);
      await emailUser(m.user_id, "You've been removed from your Huzzler squad", emailLayout("You've been removed from your squad", `<p>${body}</p>`, { label: "Choose a new opportunity", url: `${env.APP_URL}/opportunities` }));
      await enqueue("generate_offers", { userId: m.user_id });
    } else if (days >= INACTIVITY_WARN_DAYS && !warned) {
      const body = `You haven't checked in, submitted work or messaged your squad for ${INACTIVITY_WARN_DAYS} days. Do one of those within 24 hours or your seat goes to an AI stand-in and you'll need to choose a new opportunity.`;
      await notify(m.user_id, "team.inactive", "Your squad needs you", body);
      await emailUser(m.user_id, "Your Huzzler squad needs you", emailLayout("Your squad needs you", `<p>${body}</p>`, { label: "Open your workspace", url: `${env.APP_URL}/workspace` }));
    }
  }
}

/** After a monthly plan lapses: team is told now, the role is backfilled 3 days later. */
export async function handleLapsedMember(userId: string) {
  const { data: m } = await db.from("team_members").select("team_id").eq("user_id", userId).eq("status", "active").order("joined_at", { ascending: false }).limit(1).maybeSingle();
  if (!m) return;
  await postSystemMessage(m.team_id, "A teammate's access is paused (plan lapsed). If they don't renew in 3 days, a stand-in takes over their role.");
}

export async function backfillLapsed() {
  const cutoff = new Date(Date.now() - 3 * DAY).toISOString();
  const { data } = await db.from("user_journey").select("user_id").eq("status", "LAPSED").lt("lapsed_at", cutoff);
  for (const j of data ?? []) await removeMember(j.user_id, "lapsed");
}

/** Projects past deadline + 3 days get finalised even if reviews are missing. */
export async function finalizeOverdueProjects() {
  const cutoff = new Date(Date.now() - 3 * DAY).toISOString();
  const { data } = await db.from("project_instances").select("id").eq("status", "active").lt("due_at", cutoff);
  for (const p of data ?? []) await computeProjectResults(p.id, false);
}

/** Tells project managers (and admins) that a team review needs their confirmation. */
async function notifyPms(teamId: string, level: number, review: TeamReview) {
  const [{ data: staff }, { data: team }] = await Promise.all([
    db.from("profiles").select("id").in("app_role", ["admin", "project_manager"]).is("deleted_at", null),
    db.from("teams").select("name").eq("id", teamId).single(),
  ]);
  for (const s of staff ?? []) await notify(s.id, "team_review.needs_pm", "Team review needs you", `${team?.name ?? "A squad"} project ${level}: AI proposes ${review.score}/100. ${review.reason ?? ""}`.trim(), { teamId });
}

/** A PM confirms or overrides the AI's team score; the project then closes with that score. */
export async function confirmTeamReview(actorId: string, instanceId: string, score: number, note?: string) {
  const { data: pi } = await db.from("project_instances").select("id, status, team_review").eq("id", instanceId).maybeSingle();
  if (!pi) throw notFound("project");
  if (pi.status === "completed") throw conflict("This project is already closed.");
  const review = pi.team_review as TeamReview | null;
  const updated = review ? { ...review, status: "confirmed" as const, confirmed_by: actorId, ...(note ? { pm_note: note } : {}), ...(score !== review.score ? { pm_score: score } : {}) } : null;
  await db.from("project_instances").update({ team_outcome_score: score, team_review: updated }).eq("id", instanceId);
  if (review && score !== review.score) await db.from("ai_decisions").update({ status: "overridden" }).eq("kind", "team_review").eq("subject_id", instanceId);
  await audit(actorId, "aipm.team_review_confirmed", "project_instance", instanceId, { score, ai_score: review?.score ?? null });
  await computeProjectResults(instanceId, false);
  return { score };
}

/** Team reviews waiting for a PM, plus the latest applied ones for context. */
export async function teamReviews() {
  const { data } = await db
    .from("project_instances")
    .select("id, level, status, due_at, team_review, team_outcome_score, team:team_id(id, name), template:template_id(title)")
    .not("team_review", "is", null)
    .order("updated_at", { ascending: false })
    .limit(40);
  return (data ?? []).map((p: any) => ({ ...p, pending: p.team_review?.status === "needs_pm" && p.status !== "completed" }));
}
