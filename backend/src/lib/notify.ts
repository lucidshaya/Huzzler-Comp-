import { db } from "./supabase.js";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export async function notify(userId: string, type: string, title: string, body: string, data: Record<string, unknown> = {}) {
  const { error } = await db.from("notifications").insert({ user_id: userId, type, title, body, data });
  if (error) logger.error({ err: error, type }, "notification insert failed");
}

/** Sends email through Resend when configured; otherwise logs it (dev). */
export async function sendEmail(to: string, subject: string, html: string) {
  if (!env.RESEND_API_KEY) {
    logger.info({ to, subject }, "email (not sent: RESEND_API_KEY unset)");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) logger.error({ status: res.status, subject }, "email send failed");
}

export async function emailUser(userId: string, subject: string, html: string) {
  const { data } = await db.auth.admin.getUserById(userId);
  if (data.user?.email) await sendEmail(data.user.email, subject, html);
}
