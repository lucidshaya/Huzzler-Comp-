import crypto from "node:crypto";
import { db, must, ok } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { checkAge } from "../domain/age.js";
import { CONSENT_VERSIONS, REQUIRED_CONSENTS, type ConsentType } from "../domain/constants.js";
import { atLeast, hasPaidAccess } from "../domain/journey.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { getJourney, transition, advanceTo } from "./journey.js";
import { sendEmail } from "../lib/notify.js";
import { render } from "../lib/templates.js";

export async function getProfile(userId: string) {
  return must(await db.from("profiles").select("*").eq("id", userId).single(), "profile");
}

export async function completeProfile(
  userId: string,
  input: { full_name: string; username: string; dob: string; phone: string; timezone: string; hours_per_week: number },
) {
  const j = await getJourney(userId);
  const current = await getProfile(userId);
  // DOB is locked once paid (the guardian decision depends on it).
  if (current.dob && current.dob !== input.dob && hasPaidAccess(j.status)) throw forbidden("Date of birth can't be changed after payment.");

  const age = checkAge(new Date(input.dob));
  if (!age.allowed) throw badRequest(age.reason, "AGE_BLOCKED");

  const { data: taken } = await db.from("profiles").select("id").ilike("username", input.username).neq("id", userId).maybeSingle();
  if (taken) throw conflict("That username is taken.", "USERNAME_TAKEN");

  const phoneChanged = current.phone !== input.phone;
  return must(
    await db
      .from("profiles")
      .update({
        full_name: input.full_name,
        username: input.username.toLowerCase(),
        dob: input.dob,
        phone: input.phone,
        phone_verified: phoneChanged ? false : current.phone_verified,
        timezone: input.timezone,
        hours_per_week: input.hours_per_week,
        is_minor: age.needsGuardian,
      })
      .eq("id", userId)
      .select()
      .single(),
    "profile update",
  );
}

/** Called after the browser completes Supabase phone OTP; we trust Supabase's confirmation, not the client. */
export async function syncPhoneVerification(userId: string) {
  const { data } = await db.auth.admin.getUserById(userId);
  const u = data.user;
  const profile = await getProfile(userId);
  const confirmed = Boolean(u?.phone_confirmed_at) && u?.phone && profile.phone && u.phone.replace(/\D/g, "").endsWith(profile.phone.replace(/\D/g, "").slice(-10));
  await db.from("profiles").update({ phone_verified: Boolean(confirmed) }).eq("id", userId);
  return Boolean(confirmed);
}

export function profileReady(p: { full_name: string | null; dob: string | null; phone: string | null; phone_verified: boolean; username: string | null }) {
  return Boolean(p.full_name && p.dob && p.phone && p.username && (p.phone_verified || !env.REQUIRE_PHONE_OTP));
}

export async function chooseField(userId: string, roleId: string) {
  const profile = await getProfile(userId);
  if (!profileReady(profile)) throw badRequest("Complete your profile first.", "PROFILE_INCOMPLETE");
  const j = await getJourney(userId);
  const paid = hasPaidAccess(j.status);

  if (paid) {
    if (atLeast(j.status, "TESTS_PASSED") || j.status === "LAPSED") throw forbidden("Your field is locked after passing onboarding.", "FIELD_LOCKED");
    if (j.status === "TESTING") throw forbidden("Finish or wait out your current attempt before switching field.", "ATTEMPT_IN_PROGRESS");
    if (profile.field_switches_used >= 1) throw forbidden("You've already used your free field switch.", "NO_SWITCHES_LEFT");
    if (profile.role_id === roleId) return profile;
    await db.from("profiles").update({ role_id: roleId, field_switches_used: profile.field_switches_used + 1 }).eq("id", userId);
  } else {
    await db.from("profiles").update({ role_id: roleId }).eq("id", userId);
    if (j.status === "REGISTERED") await transition(userId, "FIELD_CHOSEN", "field chosen");
  }
  return getProfile(userId);
}

export async function markPreviewSeen(userId: string) {
  const j = await getJourney(userId);
  if (j.status === "FIELD_CHOSEN") await transition(userId, "PREVIEW", "opened dashboard preview");
}

export async function recordConsents(userId: string, items: Array<{ type: ConsentType; granted: boolean }>) {
  const rows = items.map((c) => ({ user_id: userId, type: c.type, version: CONSENT_VERSIONS[c.type], granted: c.granted }));
  ok(await db.from("consents").insert(rows), "consents");
  // Mirror the opportunities toggle onto the profile (off by default; revocable any time).
  const opp = items.find((c) => c.type === "opportunities");
  if (opp) await db.from("profiles").update({ open_to_opportunities: opp.granted }).eq("id", userId);
}

/** Latest decision per consent type. */
export async function currentConsents(userId: string): Promise<Record<string, { granted: boolean; version: string; at: string }>> {
  const { data } = await db.from("consents").select("type, granted, version, granted_at").eq("user_id", userId).order("granted_at", { ascending: true });
  const out: Record<string, { granted: boolean; version: string; at: string }> = {};
  for (const c of data ?? []) out[c.type] = { granted: c.granted, version: c.version, at: c.granted_at };
  return out;
}

export async function hasRequiredConsents(userId: string) {
  const c = await currentConsents(userId);
  return REQUIRED_CONSENTS.every((t) => c[t]?.granted && c[t].version === CONSENT_VERSIONS[t]);
}

/** "Begin onboarding": consents recorded, then on to guardian consent (17) or payment. */
export async function beginOnboarding(userId: string) {
  const profile = await getProfile(userId);
  if (!profile.role_id) throw badRequest("Choose a field first.", "NO_FIELD");
  if (!(await hasRequiredConsents(userId))) throw badRequest("Please accept the required consents.", "CONSENTS_REQUIRED");
  await advanceTo(userId, ["PREVIEW", "ONBOARDING_STARTED"], "begin onboarding");
  const j = await getJourney(userId);
  if (j.status === "ONBOARDING_STARTED") {
    if (profile.is_minor) {
      const { data: accepted } = await db.from("guardian_consents").select("id").eq("user_id", userId).eq("status", "accepted").maybeSingle();
      await transition(userId, accepted ? "PAYMENT_PENDING" : "GUARDIAN_PENDING", accepted ? "guardian consent on file" : "guardian consent required");
      if (accepted) return getJourney(userId);
    } else {
      await transition(userId, "PAYMENT_PENDING", "adult: straight to payment");
    }
  }
  return getJourney(userId);
}

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

const GUARDIAN_EMAIL = `<p>Hello {{guardian_name}},</p>
<p>{{child_first_name}} (aged 17) has asked you to approve their Huzzler account. Huzzler is a paid (₦5,000 one-time or ₦2,500/month) skills programme where young people complete assessments and team projects and earn a certificate.</p>
<p>Before they can pay, Nigerian data protection rules require a parent or guardian to consent to Huzzler processing their data, including AI grading of their work and processing outside Nigeria.</p>
<p><a href="{{link}}">Review and respond</a> (link expires in 7 days).</p>
<p>If you don't know who this is, you can ignore this email.</p>`;

export async function requestGuardianConsent(userId: string, input: { guardian_name: string; guardian_email: string; guardian_phone?: string; relationship: string }) {
  const profile = await getProfile(userId);
  if (!profile.is_minor) throw badRequest("Guardian consent is only needed for 17-year-olds.");
  const j = await getJourney(userId);
  if (j.status !== "GUARDIAN_PENDING") throw conflict("Guardian consent isn't needed right now.");

  const token = crypto.randomBytes(32).toString("base64url");
  await db.from("guardian_consents").update({ status: "expired" }).eq("user_id", userId).eq("status", "pending");
  ok(
    await db.from("guardian_consents").insert({
      user_id: userId,
      guardian_name: input.guardian_name,
      guardian_email: input.guardian_email,
      guardian_phone: input.guardian_phone ?? null,
      relationship: input.relationship,
      token_hash: hashToken(token),
    }),
    "guardian consent",
  );
  const link = `${env.APP_URL}/guardian/${token}`;
  await sendEmail(
    input.guardian_email,
    "Please approve a Huzzler account",
    render(GUARDIAN_EMAIL, { guardian_name: input.guardian_name, child_first_name: (profile.full_name ?? "Your child").split(" ")[0], link }),
  );
  return { sent: true, ...(env.NODE_ENV !== "production" ? { devLink: link } : {}) };
}

export async function getGuardianRequest(token: string) {
  const { data } = await db.from("guardian_consents").select("id, user_id, guardian_name, status, expires_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data) throw notFound("This link is invalid.");
  const { data: p } = await db.from("profiles").select("full_name").eq("id", data.user_id).single();
  return { id: data.id, guardian_name: data.guardian_name, child_first_name: (p?.full_name ?? "").split(" ")[0], status: data.status, expired: new Date(data.expires_at) < new Date(), userId: data.user_id };
}

export async function respondGuardian(token: string, accept: boolean, ip: string | undefined) {
  const req = await getGuardianRequest(token);
  if (req.status !== "pending") throw conflict("This request has already been answered.");
  if (req.expired) throw conflict("This link has expired. Ask them to send a new one.");
  await db
    .from("guardian_consents")
    .update({ status: accept ? "accepted" : "declined", accepted_at: accept ? new Date().toISOString() : null, accepted_ip: ip ?? null })
    .eq("id", req.id);
  if (accept) {
    const j = await getJourney(req.userId);
    if (j.status === "GUARDIAN_PENDING") await transition(req.userId, "PAYMENT_PENDING", "guardian consent accepted");
  }
  return { ok: true };
}
