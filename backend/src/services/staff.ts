import crypto from "node:crypto";
import { z } from "zod";
import { db, anon, must } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { audit } from "../lib/audit.js";
import { emailLayout, escapeHtml, sendEmail } from "../lib/notify.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { clearAuthCache } from "../middleware/auth.js";

// Staff invites: an admin types an email and a role; the person gets a link, sets their name,
// username and password, and lands in their own dashboard. No Huzzler account needed beforehand.

export const STAFF_ROLES = ["admin", "moderator", "content_reviewer", "partnerships", "project_manager"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  moderator: "Moderator",
  content_reviewer: "Content reviewer",
  partnerships: "Partnerships",
  project_manager: "Project manager",
};
const INVITE_DAYS = 7;

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
export const portalFor = (role: string) => (role === "project_manager" ? "/aipm" : "/admin");

export const InviteInput = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  app_role: z.enum(STAFF_ROLES),
  staff_title: z.string().trim().max(80).optional(),
});

async function sendInviteEmail(email: string, role: StaffRole, title: string | null, token: string, inviter: string) {
  const link = `${env.APP_URL}/invite/${token}`;
  const r = await sendEmail(
    email,
    `You're invited to join the Huzzler team as ${ROLE_LABEL[role].toLowerCase()}`,
    emailLayout(
      "You're invited to the Huzzler team",
      `<p>${escapeHtml(inviter)} has invited you to join Huzzler as <b>${escapeHtml(ROLE_LABEL[role])}</b>${title ? ` (${escapeHtml(title)})` : ""}.</p><p>Open the link to choose your username and password. It works for ${INVITE_DAYS} days.</p><p style="font-size:13px;color:#6b7280;word-break:break-all">${escapeHtml(link)}</p>`,
      { label: "Accept the invite", url: link },
    ),
  );
  return { link, emailed: r.ok };
}

export async function listInvites() {
  const { data } = await db
    .from("staff_invites")
    .select("id, email, app_role, staff_title, status, expires_at, last_sent_at, accepted_at, created_at, inviter:invited_by(full_name, username)")
    .in("status", ["pending"])
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((i) => ({ ...i, expired: new Date(i.expires_at) < new Date() }));
}

export async function createInvite(actorId: string, input: z.infer<typeof InviteInput>, ip?: string) {
  const { data: existingId } = await db.rpc("user_id_by_email", { p_email: input.email });
  if (existingId) {
    const { data: p } = await db.from("profiles").select("app_role").eq("id", existingId as string).maybeSingle();
    if (p && p.app_role !== "user") throw conflict("That person is already on the staff. Change their role in the list below.");
  }
  // A new invite to the same address replaces the old one.
  await db.from("staff_invites").update({ status: "revoked" }).ilike("email", input.email).eq("status", "pending");
  const token = crypto.randomBytes(32).toString("base64url");
  const row = must(
    await db
      .from("staff_invites")
      .insert({ email: input.email, app_role: input.app_role, staff_title: input.staff_title || null, token_hash: hashToken(token), invited_by: actorId, expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString() })
      .select("id")
      .single(),
    "invite",
  );
  const { data: me } = await db.from("profiles").select("full_name").eq("id", actorId).single();
  const sent = await sendInviteEmail(input.email, input.app_role, input.staff_title || null, token, me?.full_name ?? "The Huzzler team");
  await audit(actorId, "staff.invited", "staff_invite", row.id, { email: input.email, app_role: input.app_role, emailed: sent.emailed }, ip);
  return { id: row.id, ...sent };
}

export async function resendInvite(actorId: string, inviteId: string, ip?: string) {
  const { data: inv } = await db.from("staff_invites").select("*").eq("id", inviteId).maybeSingle();
  if (!inv || inv.status !== "pending") throw notFound("Invite not found");
  const token = crypto.randomBytes(32).toString("base64url");
  await db.from("staff_invites").update({ token_hash: hashToken(token), expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(), last_sent_at: new Date().toISOString() }).eq("id", inviteId);
  const { data: me } = await db.from("profiles").select("full_name").eq("id", actorId).single();
  const sent = await sendInviteEmail(inv.email, inv.app_role, inv.staff_title, token, me?.full_name ?? "The Huzzler team");
  await audit(actorId, "staff.invite_resent", "staff_invite", inviteId, { emailed: sent.emailed }, ip);
  return sent;
}

export async function revokeInvite(actorId: string, inviteId: string, ip?: string) {
  const { data } = await db.from("staff_invites").update({ status: "revoked" }).eq("id", inviteId).eq("status", "pending").select("id");
  if (!data?.length) throw notFound("Invite not found");
  await audit(actorId, "staff.invite_revoked", "staff_invite", inviteId, {}, ip);
}

async function loadInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) throw notFound("This invite link isn't valid.");
  const { data: inv } = await db.from("staff_invites").select("*").eq("token_hash", hashToken(token)).maybeSingle();
  if (!inv || inv.status === "revoked") throw notFound("This invite link isn't valid any more. Ask an admin to send a new one.");
  if (inv.status === "accepted") throw conflict("This invite has already been used. Sign in instead.", "INVITE_USED");
  if (new Date(inv.expires_at) < new Date()) throw conflict("This invite has expired. Ask an admin to send a new one.", "INVITE_EXPIRED");
  return inv;
}

/** Public: what the invite is for, so the page can greet the person. */
export async function inviteInfo(token: string) {
  const inv = await loadInvite(token);
  const { data: existingId } = await db.rpc("user_id_by_email", { p_email: inv.email });
  return { email: inv.email, app_role: inv.app_role, role_label: ROLE_LABEL[inv.app_role as StaffRole], staff_title: inv.staff_title, has_account: Boolean(existingId), portal: portalFor(inv.app_role) };
}

// Name and username are only needed for a new account; an existing account keeps its own.
export const AcceptInput = z.object({
  full_name: z.string().trim().min(2).max(80).optional(),
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/, "3-24 letters, numbers or underscores").optional(),
  password: z.string().min(1).max(200),
});

/**
 * Accepts an invite. New people get an account (email already confirmed: the invite link proves
 * they own the address). Someone who already has a Huzzler account confirms with their password.
 */
export async function acceptInvite(token: string, input: z.infer<typeof AcceptInput>, ip?: string) {
  const inv = await loadInvite(token);
  const { data: existingId } = await db.rpc("user_id_by_email", { p_email: inv.email });
  let userId = existingId as string | null;

  if (userId) {
    const { error } = await anon.auth.signInWithPassword({ email: inv.email, password: input.password });
    if (error) throw forbidden("That password doesn't match your existing Huzzler account. Use your current password.", "WRONG_PASSWORD");
  } else {
    if (!input.full_name || !input.username) throw badRequest("Add your full name and a username.");
    if (input.password.length < 8) throw badRequest("Use a password of at least 8 characters.");
    const { data: taken } = await db.from("profiles").select("id").ilike("username", input.username).maybeSingle();
    if (taken) throw conflict("That username is taken. Try another.", "USERNAME_TAKEN");
    const { data, error } = await db.auth.admin.createUser({ email: inv.email, password: input.password, email_confirm: true, user_metadata: { full_name: input.full_name } });
    if (error || !data.user) throw badRequest(error?.message ?? "Couldn't create the account.");
    userId = data.user.id;
  }

  // Claim the invite first so a double submit can't apply it twice.
  const { data: claimed } = await db.from("staff_invites").update({ status: "accepted", accepted_by: userId, accepted_at: new Date().toISOString() }).eq("id", inv.id).eq("status", "pending").select("id");
  if (!claimed?.length) throw conflict("This invite has already been used. Sign in instead.", "INVITE_USED");

  const { data: profile } = await db.from("profiles").select("username, full_name").eq("id", userId).single();
  let username = profile?.username ?? null;
  if (!username) {
    // Staff sign in with a username, so an existing account without one gets one now.
    const wanted = input.username ?? `${inv.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 18)}_${crypto.randomBytes(2).toString("hex")}`;
    const { data: taken } = await db.from("profiles").select("id").ilike("username", wanted).neq("id", userId).maybeSingle();
    if (taken) throw conflict("That username is taken. Try another.", "USERNAME_TAKEN");
    username = wanted;
  }
  const { error: upErr } = await db
    .from("profiles")
    .update({ app_role: inv.app_role, staff_title: inv.staff_title, username, full_name: profile?.full_name || input.full_name || null })
    .eq("id", userId);
  if (upErr) throw badRequest(upErr.message);
  clearAuthCache(userId);
  await audit(userId, "staff.invite_accepted", "staff_invite", inv.id, { app_role: inv.app_role }, ip);
  return { username, app_role: inv.app_role, portal: portalFor(inv.app_role) };
}

/** Role-specific home for the admin dashboard: what this person should look at first. */
export async function staffHome(userId: string, role: string) {
  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const head = { count: "exact" as const, head: true };
  const { data: me } = await db.from("profiles").select("full_name, staff_title, username").eq("id", userId).single();
  const sees = (...roles: string[]) => role === "admin" || roles.includes(role);
  const [support, onboardingReview, appeals, drafts, helpGaps, listings, pendingOffers, pool] = await Promise.all([
    sees("moderator") ? count(db.from("support_tickets").select("id", head).eq("status", "open")) : null,
    sees("moderator") ? count(db.from("test_submissions").select("id", head).in("status", ["needs_review", "awaiting_ai"])) : null,
    sees("moderator") ? count(db.from("appeals").select("id", head).eq("status", "open")) : null,
    sees("content_reviewer") ? count(db.from("test_bank").select("id", head).eq("status", "draft")) : null,
    sees("content_reviewer") ? count(db.from("help_queries").select("id", head).eq("answered", false)) : null,
    sees("partnerships", "content_reviewer") ? count(db.from("company_personas").select("id", head).eq("status", "approved")) : null,
    sees("partnerships") ? count(db.from("offers").select("id", head).eq("status", "pending")) : null,
    role === "admin" ? db.from("token_pool").select("balance").eq("id", 1).maybeSingle().then((r) => Number(r.data?.balance ?? 0)) : null,
  ]);
  return {
    full_name: me?.full_name ?? null,
    username: me?.username ?? null,
    staff_title: me?.staff_title ?? null,
    role,
    cards: [
      support !== null && { key: "support", label: "Reports needing a reply", value: support, tab: "support" },
      onboardingReview !== null && { key: "review", label: "Onboarding answers to grade", value: onboardingReview, tab: "grading" },
      appeals !== null && { key: "appeals", label: "Open appeals", value: appeals, tab: "grading" },
      drafts !== null && { key: "drafts", label: "Draft tests to review", value: drafts, tab: "content" },
      helpGaps !== null && { key: "help", label: "Unanswered help-bot questions", value: helpGaps, tab: "helpbot" },
      listings !== null && { key: "listings", label: "Live opportunity listings", value: listings, tab: "opportunities" },
      pendingOffers !== null && { key: "offers", label: "Offers waiting on learners", value: pendingOffers, tab: "opportunities" },
      pool !== null && { key: "pool", label: "Tokens in the funding pool", value: pool, tab: "tokens" },
    ].filter(Boolean),
  };
}
