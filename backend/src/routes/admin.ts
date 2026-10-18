import { Router } from "express";
import { z } from "zod";
import { db, anon } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import { h, parse, uid } from "./util.js";
import { HttpError, notFound, badRequest } from "../lib/errors.js";
import { requireRole } from "../middleware/auth.js";
import { STATUSES, type JourneyStatus } from "../domain/journey.js";
import { ROLE_IDS } from "../domain/constants.js";
import { transition, getJourney } from "../services/journey.js";
import { refundPayment } from "../services/payments.js";
import { maybeFinalizeAttempt } from "../services/onboarding.js";
import { runMatching } from "../services/teams.js";
import { computeProjectResults } from "../services/projects.js";
import { issueCertificate } from "../services/certification.js";
import { shortlist, requestConsent, updateCandidateOutcome } from "../services/opportunities.js";
import { enqueue } from "../jobs/queue.js";

// ---------------------------------------------------------------------------
// Staff sign-in by username. The username -> email mapping stays server-side.
// ---------------------------------------------------------------------------
export const adminAuthRouter = Router();
adminAuthRouter.post(
  "/login",
  h(async (req) => {
    const { username, password } = parse(z.object({ username: z.string().min(3).max(64), password: z.string().min(6).max(200) }), req.body);
    const fail = new HttpError(401, "Invalid username or password");
    const { data: profile } = await db.from("profiles").select("id, app_role").ilike("username", username).maybeSingle();
    if (!profile || profile.app_role === "user") throw fail;
    const { data: u } = await db.auth.admin.getUserById(profile.id);
    if (!u.user?.email) throw fail;
    const { data, error } = await anon.auth.signInWithPassword({ email: u.user.email, password });
    if (error || !data.session) {
      await audit(profile.id, "admin.login_failed", "profile", profile.id, {}, req.ip);
      throw fail;
    }
    await audit(profile.id, "admin.login", "profile", profile.id, {}, req.ip);
    return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  }),
);

export const adminRouter = Router();
const staff = requireRole("moderator", "content_reviewer", "partnerships");
const adminOnly = requireRole();
const moderators = requireRole("moderator");
const reviewers = requireRole("content_reviewer");
const partnerships = requireRole("partnerships");

adminRouter.get("/whoami", staff, h(async (req) => ({ id: uid(req), role: req.user!.appRole, aal: req.user!.aal })));

// ---------------------------------------------------------------------------
// Overview: funnel, revenue, AI cost, pass rates
// ---------------------------------------------------------------------------
adminRouter.get(
  "/overview",
  staff,
  h(async () => {
    const counts = await Promise.all(
      STATUSES.map(async (s) => [s, (await db.from("user_journey").select("user_id", { count: "exact", head: true }).eq("status", s)).count ?? 0] as const),
    );
    const byStatus = Object.fromEntries(counts) as Record<JourneyStatus, number>;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [{ data: pays }, { data: calls }, { data: tests }, { data: projects }, { count: reviewQueue }, { count: appealsOpen }, { count: flagsOpen }, { data: budget }] = await Promise.all([
      db.from("payments").select("amount_kobo, plan_id, paid_at").eq("status", "success").gte("paid_at", since),
      db.from("ai_calls").select("feature, role_id, cost_usd, user_id, created_at, success").gte("created_at", monthStart.toISOString()),
      db.from("test_results").select("passed"),
      db.from("project_results").select("passed"),
      db.from("grades").select("id", { count: "exact", head: true }).eq("needs_review", true).eq("is_final", true),
      db.from("appeals").select("id", { count: "exact", head: true }).eq("status", "open"),
      db.from("integrity_flags").select("id", { count: "exact", head: true }).eq("status", "open"),
      db.from("feature_flags").select("value").eq("key", "monthly_ai_budget_usd").maybeSingle(),
    ]);

    const revenueByDay: Record<string, number> = {};
    for (const p of pays ?? []) {
      const d = (p.paid_at ?? "").slice(0, 10);
      revenueByDay[d] = (revenueByDay[d] ?? 0) + p.amount_kobo / 100;
    }
    const sum = (rows: Array<{ cost_usd: number }>) => rows.reduce((s, r) => s + Number(r.cost_usd), 0);
    const group = (key: "feature" | "role_id") => {
      const out: Record<string, number> = {};
      for (const c of calls ?? []) out[c[key] ?? "none"] = (out[c[key] ?? "none"] ?? 0) + Number(c.cost_usd);
      return out;
    };
    const spentUsd = sum(calls ?? []);
    const aiUsers = new Set((calls ?? []).map((c) => c.user_id).filter(Boolean)).size;
    const budgetUsd = Number((budget?.value as { amount?: number } | null)?.amount ?? env.AI_MONTHLY_BUDGET_USD);
    const costByDay: Record<string, number> = {};
    for (const c of calls ?? []) costByDay[c.created_at.slice(0, 10)] = (costByDay[c.created_at.slice(0, 10)] ?? 0) + Number(c.cost_usd);
    const rate = (rows: Array<{ passed: boolean }> | null) => (rows?.length ? Math.round((rows.filter((r) => r.passed).length / rows.length) * 100) : null);

    return {
      funnel: byStatus,
      revenue: { last30_ngn: (pays ?? []).reduce((s, p) => s + p.amount_kobo / 100, 0), by_day: revenueByDay, by_plan: { one_time: (pays ?? []).filter((p) => p.plan_id === "one_time").length, monthly: (pays ?? []).filter((p) => p.plan_id === "monthly").length } },
      ai: {
        month_spend_usd: spentUsd,
        month_spend_ngn: spentUsd * env.USD_TO_NGN,
        budget_usd: budgetUsd,
        budget_alert: spentUsd >= budgetUsd * 0.8,
        avg_cost_per_user_ngn: aiUsers ? (spentUsd * env.USD_TO_NGN) / aiUsers : 0,
        by_feature: group("feature"),
        by_role: group("role_id"),
        by_day: costByDay,
        calls: calls?.length ?? 0,
        failures: (calls ?? []).filter((c) => !c.success).length,
        configured: Boolean(env.ANTHROPIC_API_KEY),
      },
      pass_rates: { onboarding: rate(tests), projects: rate(projects) },
      queues: { review: reviewQueue ?? 0, appeals: appealsOpen ?? 0, integrity: flagsOpen ?? 0 },
    };
  }),
);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
adminRouter.get(
  "/users",
  staff,
  h(async (req) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    let query = db.from("profiles").select("id, full_name, username, role_id, app_role, is_minor, identity_verified, created_at, journey:user_journey(status, plan_id, attempts_used)").is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
    if (q) query = query.or(`full_name.ilike.%${q.replace(/[%,()]/g, "")}%,username.ilike.%${q.replace(/[%,()]/g, "")}%`);
    const { data } = await query;
    return (data ?? []).filter((u: any) => !status || u.journey?.status === status);
  }),
);

adminRouter.get(
  "/users/:id",
  staff,
  h(async (req) => {
    const id = req.params.id;
    const [{ data: profile }, journey, { data: events }, { data: payments }, { data: attempts }, { data: auth }, { data: idDocs }] = await Promise.all([
      db.from("profiles").select("*").eq("id", id).single(),
      getJourney(id),
      db.from("journey_events").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(30),
      db.from("payments").select("id, reference, plan_id, amount_kobo, status, paid_at").eq("user_id", id).order("created_at", { ascending: false }),
      db.from("test_attempts").select("*").eq("user_id", id),
      db.auth.admin.getUserById(id),
      db.from("reports").select("reason, created_at").eq("target_type", "identity_check").eq("target_id", id).order("created_at", { ascending: false }).limit(1),
    ]);
    if (!profile) throw notFound();
    const idDoc = idDocs?.[0] ? (await db.storage.from("submissions").createSignedUrl(idDocs[0].reason, 300)).data?.signedUrl : null;
    await audit(uid(req), "admin.view_user", "profile", id, { readonly: true }, req.ip);
    return { profile, email: auth.user?.email, journey, events, payments, attempts, identity_document_url: idDoc };
  }),
);

adminRouter.post(
  "/users/:id/status",
  moderators,
  h(async (req) => {
    const { to, reason } = parse(z.object({ to: z.enum(["SUSPENDED", "WITHDRAWN", "RESUME"]), reason: z.string().min(3) }), req.body);
    const j = await getJourney(req.params.id);
    if (to === "RESUME") {
      if (!j.resume_status) throw badRequest("Nothing to resume");
      await transition(req.params.id, j.resume_status, reason, { actorId: uid(req) });
    } else {
      await transition(req.params.id, to, reason, { actorId: uid(req) });
    }
    await audit(uid(req), `user.${to.toLowerCase()}`, "profile", req.params.id, { reason }, req.ip);
  }),
);

adminRouter.post(
  "/users/:id/reset-attempts",
  adminOnly,
  h(async (req) => {
    const { reason } = parse(z.object({ reason: z.string().min(3) }), req.body);
    await db.from("user_journey").update({ attempts_used: 0, next_attempt_at: null }).eq("user_id", req.params.id);
    await audit(uid(req), "user.reset_attempts", "profile", req.params.id, { reason }, req.ip);
  }),
);

adminRouter.post(
  "/users/:id/role",
  adminOnly,
  h(async (req) => {
    const b = parse(z.object({ role_id: z.enum(ROLE_IDS).optional(), app_role: z.enum(["user", "admin", "moderator", "content_reviewer", "partnerships"]).optional(), reason: z.string().min(3) }), req.body);
    await db.from("profiles").update({ ...(b.role_id ? { role_id: b.role_id } : {}), ...(b.app_role ? { app_role: b.app_role } : {}) }).eq("id", req.params.id);
    await audit(uid(req), "user.change_role", "profile", req.params.id, b, req.ip);
  }),
);

adminRouter.post(
  "/users/:id/verify-identity",
  moderators,
  h(async (req) => {
    const { verified } = parse(z.object({ verified: z.boolean() }), req.body);
    await db.from("profiles").update({ identity_verified: verified }).eq("id", req.params.id);
    await audit(uid(req), "user.verify_identity", "profile", req.params.id, { verified }, req.ip);
    if (verified) await enqueue("issue_certificate", { userId: req.params.id });
  }),
);

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
adminRouter.get(
  "/payments",
  adminOnly,
  h(async (req) => {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    let q = db.from("payments").select("id, user_id, reference, plan_id, amount_kobo, status, channel, paid_at, created_at, verified_via, profile:user_id(full_name, username)").order("created_at", { ascending: false }).limit(200);
    if (status) q = q.eq("status", status);
    const [{ data: payments }, { data: subs }, { data: refunds }, { data: events }] = await Promise.all([
      q,
      db.from("subscriptions").select("*, profile:user_id(full_name)").order("created_at", { ascending: false }).limit(100),
      db.from("refunds").select("*").order("created_at", { ascending: false }).limit(50),
      db.from("payment_events").select("id, event_type, reference, processed_at, error, created_at").not("error", "is", null).order("created_at", { ascending: false }).limit(50),
    ]);
    return { payments, subscriptions: subs, refunds, failed_events: events };
  }),
);
adminRouter.post(
  "/payments/:id/refund",
  adminOnly,
  h(async (req) => {
    const b = parse(z.object({ reason: z.string().min(3), override: z.boolean().default(false) }), req.body);
    return refundPayment(uid(req), req.params.id, b.reason, b.override);
  }),
);

// ---------------------------------------------------------------------------
// Content bank review (AI-generated content must be approved before use)
// ---------------------------------------------------------------------------
const CONTENT_TABLES = { tests: "test_bank", projects: "project_templates", personas: "company_personas", faq: "faq", kb: "kb_documents" } as const;
adminRouter.get(
  "/content/:kind",
  reviewers,
  h(async (req) => {
    const table = CONTENT_TABLES[req.params.kind as keyof typeof CONTENT_TABLES];
    if (!table) throw notFound();
    const status = typeof req.query.status === "string" ? req.query.status : null;
    const cols = table === "test_bank" ? "id, role_id, test_no, version, title, kind, status, content, answer_key, rubric_id, time_limit_min, updated_at" : "*";
    let q = db.from(table).select(cols).order("updated_at", { ascending: false }).limit(300);
    if (status) q = q.eq("status", status);
    const { data } = await q;
    return data ?? [];
  }),
);
adminRouter.post(
  "/content/:kind/:id/status",
  reviewers,
  h(async (req) => {
    const table = CONTENT_TABLES[req.params.kind as keyof typeof CONTENT_TABLES];
    if (!table) throw notFound();
    const { status } = parse(z.object({ status: z.enum(["draft", "approved", "retired"]) }), req.body);
    const patch: Record<string, unknown> = { status };
    if (table === "test_bank" && status === "approved") Object.assign(patch, { approved_by: uid(req), approved_at: new Date().toISOString() });
    await db.from(table).update(patch).eq("id", req.params.id);
    await audit(uid(req), `content.${status}`, table, req.params.id, {}, req.ip);
  }),
);
adminRouter.put(
  "/content/:kind/:id",
  reviewers,
  h(async (req) => {
    const table = CONTENT_TABLES[req.params.kind as keyof typeof CONTENT_TABLES];
    if (!table) throw notFound();
    const body = parse(z.record(z.string(), z.unknown()), req.body);
    delete body.id;
    // Edits send content back to draft so it's re-approved.
    await db.from(table).update({ ...body, status: "draft" }).eq("id", req.params.id);
    await audit(uid(req), "content.edit", table, req.params.id, { fields: Object.keys(body) }, req.ip);
  }),
);

// ---------------------------------------------------------------------------
// Grading: review queue (borderline/flagged/failed AI), appeals
// ---------------------------------------------------------------------------
adminRouter.get(
  "/grading/review",
  moderators,
  h(async () => {
    const [{ data: subs }, { data: dels }, { data: grades }] = await Promise.all([
      db.from("test_submissions").select("id, user_id, test_no, answers, status, score, test_bank:test_bank_id(title, kind, role_id, content)").in("status", ["needs_review", "awaiting_ai"]).order("submitted_at").limit(100),
      db.from("deliverables").select("id, user_id, content, links, status, score, task:task_id(title, description, role_id)").in("status", ["needs_review", "awaiting_ai"]).order("submitted_at").limit(100),
      db.from("grades").select("id, subject_type, subject_id, user_id, score, criteria, feedback, flags, model, needs_review, created_at").eq("needs_review", true).eq("is_final", true).order("created_at").limit(200),
    ]);
    return { test_submissions: subs ?? [], deliverables: dels ?? [], flagged_grades: grades ?? [] };
  }),
);

const Resolve = z.object({ score: z.number().min(0).max(100), feedback: z.string().max(4000).optional() });

/** Human grade: becomes the final grade for the item and unblocks the attempt/project. */
adminRouter.post(
  "/grading/:subjectType/:subjectId/resolve",
  moderators,
  h(async (req) => {
    const { subjectType, subjectId } = req.params;
    if (!["test_submission", "deliverable", "demo"].includes(subjectType)) throw notFound();
    const b = parse(Resolve.extend({ user_id: z.string().uuid().optional() }), req.body);
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
    await audit(uid(req), "grading.resolve", subjectType, subjectId, { score: b.score }, req.ip);
  }),
);

adminRouter.get(
  "/appeals",
  moderators,
  h(async () => {
    const { data } = await db.from("appeals").select("*, grade:grade_id(subject_type, subject_id, score, criteria, feedback, model, rubric_version), profile:user_id(full_name, username)").order("due_at").limit(200);
    return data ?? [];
  }),
);
adminRouter.post(
  "/appeals/:id",
  moderators,
  h(async (req) => {
    const b = parse(z.object({ status: z.enum(["upheld", "adjusted", "rejected"]), response: z.string().min(10).max(4000), new_score: z.number().min(0).max(100).optional() }), req.body);
    const { data: appeal } = await db.from("appeals").select("*, grade:grade_id(*)").eq("id", req.params.id).single();
    if (!appeal || appeal.status !== "open") throw badRequest("Appeal is not open");
    await db.from("appeals").update({ status: b.status, response: b.response, new_score: b.new_score ?? null, resolved_by: uid(req), resolved_at: new Date().toISOString() }).eq("id", req.params.id);
    if (b.status === "adjusted" && b.new_score !== undefined) {
      const g = (appeal as any).grade;
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
    await audit(uid(req), "appeal.resolve", "appeal", req.params.id, { status: b.status, new_score: b.new_score }, req.ip);
  }),
);

adminRouter.get(
  "/calibration",
  reviewers,
  h(async () => {
    const { data } = await db.from("calibration_samples").select("role_id, rubric_id, human_score, last_ai_score, last_run_at, last_prompt_version");
    const groups: Record<string, { n: number; within10: number; ran: number }> = {};
    for (const s of data ?? []) {
      const k = s.rubric_id;
      groups[k] ??= { n: 0, within10: 0, ran: 0 };
      groups[k].n++;
      if (s.last_ai_score !== null) {
        groups[k].ran++;
        if (Math.abs(Number(s.last_ai_score) - Number(s.human_score)) <= 10) groups[k].within10++;
      }
    }
    return groups;
  }),
);

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
adminRouter.get(
  "/teams",
  staff,
  h(async () => {
    const [{ data: teams }, { data: waiting }, { data: cohorts }] = await Promise.all([
      db.from("teams").select("id, name, archetype_id, status, current_level, score_band, created_at, members:team_members(id, user_id, role_id, is_standin, status, profile:user_id(full_name))").order("created_at", { ascending: false }).limit(200),
      db.from("offers").select("user_id, role_id, archetype_id, responded_at").eq("status", "accepted"),
      db.from("cohorts").select("*").order("start_date", { ascending: false }).limit(12),
    ]);
    return { teams: teams ?? [], waiting: waiting ?? [], cohorts: cohorts ?? [] };
  }),
);
adminRouter.post("/teams/run-matching", adminOnly, h(async (req) => {
  const formed = await runMatching();
  await audit(uid(req), "teams.run_matching", null, null, { formed }, req.ip);
  return { formed };
}));
adminRouter.post("/projects/:id/finalize", adminOnly, h(async (req) => {
  await computeProjectResults(req.params.id, false);
  await audit(uid(req), "project.finalize", "project_instance", req.params.id, {}, req.ip);
}));
adminRouter.post("/projects/:id/team-score", adminOnly, h(async (req) => {
  const { score } = parse(z.object({ score: z.number().min(0).max(100) }), req.body);
  await db.from("project_instances").update({ team_outcome_score: score }).eq("id", req.params.id);
  await audit(uid(req), "project.team_score", "project_instance", req.params.id, { score }, req.ip);
}));

// ---------------------------------------------------------------------------
// Integrity flags & moderation reports
// ---------------------------------------------------------------------------
adminRouter.get("/integrity", moderators, h(async () => {
  const [{ data: flags }, { data: reports }] = await Promise.all([
    db.from("integrity_flags").select("*, profile:user_id(full_name, username)").order("created_at", { ascending: false }).limit(200),
    db.from("reports").select("*").order("created_at", { ascending: false }).limit(200),
  ]);
  return { flags: flags ?? [], reports: reports ?? [] };
}));
adminRouter.post("/integrity/:id", moderators, h(async (req) => {
  const { status } = parse(z.object({ status: z.enum(["cleared", "confirmed"]) }), req.body);
  const { data } = await db.from("integrity_flags").update({ status, reviewed_by: uid(req) }).eq("id", req.params.id).select("user_id").single();
  await audit(uid(req), `integrity.${status}`, "integrity_flag", req.params.id, {}, req.ip);
  if (status === "cleared" && data) await enqueue("issue_certificate", { userId: data.user_id });
}));
adminRouter.post("/reports/:id", moderators, h(async (req) => {
  const { status } = parse(z.object({ status: z.enum(["actioned", "dismissed"]) }), req.body);
  await db.from("reports").update({ status, resolved_by: uid(req) }).eq("id", req.params.id);
  await audit(uid(req), `report.${status}`, "report", req.params.id, {}, req.ip);
}));

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------
adminRouter.get("/opportunities", partnerships, h(async () => {
  const { data } = await db.from("opportunities").select("*, candidates:opportunity_candidates(id, user_id, rank, fit_note, status, consent_at, profile:user_id(full_name, username))").order("created_at", { ascending: false });
  return data ?? [];
}));
adminRouter.post("/opportunities", partnerships, h(async (req) => {
  const b = parse(z.object({ company_name: z.string().min(2), role_id: z.enum(ROLE_IDS), level: z.string().optional(), location: z.string().optional(), start_date: z.string().optional(), notes: z.string().optional() }), req.body);
  const { data } = await db.from("opportunities").insert({ ...b, created_by: uid(req) }).select().single();
  await audit(uid(req), "opportunity.create", "opportunity", data!.id, b, req.ip);
  return data;
}));
adminRouter.post("/opportunities/:id/shortlist", partnerships, h(async (req) => shortlist(uid(req), req.params.id)));
adminRouter.post("/candidates/:id/request-consent", partnerships, h(async (req) => requestConsent(uid(req), req.params.id, parse(z.object({ fit_note: z.string().max(2000).optional() }), req.body).fit_note)));
adminRouter.post("/candidates/:id/outcome", partnerships, h(async (req) =>
  updateCandidateOutcome(uid(req), req.params.id, parse(z.object({ status: z.enum(["shared", "interview", "offer", "hired", "not_selected"]) }), req.body).status),
));

// ---------------------------------------------------------------------------
// Feature flags, audit log, manual certificate run
// ---------------------------------------------------------------------------
adminRouter.get("/flags", adminOnly, h(async () => (await db.from("feature_flags").select("*").order("key")).data ?? []));
adminRouter.put("/flags/:key", adminOnly, h(async (req) => {
  const b = parse(z.object({ enabled: z.boolean(), value: z.unknown().optional() }), req.body);
  await db.from("feature_flags").upsert({ key: req.params.key, enabled: b.enabled, value: b.value ?? null });
  await audit(uid(req), "flags.update", "feature_flag", req.params.key, b as Record<string, unknown>, req.ip);
}));
adminRouter.get("/audit", adminOnly, h(async () => (await db.from("audit_logs").select("*, actor:actor_id(full_name, username)").order("created_at", { ascending: false }).limit(300)).data ?? []));
adminRouter.post("/users/:id/issue-certificate", adminOnly, h(async (req) => {
  const r = await issueCertificate(req.params.id);
  await audit(uid(req), "cert.issue", "profile", req.params.id, { issued: Boolean(r) }, req.ip);
  return r ?? { issued: false, reason: "not eligible" };
}));
