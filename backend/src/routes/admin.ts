import { Router } from "express";
import { z } from "zod";
import { db, anon } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import { h, parse, uid } from "./util.js";
import { HttpError, notFound, badRequest, forbidden } from "../lib/errors.js";
import { requireRole, clearAuthCache } from "../middleware/auth.js";
import { STATUSES, type JourneyStatus } from "../domain/journey.js";
import { ROLE_IDS } from "../domain/constants.js";
import { transition, getJourney } from "../services/journey.js";
import { refundPayment } from "../services/payments.js";
import { runMatching } from "../services/teams.js";
import { computeProjectResults } from "../services/projects.js";
import { issueCertificate } from "../services/certification.js";
import { shortlist, requestConsent, updateCandidateOutcome } from "../services/opportunities.js";
import { enqueue } from "../jobs/queue.js";
import { getMaintenance, setMaintenance } from "../lib/maintenance.js";
import { Audience, audienceCount, CampaignInput, cancelSend, createCampaign, deleteCampaign, listCampaigns, previewHtml, sendTest, startSend, updateCampaign } from "../services/emailCampaigns.js";
import { listTicketsForStaff, getTicketForStaff, replyAsStaff, updateTicket } from "../services/support.js";
import { resetHelpCorpus } from "../services/help.js";
import { answerAppeal, listAppeals, resolveGrade, reviewQueue } from "../services/grading.js";
import { fundPool, grantTokens, paidMembers, poolSummary, updatePrice } from "../services/tokens.js";
import { createInvite, InviteInput, listInvites, portalFor, resendInvite, revokeInvite, staffHome, STAFF_ROLES } from "../services/staff.js";
import { aiConfigured, aiProvider } from "../ai/aiClient.js";

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
    return { access_token: data.session.access_token, refresh_token: data.session.refresh_token, app_role: profile.app_role, portal: portalFor(profile.app_role) };
  }),
);

export const adminRouter = Router();
const staff = requireRole("moderator", "content_reviewer", "partnerships");
const adminOnly = requireRole();
const moderators = requireRole("moderator");
const reviewers = requireRole("content_reviewer");
const partnerships = requireRole("partnerships");

adminRouter.get("/whoami", staff, h(async (req) => {
  const { data: p } = await db.from("profiles").select("full_name, username, staff_title").eq("id", uid(req)).single();
  return { id: uid(req), role: req.user!.appRole, aal: req.user!.aal, full_name: p?.full_name ?? null, username: p?.username ?? null, staff_title: p?.staff_title ?? null };
}));
// Each staff member's own home: the queues that matter for their role.
adminRouter.get("/home", staff, h(async (req) => staffHome(uid(req), req.user!.appRole)));

// ---------------------------------------------------------------------------
// Overview: funnel, revenue, AI cost, pass rates
// ---------------------------------------------------------------------------
adminRouter.get(
  "/overview",
  staff,
  h(async () => {
    // One read of every status instead of a count query per status.
    const { data: statuses } = await db.from("user_journey").select("status").limit(100000);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<JourneyStatus, number>;
    for (const r of statuses ?? []) byStatus[r.status as JourneyStatus]++;
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
        configured: aiConfigured(),
        provider: aiProvider(),
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
    let query = db.from("profiles").select("id, full_name, username, role_id, app_role, is_minor, identity_verified, created_at, journey:user_journey(status, plan_id, attempts_used)").is("deleted_at", null).eq("app_role", "user").order("created_at", { ascending: false }).limit(100);
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

/** Loads the target account and refuses changes that would weaken staff accounts. */
async function guardTarget(actor: { id: string; appRole: string }, targetId: string, action: string) {
  // select("*") so this keeps working before the is_protected migration is applied
  const { data: target } = await db.from("profiles").select("*").eq("id", targetId).maybeSingle();
  if (!target) throw notFound("User not found");
  if (target.is_protected) throw forbidden(`The main admin account can't be ${action}.`, "PROTECTED_ADMIN");
  if (target.id === actor.id) throw forbidden(`You can't ${action.replace(/ed$/, "")} your own account.`, "SELF_ACTION");
  if (target.app_role !== "user" && actor.appRole !== "admin") throw forbidden("Only admins can change other staff accounts.", "STAFF_TARGET");
  return target;
}

adminRouter.post(
  "/users/:id/status",
  moderators,
  h(async (req) => {
    const { to, reason } = parse(z.object({ to: z.enum(["SUSPENDED", "WITHDRAWN", "RESUME"]), reason: z.string().min(3) }), req.body);
    await guardTarget(req.user!, req.params.id, to === "RESUME" ? "changed" : "suspended");
    const j = await getJourney(req.params.id);
    if (to === "RESUME") {
      if (!j.resume_status) throw badRequest("Nothing to resume");
      await transition(req.params.id, j.resume_status, reason, { actorId: uid(req) });
    } else {
      await transition(req.params.id, to, reason, { actorId: uid(req) });
    }
    clearAuthCache(req.params.id);
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
    // Field (learner role) only; staff roles are managed under /staff.
    const b = parse(z.object({ role_id: z.enum(ROLE_IDS), reason: z.string().min(3) }), req.body);
    const { error } = await db.from("profiles").update({ role_id: b.role_id }).eq("id", req.params.id);
    if (error) throw badRequest(error.message);
    await audit(uid(req), "user.change_role", "profile", req.params.id, b, req.ip);
  }),
);

// ---------------------------------------------------------------------------
// Staff (the Huzzler team): who works here and what each person can do
// ---------------------------------------------------------------------------

adminRouter.get(
  "/staff",
  adminOnly,
  h(async () => {
    const { data } = await db.from("profiles").select("id, full_name, username, app_role, staff_title, is_protected, created_at, updated_at").neq("app_role", "user").is("deleted_at", null).order("app_role").order("full_name");
    const ids = new Set((data ?? []).map((p) => p.id));
    // Staff are few; reading auth users in pages beats one request per person.
    const users = new Map<string, { email?: string; last_sign_in_at?: string; factors?: Array<{ status: string }> }>();
    for (let page = 1; page <= 20 && users.size < ids.size; page++) {
      const { data: list } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      for (const u of list?.users ?? []) if (ids.has(u.id)) users.set(u.id, u as any);
      if ((list?.users ?? []).length < 1000) break;
    }
    return (data ?? []).map((p) => {
      const u = users.get(p.id);
      return { ...p, email: u?.email ?? null, last_sign_in_at: u?.last_sign_in_at ?? null, mfa: (u?.factors ?? []).some((f) => f.status === "verified") };
    });
  }),
);

/** Adds an existing account (found by username or email) to the staff. */
adminRouter.post(
  "/staff",
  adminOnly,
  h(async (req) => {
    const b = parse(z.object({ identifier: z.string().trim().min(3).max(200), app_role: z.enum(STAFF_ROLES), staff_title: z.string().trim().max(80).optional() }), req.body);
    let id: string | null = null;
    if (b.identifier.includes("@")) {
      const { data } = await db.rpc("user_id_by_email", { p_email: b.identifier.toLowerCase() });
      id = (data as string | null) ?? null;
    } else {
      const { data } = await db.from("profiles").select("id").ilike("username", b.identifier.replace(/^@/, "")).maybeSingle();
      id = data?.id ?? null;
    }
    if (!id) throw notFound("No account with that username or email. Ask them to sign up first.");
    const { data: p } = await db.from("profiles").select("app_role").eq("id", id).single();
    if (p && p.app_role !== "user") throw badRequest("That person is already on the staff. Edit their role instead.");
    const { error: addErr } = await db.from("profiles").update({ app_role: b.app_role, staff_title: b.staff_title || null }).eq("id", id);
    if (addErr) throw badRequest(addErr.message);
    clearAuthCache(id);
    await audit(uid(req), "staff.added", "profile", id, { app_role: b.app_role, staff_title: b.staff_title ?? null }, req.ip);
    return { id };
  }),
);

adminRouter.patch(
  "/staff/:id",
  adminOnly,
  h(async (req) => {
    const b = parse(z.object({ app_role: z.enum(STAFF_ROLES).optional(), staff_title: z.string().trim().max(80).nullable().optional(), reason: z.string().trim().min(3).max(500) }), req.body);
    const { data: p } = await db.from("profiles").select("*").eq("id", req.params.id).single();
    if (!p || p.app_role === "user") throw notFound("Staff member not found");
    if (b.app_role && b.app_role !== p.app_role) {
      if (p.is_protected) throw forbidden("The main admin account always keeps the admin role.", "PROTECTED_ADMIN");
      if (req.params.id === uid(req)) throw forbidden("You can't change your own role.", "SELF_ACTION");
    }
    if (b.app_role && b.app_role !== "admin" && p.app_role === "admin") await assertAnotherAdmin(req.params.id);
    const { error } = await db.from("profiles").update({ ...(b.app_role ? { app_role: b.app_role } : {}), ...(b.staff_title !== undefined ? { staff_title: b.staff_title || null } : {}) }).eq("id", req.params.id);
    if (error) throw forbidden(error.message.includes("admin") ? error.message : "That change isn't allowed.", "ROLE_CHANGE_REFUSED");
    clearAuthCache(req.params.id);
    await audit(uid(req), "staff.updated", "profile", req.params.id, { from: p.app_role, ...b }, req.ip);
  }),
);

adminRouter.delete(
  "/staff/:id",
  adminOnly,
  h(async (req) => {
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }), req.body);
    if (req.params.id === uid(req)) throw badRequest("You can't remove yourself from the staff.");
    const { data: p } = await db.from("profiles").select("*").eq("id", req.params.id).single();
    if (!p || p.app_role === "user") throw notFound("Staff member not found");
    if (p.is_protected) throw forbidden("The main admin account can't be removed from the staff.", "PROTECTED_ADMIN");
    if (p.app_role === "admin") await assertAnotherAdmin(req.params.id);
    const { error } = await db.from("profiles").update({ app_role: "user", staff_title: null }).eq("id", req.params.id);
    if (error) throw forbidden(error.message.includes("admin") ? error.message : "That change isn't allowed.", "ROLE_CHANGE_REFUSED");
    clearAuthCache(req.params.id);
    await audit(uid(req), "staff.removed", "profile", req.params.id, { from: p.app_role, reason }, req.ip);
  }),
);

// Invites: no account needed. The person sets their username and password from the email link.
adminRouter.get("/staff/invites", adminOnly, h(async () => listInvites()));
adminRouter.post("/staff/invites", adminOnly, h(async (req) => createInvite(uid(req), parse(InviteInput, req.body), req.ip)));
adminRouter.post("/staff/invites/:id/resend", adminOnly, h(async (req) => resendInvite(uid(req), parse(z.string().uuid(), req.params.id), req.ip)));
adminRouter.delete("/staff/invites/:id", adminOnly, h(async (req) => revokeInvite(uid(req), parse(z.string().uuid(), req.params.id), req.ip)));

async function assertAnotherAdmin(exceptId: string) {
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("app_role", "admin").neq("id", exceptId).is("deleted_at", null);
  if (!count) throw badRequest("Huzzler needs at least one admin. Make someone else an admin first.");
}

/** Records an ID decision, closes the waiting check and tells the learner. */
async function decideIdentity(actorId: string, userId: string, verified: boolean, note: string | undefined, ip: string | undefined) {
  await db.from("profiles").update({ identity_verified: verified }).eq("id", userId);
  await db.from("reports").update({ status: verified ? "actioned" : "dismissed", resolved_by: actorId }).eq("target_type", "identity_check").eq("target_id", userId).eq("status", "open");
  await audit(actorId, "user.verify_identity", "profile", userId, { verified, note }, ip);
  await notify(
    userId,
    "identity.reviewed",
    verified ? "Your ID is verified" : "We couldn't verify your ID",
    verified
      ? "Thanks. Your identity is verified, so your certificate will be issued as soon as everything else is complete."
      : `Please upload a clearer, valid government ID in Profile → Account & privacy.${note ? ` Reason: ${note}` : ""}`,
  );
  if (verified) await enqueue("issue_certificate", { userId });
}

adminRouter.post(
  "/users/:id/verify-identity",
  moderators,
  h(async (req) => {
    const { verified, note } = parse(z.object({ verified: z.boolean(), note: z.string().max(300).optional() }), req.body);
    await decideIdentity(uid(req), req.params.id, verified, note, req.ip);
  }),
);

// Uploaded IDs waiting for a decision, oldest first, each with a short-lived link to the file.
adminRouter.get(
  "/identity-checks",
  moderators,
  h(async () => {
    const { data } = await db
      .from("reports")
      .select("id, target_id, reason, created_at")
      .eq("target_type", "identity_check")
      .eq("status", "open")
      .order("created_at")
      .limit(50);
    // reports.target_id has no foreign key (it can point at anything), so profiles are looked up separately.
    const ids = [...new Set((data ?? []).map((r) => r.target_id))];
    const { data: people } = ids.length ? await db.from("profiles").select("id, full_name, username, role_id").in("id", ids) : { data: [] };
    const byId = new Map((people ?? []).map((p) => [p.id, p]));
    return Promise.all(
      (data ?? []).map(async (r) => ({
        id: r.id,
        user_id: r.target_id,
        name: byId.get(r.target_id)?.full_name ?? "Unknown",
        username: byId.get(r.target_id)?.username ?? null,
        role_id: byId.get(r.target_id)?.role_id ?? null,
        submitted_at: r.created_at,
        file_url: (await db.storage.from("submissions").createSignedUrl(r.reason, 600)).data?.signedUrl ?? null,
      })),
    );
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
    if (table === "faq") resetHelpCorpus();
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
// Grading (onboarding tests only): review queue and appeals. Project work is graded in the
// AI PM portal.
// ---------------------------------------------------------------------------
adminRouter.get("/grading/review", moderators, h(async () => reviewQueue("onboarding")));

const Resolve = z.object({ score: z.number().min(0).max(100), feedback: z.string().max(4000).optional() });

/** Human grade: becomes the final grade for the item and unblocks the attempt/project. */
adminRouter.post(
  "/grading/:subjectType/:subjectId/resolve",
  moderators,
  h(async (req) => resolveGrade(uid(req), req.params.subjectType, req.params.subjectId, parse(Resolve.extend({ user_id: z.string().uuid().optional() }), req.body), req.ip)),
);

adminRouter.get("/appeals", moderators, h(async () => listAppeals("onboarding")));
adminRouter.post(
  "/appeals/:id",
  moderators,
  h(async (req) =>
    answerAppeal(uid(req), "onboarding", req.params.id, parse(z.object({ status: z.enum(["upheld", "adjusted", "rejected"]), response: z.string().min(10).max(4000), new_score: z.number().min(0).max(100).optional() }), req.body), req.ip),
  ),
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
const listingRoles = requireRole("partnerships", "content_reviewer");
const Listing = z.object({
  name: z.string().trim().min(2).max(120),
  title: z.string().trim().min(3).max(120),
  archetype_id: z.enum(["web3_fintech", "saas_mobile", "data_driven", "infrastructure"]),
  engagement_type: z.enum(["internship", "job"]),
  location: z.string().trim().min(2).max(80),
  compensation: z.string().trim().max(80).nullable().optional(),
  stipend_tokens: z.number().int().min(0).max(100000),
  duration_weeks: z.number().int().min(1).max(52),
  logo_text: z.string().trim().max(3).nullable().optional(),
  role_ids: z.array(z.enum(ROLE_IDS)).max(8).default([]),
  mission: z.string().trim().min(10).max(300),
  product_brief: z.string().trim().min(20).max(1500),
  culture: z.string().trim().min(5).max(300),
  status: z.enum(["draft", "approved", "retired"]).default("approved"),
});

/** Opportunity listings (company personas): what learners are offered after passing onboarding. */
adminRouter.get("/listings", listingRoles, h(async () => {
  const [{ data: listings }, { data: offers }] = await Promise.all([
    db.from("company_personas").select("*").order("status").order("sort_order").order("name"),
    db.from("offers").select("persona_id, status"),
  ]);
  const stats = new Map<string, Record<string, number>>();
  for (const o of offers ?? []) {
    const k = stats.get(o.persona_id) ?? {};
    k[o.status] = (k[o.status] ?? 0) + 1;
    stats.set(o.persona_id, k);
  }
  return (listings ?? []).map((l) => ({ ...l, offer_stats: stats.get(l.id) ?? {} }));
}));
adminRouter.post("/listings", listingRoles, h(async (req) => {
  const b = parse(Listing, req.body);
  const { data, error } = await db.from("company_personas").insert({ ...b, logo_text: b.logo_text || b.name.slice(0, 1).toUpperCase() }).select().single();
  if (error) throw badRequest(error.message);
  await audit(uid(req), "listing.create", "company_persona", data.id, { name: b.name }, req.ip);
  return data;
}));
adminRouter.put("/listings/:id", listingRoles, h(async (req) => {
  const b = parse(Listing.partial(), req.body);
  const { data, error } = await db.from("company_personas").update(b).eq("id", parse(z.string().uuid(), req.params.id)).select().maybeSingle();
  if (error) throw badRequest(error.message);
  if (!data) throw notFound("Listing not found");
  await audit(uid(req), "listing.update", "company_persona", req.params.id, { fields: Object.keys(b) }, req.ip);
  return data;
}));
adminRouter.delete("/listings/:id", listingRoles, h(async (req) => {
  const id = parse(z.string().uuid(), req.params.id);
  const { count } = await db.from("offers").select("id", { count: "exact", head: true }).eq("persona_id", id);
  // Listings that were already offered to someone are retired (kept for their offer history).
  if (count) {
    await db.from("company_personas").update({ status: "retired" }).eq("id", id);
    await audit(uid(req), "listing.retire", "company_persona", id, { offers: count }, req.ip);
    return { retired: true };
  }
  const { error } = await db.from("company_personas").delete().eq("id", id);
  if (error) throw badRequest(error.message);
  await audit(uid(req), "listing.delete", "company_persona", id, {}, req.ip);
  return { deleted: true };
}));

/** Every offer sent to learners, newest first, with simple actions. */
adminRouter.get("/offers", partnerships, h(async (req) => {
  const status = typeof req.query.status === "string" && req.query.status ? req.query.status : null;
  let q = db.from("offers").select("id, user_id, status, title, compensation, stipend_tokens, stipend_paid, match_score, expires_at, responded_at, created_at, persona:persona_id(name, logo_text), profile:user_id(full_name, username)").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  return (await q).data ?? [];
}));
adminRouter.post("/offers/:id/extend", partnerships, h(async (req) => {
  const { hours } = parse(z.object({ hours: z.number().int().min(1).max(336) }), req.body);
  const { data: o } = await db.from("offers").select("status, expires_at").eq("id", req.params.id).maybeSingle();
  if (!o || !["pending", "expired"].includes(o.status)) throw badRequest("Only open or expired offers can be extended.");
  const from = Math.max(Date.now(), new Date(o.expires_at).getTime());
  await db.from("offers").update({ status: "pending", expires_at: new Date(from + hours * 3_600_000).toISOString() }).eq("id", req.params.id);
  await audit(uid(req), "offer.extend", "offer", req.params.id, { hours }, req.ip);
}));
adminRouter.post("/offers/:id/withdraw", partnerships, h(async (req) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }), req.body);
  const { data } = await db.from("offers").update({ status: "expired" }).eq("id", req.params.id).eq("status", "pending").select("user_id").maybeSingle();
  if (!data) throw badRequest("Only open offers can be withdrawn.");
  await notify(data.user_id, "offers.withdrawn", "An offer was withdrawn", "One of your opportunities is no longer available. We'll send another if you have none left.");
  await enqueue("generate_offers", { userId: data.user_id });
  await audit(uid(req), "offer.withdraw", "offer", req.params.id, { reason }, req.ip);
}));

// ---------------------------------------------------------------------------
// Tokens: the funding pool admins top up and grant from, prices, purchases
// ---------------------------------------------------------------------------
adminRouter.get("/tokens", adminOnly, h(async () => poolSummary()));
adminRouter.get("/tokens/members", adminOnly, h(async (req) => paidMembers(typeof req.query.q === "string" ? req.query.q : "")));
adminRouter.post("/tokens/fund", adminOnly, h(async (req) => {
  const b = parse(z.object({ amount: z.number().int().min(1).max(10_000_000), note: z.string().trim().min(3).max(200) }), req.body);
  return fundPool(uid(req), b.amount, b.note, req.ip);
}));
adminRouter.post("/tokens/grant", adminOnly, h(async (req) => {
  const b = parse(z.object({ amount: z.number().int().min(1).max(100_000), note: z.string().trim().max(200).default(""), user_id: z.string().uuid().optional(), all_paid: z.boolean().optional() }), req.body);
  return grantTokens(uid(req), { user_id: b.user_id, all_paid: b.all_paid }, b.amount, b.note, req.ip);
}));
adminRouter.put("/tokens/prices/:action", adminOnly, h(async (req) => updatePrice(uid(req), req.params.action, parse(z.object({ cost: z.number().int().min(0).max(10_000) }), req.body).cost, req.ip)));

// Hiring partners: real company requests for certified learners.
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

// ---------------------------------------------------------------------------
// Maintenance mode: takes the learner site offline while staff keep working
// ---------------------------------------------------------------------------
adminRouter.get("/maintenance", adminOnly, h(async () => getMaintenance()));
adminRouter.put(
  "/maintenance",
  adminOnly,
  h(async (req) => {
    const b = parse(z.object({ enabled: z.boolean(), message: z.string().trim().max(500).nullable().optional(), eta: z.string().datetime({ offset: true }).nullable().optional() }), req.body);
    const m = await setMaintenance(b.enabled, b.message ?? null, b.eta ?? null);
    await audit(uid(req), b.enabled ? "maintenance.on" : "maintenance.off", null, null, { message: b.message ?? null, eta: b.eta ?? null }, req.ip);
    return m;
  }),
);

// ---------------------------------------------------------------------------
// Bulk email (announcements)
// ---------------------------------------------------------------------------
adminRouter.get("/emails", adminOnly, h(async () => listCampaigns()));
adminRouter.get(
  "/emails/audience",
  adminOnly,
  h(async (req) => audienceCount(parse(Audience, { segment: req.query.segment ?? "all", role_id: typeof req.query.role_id === "string" && req.query.role_id ? req.query.role_id : null }))),
);
adminRouter.post("/emails/preview", adminOnly, h(async (req) => {
  const b = parse(z.object({ subject: z.string().max(150), body: z.string().max(20000) }), req.body);
  return { html: previewHtml(b.subject || "(no subject)", b.body || "Your message will appear here.") };
}));
adminRouter.post("/emails", adminOnly, h(async (req) => createCampaign(uid(req), parse(CampaignInput, req.body))));
adminRouter.put("/emails/:id", adminOnly, h(async (req) => updateCampaign(req.params.id, parse(CampaignInput, req.body))));
adminRouter.delete("/emails/:id", adminOnly, h(async (req) => deleteCampaign(uid(req), req.params.id)));
adminRouter.post("/emails/:id/test", adminOnly, h(async (req) => sendTest(uid(req), req.params.id)));
adminRouter.post("/emails/:id/send", adminOnly, h(async (req) => startSend(uid(req), req.params.id)));
adminRouter.post("/emails/:id/cancel", adminOnly, h(async (req) => cancelSend(uid(req), req.params.id)));
// Support inbox (report an issue)
// ---------------------------------------------------------------------------
adminRouter.get("/support", moderators, h(async (req) => listTicketsForStaff(typeof req.query.status === "string" ? req.query.status : undefined)));
adminRouter.get("/support/:id", moderators, h(async (req) => getTicketForStaff(parse(z.string().uuid(), req.params.id))));
adminRouter.post(
  "/support/:id/messages",
  moderators,
  h(async (req) => replyAsStaff(uid(req), parse(z.string().uuid(), req.params.id), parse(z.object({ body: z.string().trim().min(1).max(5000) }), req.body).body, req.ip)),
);
adminRouter.patch(
  "/support/:id",
  moderators,
  h(async (req) =>
    updateTicket(
      uid(req),
      parse(z.string().uuid(), req.params.id),
      parse(
        z.object({
          status: z.enum(["open", "awaiting_user", "resolved", "closed"]).optional(),
          priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
          assigned_to: z.string().uuid().nullable().optional(),
        }).refine((v) => Object.keys(v).length > 0, "Nothing to update"),
        req.body,
      ),
      req.ip,
    ),
  ),
);

// ---------------------------------------------------------------------------
// Help bot: questions it couldn't answer, and FAQ management (the bot's knowledge base)
// ---------------------------------------------------------------------------
adminRouter.get("/help/queries", reviewers, h(async (req) => {
  const onlyUnanswered = req.query.unanswered !== "false";
  let q = db.from("help_queries").select("id, question, answered, source, score, helpful, created_at").order("created_at", { ascending: false }).limit(200);
  if (onlyUnanswered) q = q.or("answered.eq.false,helpful.eq.false");
  return (await q).data ?? [];
}));
const FaqInput = z.object({ question: z.string().trim().min(5).max(300), answer: z.string().trim().min(10).max(3000), role_id: z.enum(ROLE_IDS).nullable().optional() });
adminRouter.post("/faq", reviewers, h(async (req) => {
  const b = parse(FaqInput, req.body);
  const { data, error } = await db.from("faq").insert({ ...b, role_id: b.role_id ?? null, status: "approved" }).select().single();
  if (error) throw badRequest(error.message);
  resetHelpCorpus();
  await audit(uid(req), "faq.create", "faq", data.id, {}, req.ip);
  return data;
}));
adminRouter.put("/faq/:id", reviewers, h(async (req) => {
  const b = parse(FaqInput.partial(), req.body);
  const { data, error } = await db.from("faq").update(b).eq("id", parse(z.string().uuid(), req.params.id)).select().single();
  if (error || !data) throw notFound("FAQ not found");
  resetHelpCorpus();
  await audit(uid(req), "faq.update", "faq", req.params.id, {}, req.ip);
  return data;
}));
