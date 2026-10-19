import crypto from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { db, must } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { audit } from "../lib/audit.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { ROLE_IDS } from "../domain/constants.js";
import type { JourneyStatus } from "../domain/journey.js";
import { enqueue } from "../jobs/queue.js";

// ---------------------------------------------------------------------------
// Audiences: learners only, never suspended/withdrawn accounts or people who opted out.
// ---------------------------------------------------------------------------

const PROJECTS: JourneyStatus[] = ["PROJECT_1", "PROJECT_2", "PROJECT_3", "PROJECT_4", "PROJECT_5"];
export const SEGMENTS: Record<string, { label: string; statuses: JourneyStatus[] | null }> = {
  all: { label: "All learners", statuses: null },
  not_paid: { label: "Signed up, not paid yet", statuses: ["REGISTERED", "FIELD_CHOSEN", "PREVIEW", "ONBOARDING_STARTED", "GUARDIAN_PENDING", "PAYMENT_PENDING"] },
  testing: { label: "Paid, taking onboarding tests", statuses: ["PAID", "TESTING"] },
  retake: { label: "Failed tests, retake pending", statuses: ["TESTS_FAILED"] },
  waiting_team: { label: "Verified, waiting for a team", statuses: ["TESTS_PASSED", "OFFER_PENDING"] },
  on_team: { label: "On a team", statuses: ["PLACED", ...PROJECTS] },
  certified: { label: "Certified", statuses: ["CERTIFIED"] },
  lapsed: { label: "Plan lapsed", statuses: ["LAPSED"] },
};
const NEVER: JourneyStatus[] = ["SUSPENDED", "WITHDRAWN"];

export const Audience = z.object({ segment: z.enum(Object.keys(SEGMENTS) as [string, ...string[]]).default("all"), role_id: z.enum(ROLE_IDS).nullable().default(null) });
export type Audience = z.infer<typeof Audience>;

async function audienceMembers(a: Audience) {
  const seg = SEGMENTS[a.segment];
  let q = db.from("profiles").select("id, full_name, role_id, journey:user_journey(status)").eq("app_role", "user").eq("email_opt_out", false).is("deleted_at", null);
  if (a.role_id) q = q.eq("role_id", a.role_id);
  const { data } = await q.limit(20000);
  return ((data ?? []) as any[]).filter((p) => {
    const s = (Array.isArray(p.journey) ? p.journey[0] : p.journey)?.status as JourneyStatus | undefined;
    if (!s || NEVER.includes(s)) return false;
    return !seg.statuses || seg.statuses.includes(s);
  });
}

export async function audienceCount(a: Audience) {
  return { count: (await audienceMembers(a)).length };
}

// ---------------------------------------------------------------------------
// Rendering: a small, safe formatting language -> branded HTML (and a plain-text part)
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (s: string, firstName: string) => s.replace(/\{\{\s*first_name\s*\}\}/gi, firstName);

function inline(s: string) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#1cb0f6;font-weight:700">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" style="color:#1cb0f6;font-weight:700">$2</a>');
}

export function renderEmail(subject: string, body: string, firstName: string, unsubscribeUrl: string) {
  const text = fill(body, firstName).replace(/\r\n/g, "\n").trim();
  const blocks = text.split(/\n{2,}/).map((b) => {
    const lines = b.split("\n");
    if (lines.every((l) => /^\s*[-•]\s+/.test(l)))
      return `<ul style="margin:0 0 16px;padding-left:20px">${lines.map((l) => `<li style="margin:0 0 6px">${inline(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("")}</ul>`;
    return `<p style="margin:0 0 16px">${lines.map(inline).join("<br>")}</p>`;
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e8eb">
<tr><td style="background:#1f2933;padding:20px 28px"><span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.3px">Huzzler</span></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">${blocks.join("")}</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #eef0f2;font-size:12px;line-height:1.5;color:#7b8794">
You're getting this because you have a Huzzler account. <a href="${esc(unsubscribeUrl)}" style="color:#7b8794;text-decoration:underline">Unsubscribe from announcements</a>.
</td></tr></table></td></tr></table></body></html>`;
  return { html, text: `${text}\n\n—\nUnsubscribe from Huzzler announcements: ${unsubscribeUrl}` };
}

const unsubToken = (userId: string) => crypto.createHmac("sha256", env.SUPABASE_SERVICE_ROLE_KEY).update(`unsub:${userId}`).digest("hex").slice(0, 32);
export const unsubscribeUrl = (userId: string) => `${env.API_URL.replace(/\/$/, "")}/api/email/unsubscribe?u=${userId}&t=${unsubToken(userId)}`;

export async function unsubscribe(userId: string, token: string) {
  const expected = unsubToken(userId);
  if (token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return false;
  await db.from("profiles").update({ email_opt_out: true }).eq("id", userId);
  await audit(userId, "email.unsubscribed", "profile", userId, {});
  return true;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export const emailConfigured = () => Boolean(env.RESEND_API_KEY);

export const CampaignInput = z.object({ subject: z.string().trim().min(3).max(150), body: z.string().trim().min(10).max(20000), audience: Audience });

export async function listCampaigns() {
  const { data } = await db.from("email_campaigns").select("*, creator:created_by(full_name, username)").order("created_at", { ascending: false }).limit(50);
  return { configured: emailConfigured(), from: env.EMAIL_FROM, segments: Object.entries(SEGMENTS).map(([value, s]) => ({ value, label: s.label })), campaigns: data ?? [] };
}

export async function createCampaign(actorId: string, input: z.infer<typeof CampaignInput>) {
  const row = must(await db.from("email_campaigns").insert({ ...input, created_by: actorId }).select().single(), "campaign");
  await audit(actorId, "email.draft_created", "email_campaign", row.id, { subject: input.subject });
  return row;
}

async function loadDraft(id: string) {
  const { data } = await db.from("email_campaigns").select("*").eq("id", id).maybeSingle();
  if (!data) throw notFound("email");
  return data;
}

export async function updateCampaign(id: string, input: z.infer<typeof CampaignInput>) {
  const c = await loadDraft(id);
  if (c.status !== "draft") throw conflict("Only drafts can be edited.");
  return must(await db.from("email_campaigns").update(input).eq("id", id).select().single(), "campaign");
}

export async function deleteCampaign(actorId: string, id: string) {
  const c = await loadDraft(id);
  if (c.status !== "draft") throw conflict("Only drafts can be deleted.");
  await db.from("email_campaigns").delete().eq("id", id);
  await audit(actorId, "email.draft_deleted", "email_campaign", id, { subject: c.subject });
}

export function previewHtml(subject: string, body: string) {
  return renderEmail(subject, body, "Ada", "https://huzzler.app/unsubscribe-preview").html;
}

export async function sendTest(actorId: string, id: string) {
  if (!emailConfigured()) throw badRequest("Email sending isn't set up yet: add RESEND_API_KEY to the API's environment.", "EMAIL_NOT_CONFIGURED");
  const c = await loadDraft(id);
  const { data: u } = await db.auth.admin.getUserById(actorId);
  const { data: p } = await db.from("profiles").select("full_name").eq("id", actorId).single();
  if (!u.user?.email) throw badRequest("Your staff account has no email address.");
  const { html, text } = renderEmail(c.subject, c.body, (p?.full_name ?? "there").split(" ")[0], unsubscribeUrl(actorId));
  const res = await resendBatch([{ to: u.user.email, subject: `[Test] ${c.subject}`, html, text, unsubscribe: unsubscribeUrl(actorId) }]);
  if (!res.ok) throw badRequest(`Resend rejected the test: ${res.error}`);
  await db.from("email_campaigns").update({ test_sent_at: new Date().toISOString() }).eq("id", id);
  return { to: u.user.email };
}

/** Snapshots the audience into email_deliveries and queues the send. */
export async function startSend(actorId: string, id: string) {
  if (!emailConfigured()) throw badRequest("Email sending isn't set up yet: add RESEND_API_KEY to the API's environment.", "EMAIL_NOT_CONFIGURED");
  const c = await loadDraft(id);
  if (c.status !== "draft") throw conflict("This email has already been sent or cancelled.");
  const members = await audienceMembers(Audience.parse(c.audience));
  if (!members.length) throw badRequest("No one matches this audience.");

  const emails = new Map<string, string>();
  for (let i = 0; i < members.length; i += 500) {
    const { data, error } = await db.rpc("emails_for_users", { p_ids: members.slice(i, i + 500).map((m) => m.id) });
    if (error) throw new Error(`emails_for_users failed: ${error.message}`);
    for (const r of (data ?? []) as Array<{ id: string; email: string }>) emails.set(r.id, r.email);
  }
  const rows = members.filter((m) => emails.has(m.id)).map((m) => ({ campaign_id: id, user_id: m.id, email: emails.get(m.id)!, first_name: (m.full_name ?? "").split(" ")[0] || "there" }));
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from("email_deliveries").upsert(rows.slice(i, i + 1000), { onConflict: "campaign_id,user_id", ignoreDuplicates: true });
    if (error) throw new Error(`email_deliveries insert failed: ${error.message}`);
  }
  // Claim the draft so a double click can't start two sends.
  const { data: claimed } = await db.from("email_campaigns").update({ status: "sending", recipients_total: rows.length, started_at: new Date().toISOString() }).eq("id", id).eq("status", "draft").select("id");
  if (!claimed?.length) throw conflict("This email is already sending.");
  await audit(actorId, "email.send_started", "email_campaign", id, { recipients: rows.length, audience: c.audience });
  await enqueue("send_campaign", { campaignId: id });
  return { recipients: rows.length };
}

export async function cancelSend(actorId: string, id: string) {
  const { data } = await db.from("email_campaigns").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", id).eq("status", "sending").select("id");
  if (!data?.length) throw conflict("Only an email that's still sending can be cancelled.");
  await audit(actorId, "email.send_cancelled", "email_campaign", id, {});
}

// ---------------------------------------------------------------------------
// Sending (background job): batches of 100 via Resend, resumes until every delivery is done
// ---------------------------------------------------------------------------

type Outgoing = { to: string; subject: string; html: string; text: string; unsubscribe: string };

async function resendBatch(emails: Outgoing[]): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean }> {
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      emails.map((e) => ({
        from: env.EMAIL_FROM,
        to: [e.to],
        subject: e.subject,
        html: e.html,
        text: e.text,
        headers: { "List-Unsubscribe": `<${e.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      })),
    ),
  });
  if (res.ok) return { ok: true };
  const body = await res.text().catch(() => "");
  return { ok: false, error: `${res.status}: ${body.slice(0, 300)}`, retryable: res.status === 429 || res.status >= 500 };
}

export async function processCampaign(campaignId: string) {
  const deadline = Date.now() + 25_000;
  const { data: c } = await db.from("email_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!c || c.status !== "sending") return;

  while (Date.now() < deadline) {
    const { data: status } = await db.from("email_campaigns").select("status").eq("id", campaignId).single();
    if (status?.status !== "sending") return; // cancelled
    const { data: batch } = await db.from("email_deliveries").select("id, user_id, email, first_name").eq("campaign_id", campaignId).eq("status", "pending").limit(100);
    if (!batch?.length) break;

    const res = await resendBatch(
      batch.map((d) => {
        const unsub = unsubscribeUrl(d.user_id);
        const { html, text } = renderEmail(c.subject, c.body, d.first_name ?? "there", unsub);
        return { to: d.email, subject: c.subject, html, text, unsubscribe: unsub };
      }),
    );
    const ids = batch.map((d) => d.id);
    if (res.ok) {
      await db.from("email_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).in("id", ids);
    } else if (res.retryable) {
      await db.from("email_campaigns").update({ last_error: res.error }).eq("id", campaignId);
      throw new Error(`Resend temporarily unavailable: ${res.error}`); // job retries with backoff; rows stay pending
    } else {
      await db.from("email_deliveries").update({ status: "failed", error: res.error }).in("id", ids);
      await db.from("email_campaigns").update({ last_error: res.error }).eq("id", campaignId);
      logger.error({ campaignId, error: res.error }, "email batch rejected");
    }
    await refreshCounts(campaignId);
    await new Promise((r) => setTimeout(r, 600)); // stay under Resend's default 2 requests/second
  }

  const { count: pending } = await db.from("email_deliveries").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "pending");
  if (pending) {
    await enqueue("send_campaign", { campaignId }); // continue in a fresh job
    return;
  }
  const counts = await refreshCounts(campaignId);
  await db
    .from("email_campaigns")
    .update({ status: counts.sent === 0 && counts.failed > 0 ? "failed" : "sent", completed_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "sending");
}

async function refreshCounts(campaignId: string) {
  const [{ count: sent }, { count: failed }] = await Promise.all([
    db.from("email_deliveries").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "sent"),
    db.from("email_deliveries").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "failed"),
  ]);
  await db.from("email_campaigns").update({ sent_count: sent ?? 0, failed_count: failed ?? 0 }).eq("id", campaignId);
  return { sent: sent ?? 0, failed: failed ?? 0 };
}
