import { db } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { emailLayout, emailUser, escapeHtml } from "../lib/notify.js";
import { env } from "../config/env.js";

// Operational alerts and log retention. Nobody watches the logs, so the platform tells admins itself
// when something is going wrong: browser crashes, AI failures, stuck background jobs and Paystack
// webhook errors. Runs every 30 minutes with matching; each kind of alert is sent at most every 6 hours.

const HOUR = 3_600_000;
const ALERT_EVERY_HOURS = 6;
/** Browser crash reports are kept this long (the Privacy Policy promises 90 days). */
export const CLIENT_ERROR_RETENTION_DAYS = 90;

type Problem = { key: string; title: string; detail: string };

export async function findProblems(): Promise<Problem[]> {
  const hourAgo = new Date(Date.now() - HOUR).toISOString();
  const sixAgo = new Date(Date.now() - 6 * HOUR).toISOString();
  const halfHourAgo = new Date(Date.now() - HOUR / 2).toISOString();
  const head = { count: "exact" as const, head: true };
  const [crashes, aiAll, aiFailed, stuck, failedJobs, webhooks] = await Promise.all([
    db.from("audit_logs").select("id", head).eq("action", "client.error").gte("created_at", hourAgo),
    db.from("ai_calls").select("id", head).gte("created_at", hourAgo),
    db.from("ai_calls").select("id", head).eq("success", false).gte("created_at", hourAgo),
    db.from("jobs").select("id", head).eq("status", "pending").lt("run_at", halfHourAgo),
    db.from("jobs").select("name, last_error").eq("status", "failed").gte("updated_at", sixAgo).limit(20),
    db.from("payment_events").select("event_type, error").not("error", "is", null).gte("created_at", sixAgo).limit(20),
  ]);
  const problems: Problem[] = [];
  const n = (r: { count: number | null }) => r.count ?? 0;
  if (n(crashes) >= 10) problems.push({ key: "client_errors", title: `${n(crashes)} browser errors in the last hour`, detail: "Learners are hitting crashes. Check audit logs for action client.error to see the page and message." });
  if (n(aiFailed) >= 5 && n(aiFailed) / Math.max(1, n(aiAll)) >= 0.3)
    problems.push({ key: "ai_failures", title: `${n(aiFailed)} of ${n(aiAll)} AI calls failed in the last hour`, detail: "Grading, the mentor and the help bot fall back or queue for human review. Check the AI provider key, balance and the ai_calls error column." });
  if (n(stuck) >= 5) problems.push({ key: "jobs_stuck", title: `${n(stuck)} background jobs waiting over 30 minutes`, detail: "The job queue isn't draining. Check the pg_cron drain job (huzzler:drain) and POST /api/jobs/drain on the API." });
  if (failedJobs.data?.length)
    problems.push({ key: "jobs_failed", title: `${failedJobs.data.length} background jobs failed in the last 6 hours`, detail: [...new Set(failedJobs.data.map((j) => `${j.name}: ${(j.last_error ?? "").slice(0, 120)}`))].slice(0, 5).join("\n") });
  if (webhooks.data?.length)
    problems.push({ key: "webhooks", title: `${webhooks.data.length} Paystack webhook events failed in the last 6 hours`, detail: [...new Set(webhooks.data.map((w) => `${w.event_type}: ${(w.error ?? "").slice(0, 120)}`))].slice(0, 5).join("\n") });
  return problems;
}

export async function runOpsChecks() {
  const problems = await findProblems();
  if (!problems.length) return 0;
  const { data: admins } = await db.from("profiles").select("id").eq("app_role", "admin").is("deleted_at", null);
  if (!admins?.length) return 0;
  const since = new Date(Date.now() - ALERT_EVERY_HOURS * HOUR).toISOString();
  const { data: recent } = await db.from("notifications").select("data").eq("type", "ops.alert").eq("user_id", admins[0].id).gte("created_at", since);
  const sent = new Set((recent ?? []).map((r) => (r.data as { key?: string })?.key));
  const fresh = problems.filter((p) => !sent.has(p.key));
  for (const p of fresh) {
    logger.warn({ alert: p.key }, p.title);
    await db.from("notifications").insert(admins.map((a) => ({ user_id: a.id, type: "ops.alert", title: p.title, body: p.detail.slice(0, 500), data: { key: p.key } })));
    for (const a of admins)
      await emailUser(a.id, `Huzzler alert: ${p.title}`, emailLayout(p.title, `<p style="white-space:pre-line">${escapeHtml(p.detail)}</p>`, { label: "Open the admin portal", url: `${env.APP_URL}/admin` }));
  }
  return fresh.length;
}

/** Deletes browser crash reports past their retention period. */
export async function pruneOldLogs() {
  const cutoff = new Date(Date.now() - CLIENT_ERROR_RETENTION_DAYS * 24 * HOUR).toISOString();
  const { error, count } = await db.from("audit_logs").delete({ count: "exact" }).eq("action", "client.error").lt("created_at", cutoff);
  if (error) logger.error({ err: error }, "pruning client errors failed");
  return count ?? 0;
}
