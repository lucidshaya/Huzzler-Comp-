import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { aiConfigured } from "../ai/aiClient.js";
import { audit } from "../lib/audit.js";
import { h, parse, uid } from "./util.js";
import { forbidden } from "../lib/errors.js";
import { ROLE_IDS, CONSENT_VERSIONS, REQUIRED_CONSENTS } from "../domain/constants.js";
import { getJourney } from "../services/journey.js";
import {
  getProfile, completeProfile, chooseField, markPreviewSeen, recordConsents, currentConsents, beginOnboarding,
  requestGuardianConsent, syncPhoneVerification, profileReady,
} from "../services/profile.js";
import { removeMember } from "../services/teams.js";
import { cancelSubscription } from "../services/payments.js";
import { clearAuthCache } from "../middleware/auth.js";
import { identity } from "../services/identity.js";

export const meRouter = Router();

meRouter.get(
  "/",
  h(async (req) => {
    const id = uid(req);
    const [profile, journey, consents, guardian, { count: unread }] = await Promise.all([
      getProfile(id),
      getJourney(id),
      currentConsents(id),
      db.from("guardian_consents").select("status, guardian_email, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", id).is("read_at", null),
    ]);
    return {
      user: { id, email: req.user!.email, app_role: req.user!.appRole },
      profile,
      journey,
      consents,
      guardian: guardian.data,
      unread_notifications: unread ?? 0,
      flags: { profile_ready: profileReady(profile), require_phone_otp: env.REQUIRE_PHONE_OTP, ai_enabled: aiConfigured() },
      consent_versions: CONSENT_VERSIONS,
      required_consents: REQUIRED_CONSENTS,
    };
  }),
);

const ProfileInput = z.object({
  full_name: z.string().trim().min(2).max(80),
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,24}$/, "3-24 letters, numbers or underscores"),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, "Use international format, e.g. +2348012345678"),
  timezone: z.string().min(2).max(64),
  hours_per_week: z.number().int().min(4).max(40),
});
meRouter.put("/profile", h(async (req) => completeProfile(uid(req), parse(ProfileInput, req.body))));
meRouter.patch("/bio", h(async (req) => {
  const { bio } = parse(z.object({ bio: z.string().max(500) }), req.body);
  await db.from("profiles").update({ bio }).eq("id", uid(req));
}));
meRouter.post("/phone/sync", h(async (req) => ({ verified: await syncPhoneVerification(uid(req)) })));
meRouter.post("/field", h(async (req) => chooseField(uid(req), parse(z.object({ role_id: z.enum(ROLE_IDS) }), req.body).role_id)));
meRouter.post("/preview", h(async (req) => markPreviewSeen(uid(req))));

const ConsentInput = z.object({
  items: z.array(z.object({ type: z.enum(Object.keys(CONSENT_VERSIONS) as [keyof typeof CONSENT_VERSIONS]), granted: z.boolean() })).min(1).max(10),
});
meRouter.post("/consents", h(async (req) => {
  await recordConsents(uid(req), parse(ConsentInput, req.body).items);
  return currentConsents(uid(req));
}));
meRouter.post("/begin-onboarding", h(async (req) => beginOnboarding(uid(req))));
meRouter.post("/guardian", h(async (req) =>
  requestGuardianConsent(uid(req), parse(z.object({ guardian_name: z.string().min(2).max(80), guardian_email: z.string().email(), guardian_phone: z.string().optional(), relationship: z.string().min(2).max(40) }), req.body)),
));

meRouter.get("/identity", h(async (req) => identity(uid(req))));

meRouter.get("/notifications", h(async (req) => {
  const { data } = await db.from("notifications").select("*").eq("user_id", uid(req)).order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}));
meRouter.post("/notifications/read", h(async (req) => {
  await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", uid(req)).is("read_at", null);
}));

// Identity check before certification: the user uploads an ID; staff approve it.
meRouter.post("/identity/upload-url", h(async (req) => {
  const { ext } = parse(z.object({ ext: z.enum(["jpg", "jpeg", "png", "pdf"]) }), req.body);
  const path = `${uid(req)}/identity/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await db.storage.from("submissions").createSignedUploadUrl(path);
  if (error) throw error;
  return { path, token: data.token, signedUrl: data.signedUrl };
}));
meRouter.post("/identity/submitted", h(async (req) => {
  const { path } = parse(z.object({ path: z.string() }), req.body);
  if (!path.startsWith(`${uid(req)}/identity/`)) throw new Error("bad path");
  await db.from("reports").insert({ reporter_id: uid(req), target_type: "identity_check", target_id: uid(req), reason: path });
}));

// Privacy dashboard (NDPA): download everything, delete the account.
meRouter.get("/privacy/export", h(async (req, res) => {
  const id = uid(req);
  const t = (table: string, col = "user_id") => db.from(table).select("*").eq(col, id).then((r) => r.data ?? []);
  const data = {
    exported_at: new Date().toISOString(),
    profile: await getProfile(id),
    journey: await getJourney(id),
    consents: await t("consents"),
    guardian_consents: (await t("guardian_consents")).map(({ token_hash, ...g }: any) => g),
    payments: (await t("payments")).map(({ raw, ...p }: any) => p),
    subscriptions: await t("subscriptions"),
    test_attempts: await t("test_attempts"),
    test_submissions: await t("test_submissions"),
    grades: await t("grades"),
    appeals: await t("appeals"),
    offers: await t("offers"),
    deliverables: await t("deliverables"),
    checkins: await t("checkins"),
    peer_reviews_written: await t("peer_reviews", "reviewer_id"),
    messages: await t("messages"),
    mentor_messages: await t("mentor_messages"),
    certifications: await t("certifications"),
    portfolio_items: await t("portfolio_items"),
    notifications: await t("notifications"),
    token_ledger: await t("token_ledger"),
    token_purchases: (await t("token_purchases")).map(({ raw, ...p }: any) => p),
    resume: await t("cv_documents"),
  };
  res.setHeader("Content-Disposition", `attachment; filename="huzzler-data-${id}.json"`);
  return data;
}));

meRouter.delete("/", h(async (req) => {
  const id = uid(req);
  parse(z.object({ confirm: z.literal("DELETE") }), req.body);
  const { data: me } = await db.from("profiles").select("*").eq("id", id).single();
  if (me?.is_protected) throw forbidden("The main admin account can't be deleted.", "PROTECTED_ADMIN");
  await removeMember(id, "account deleted").catch(() => {});
  await cancelSubscription(id).catch(() => {});
  await db.from("profiles").update({ deleted_at: new Date().toISOString(), full_name: "Deleted user", username: null, phone: null, dob: null, bio: null, avatar_url: null, open_to_opportunities: false }).eq("id", id);
  await db.from("user_journey").update({ status: "WITHDRAWN" }).eq("user_id", id);
  await db.auth.admin.updateUserById(id, { email: `deleted+${id}@huzzler.invalid`, phone: "", ban_duration: "876000h", user_metadata: {} });
  clearAuthCache(id);
  await audit(id, "account.delete", "profile", id);
  return { deleted: true };
}));
