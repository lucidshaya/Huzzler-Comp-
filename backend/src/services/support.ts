import crypto from "node:crypto";
import { db, must } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { audit } from "../lib/audit.js";
import { notify, notifyStaff, sendEmail, emailUser, emailLayout, escapeHtml } from "../lib/notify.js";
import { badRequest, forbidden, HttpError, notFound } from "../lib/errors.js";

export const SUPPORT_CATEGORIES = ["bug", "payment", "account", "tests", "team", "grading", "other"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

const MAX_TICKETS_PER_HOUR = 5;
const MAX_MESSAGES_PER_HOUR = 40;
const SCREENSHOT_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

/** Screenshots live under <userId>/support/ in the private submissions bucket. */
export async function screenshotUploadUrl(userId: string, ext: string) {
  const e = ext.toLowerCase();
  if (!SCREENSHOT_TYPES[e]) throw badRequest("Screenshots must be PNG, JPG, WebP or GIF.");
  const path = `${userId}/support/${crypto.randomUUID()}.${e}`;
  const { data, error } = await db.storage.from("submissions").createSignedUploadUrl(path);
  if (error) throw error;
  return { path, token: data.token, signedUrl: data.signedUrl };
}

function assertOwnAttachment(userId: string, path?: string | null) {
  if (!path) return null;
  if (!path.startsWith(`${userId}/support/`) || path.includes("..")) throw forbidden("Invalid attachment.");
  return path;
}

async function signed(path: string | null) {
  if (!path) return null;
  const { data } = await db.storage.from("submissions").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

async function withSignedAttachments<T extends { attachment_path: string | null }>(rows: T[]) {
  return Promise.all(rows.map(async (m) => ({ ...m, attachment_url: await signed(m.attachment_path) })));
}

async function rateLimit(table: "support_tickets" | "support_messages", column: string, userId: string, max: number) {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq(column, userId).gte("created_at", since);
  if ((count ?? 0) >= max) throw new HttpError(429, "You're sending messages very quickly. Please wait a little and try again.", "SUPPORT_RATE_LIMIT");
}

export async function createTicket(
  userId: string,
  input: { category: SupportCategory; subject: string; body: string; page_url?: string; user_agent?: string; attachment_path?: string },
) {
  await rateLimit("support_tickets", "user_id", userId, MAX_TICKETS_PER_HOUR);
  const attachment = assertOwnAttachment(userId, input.attachment_path);
  const ticket = must(
    await db
      .from("support_tickets")
      .insert({
        user_id: userId,
        category: input.category,
        subject: input.subject,
        page_url: input.page_url?.slice(0, 500) ?? null,
        user_agent: input.user_agent?.slice(0, 300) ?? null,
        priority: input.category === "payment" ? "high" : "normal",
      })
      .select()
      .single(),
    "ticket",
  );
  must(await db.from("support_messages").insert({ ticket_id: ticket.id, sender_id: userId, is_staff: false, body: input.body, attachment_path: attachment }).select("id").single(), "message");

  await notifyStaff("support.new", `New report: ${input.subject}`, `Category: ${input.category}`, { ticketId: ticket.id });
  const { data: p } = await db.from("profiles").select("full_name, username").eq("id", userId).single();
  await sendEmail(
    env.SUPPORT_EMAIL,
    `[Huzzler support] ${input.category}: ${input.subject}`,
    emailLayout(
      `New report from ${p?.full_name ?? "a user"}`,
      `<p><b>Category:</b> ${escapeHtml(input.category)}<br/><b>Subject:</b> ${escapeHtml(input.subject)}<br/><b>Page:</b> ${escapeHtml(input.page_url ?? "—")}</p><p style="white-space:pre-wrap">${escapeHtml(input.body)}</p>${attachment ? "<p>A screenshot is attached in the admin inbox.</p>" : ""}`,
      { label: "Open the support inbox", url: `${env.APP_URL}/admin` },
    ),
  );
  return ticket;
}

export async function listMyTickets(userId: string) {
  const { data } = await db
    .from("support_tickets")
    .select("id, category, subject, status, unread_by_user, last_message_at, created_at")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

async function loadTicket(ticketId: string) {
  const { data } = await db.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!data) throw notFound("Report not found");
  return data;
}

async function threadOf(ticketId: string) {
  const { data } = await db.from("support_messages").select("id, sender_id, is_staff, body, attachment_path, created_at").eq("ticket_id", ticketId).order("created_at");
  return withSignedAttachments(data ?? []);
}

export async function getMyTicket(userId: string, ticketId: string) {
  const ticket = await loadTicket(ticketId);
  if (ticket.user_id !== userId) throw notFound("Report not found"); // don't reveal other users' tickets exist
  if (ticket.unread_by_user) await db.from("support_tickets").update({ unread_by_user: false }).eq("id", ticketId);
  return { ticket: { ...ticket, unread_by_user: false }, messages: await threadOf(ticketId) };
}

export async function replyAsUser(userId: string, ticketId: string, body: string, attachmentPath?: string) {
  const ticket = await loadTicket(ticketId);
  if (ticket.user_id !== userId) throw notFound("Report not found");
  if (ticket.status === "closed") throw badRequest("This report is closed. Please open a new one.", "TICKET_CLOSED");
  await rateLimit("support_messages", "sender_id", userId, MAX_MESSAGES_PER_HOUR);
  const attachment = assertOwnAttachment(userId, attachmentPath);
  const msg = must(await db.from("support_messages").insert({ ticket_id: ticketId, sender_id: userId, is_staff: false, body, attachment_path: attachment }).select().single(), "message");
  await db.from("support_tickets").update({ status: "open", unread_by_staff: true, last_message_at: new Date().toISOString() }).eq("id", ticketId);
  await notifyStaff("support.reply", `Reply on: ${ticket.subject}`, body.slice(0, 120), { ticketId });
  return msg;
}

// ---------------------------------------------------------------------------
// Staff side
// ---------------------------------------------------------------------------
export async function listTicketsForStaff(status?: string) {
  let q = db
    .from("support_tickets")
    .select("id, user_id, category, subject, status, priority, unread_by_staff, last_message_at, created_at, assigned_to, profile:user_id(full_name, username)")
    .order("unread_by_staff", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (status && status !== "all") q = q.eq("status", status);
  const { data } = await q;
  return data ?? [];
}

export async function getTicketForStaff(ticketId: string) {
  const ticket = await loadTicket(ticketId);
  if (ticket.unread_by_staff) await db.from("support_tickets").update({ unread_by_staff: false }).eq("id", ticketId);
  const [{ data: profile }, messages] = await Promise.all([
    db.from("profiles").select("full_name, username, role_id").eq("id", ticket.user_id).single(),
    threadOf(ticketId),
  ]);
  const { data: journey } = await db.from("user_journey").select("status, plan_id").eq("user_id", ticket.user_id).single();
  return { ticket: { ...ticket, unread_by_staff: false }, user: { ...profile, journey }, messages };
}

export async function replyAsStaff(staffId: string, ticketId: string, body: string, ip?: string) {
  const ticket = await loadTicket(ticketId);
  if (ticket.status === "closed") throw badRequest("Reopen the report before replying.");
  const msg = must(await db.from("support_messages").insert({ ticket_id: ticketId, sender_id: staffId, is_staff: true, body }).select().single(), "message");
  await db
    .from("support_tickets")
    .update({ status: "awaiting_user", unread_by_user: true, last_message_at: new Date().toISOString(), assigned_to: ticket.assigned_to ?? staffId })
    .eq("id", ticketId);
  await notify(ticket.user_id, "support.reply", "Huzzler support replied", body.slice(0, 140), { ticketId });
  await emailUser(
    ticket.user_id,
    `Re: ${ticket.subject}`,
    emailLayout("Huzzler support replied to your report", `<p style="white-space:pre-wrap">${escapeHtml(body)}</p>`, { label: "View the conversation", url: `${env.APP_URL}/support?ticket=${ticketId}` }),
  );
  await audit(staffId, "support.reply", "support_ticket", ticketId, {}, ip);
  return msg;
}

export async function updateTicket(staffId: string, ticketId: string, patch: { status?: string; priority?: string; assigned_to?: string | null }, ip?: string) {
  await loadTicket(ticketId);
  const { data } = await db.from("support_tickets").update(patch).eq("id", ticketId).select().single();
  if (patch.status === "resolved") {
    const t = data!;
    await notify(t.user_id, "support.resolved", "Your report was resolved", t.subject, { ticketId });
  }
  await audit(staffId, "support.update", "support_ticket", ticketId, patch, ip);
  return data;
}
