import nodemailer, { type Transporter } from "nodemailer";
import { db } from "./supabase.js";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export async function notify(userId: string, type: string, title: string, body: string, data: Record<string, unknown> = {}) {
  const { error } = await db.from("notifications").insert({ user_id: userId, type, title, body, data });
  if (error) logger.error({ err: error, type }, "notification insert failed");
}

/** Escapes user-provided text before it goes into an email's HTML. */
export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Branded wrapper used by every platform email. `inner` must already be escaped. */
export function emailLayout(title: string, inner: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:#00BFFF;padding:20px 28px;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px">Huzzler</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h1>
<div style="font-size:15px;line-height:1.6">${inner}</div>
${cta ? `<p style="margin:24px 0 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#00BFFF;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px">${escapeHtml(cta.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">Huzzler · Experience-as-a-service for African tech talent · Questions? Reply to this email or write to ${escapeHtml(env.SUPPORT_EMAIL)}</td></tr>
</table></td></tr></table></body></html>`;
}

let transporter: Transporter | null = null;
const smtpReady = () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
function smtp(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

/**
 * Sends email via SMTP (Gmail: fourtechonoliges@gmail.com with an App Password), else Resend, else logs it.
 * Never throws: an email failure must not break the action that triggered it.
 */
export async function sendEmail(to: string, subject: string, html: string, opts: { replyTo?: string } = {}) {
  try {
    if (smtpReady()) {
      await smtp().sendMail({ from: env.EMAIL_FROM, to, subject, html, replyTo: opts.replyTo ?? env.SUPPORT_EMAIL });
      return;
    }
    if (env.RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html, reply_to: opts.replyTo ?? env.SUPPORT_EMAIL }),
      });
      if (!res.ok) logger.error({ status: res.status, subject }, "email send failed");
      return;
    }
    logger.info({ to, subject }, "email (not sent: SMTP/Resend not configured)");
  } catch (err) {
    logger.error({ err: String(err), subject }, "email send failed");
  }
}

export async function emailUser(userId: string, subject: string, html: string) {
  const { data } = await db.auth.admin.getUserById(userId);
  if (data.user?.email) await sendEmail(data.user.email, subject, html);
}

/** In-app notification to every active staff member who handles support. */
export async function notifyStaff(type: string, title: string, body: string, data: Record<string, unknown> = {}) {
  const { data: staff } = await db.from("profiles").select("id").in("app_role", ["admin", "moderator"]).is("deleted_at", null);
  for (const s of staff ?? []) await notify(s.id, type, title, body, data);
}
