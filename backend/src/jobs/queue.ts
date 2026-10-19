import { waitUntil } from "@vercel/functions";
import { env, isProd } from "../config/env.js";
import { db } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";

export type JobName =
  | "grade_test_submission"
  | "grade_deliverable"
  | "grade_demo"
  | "process_payment_event"
  | "run_matching"
  | "expire_offers"
  | "lapse_check"
  | "inactivity_check"
  | "nudges"
  | "retry_awaiting_ai"
  | "generate_offers"
  | "compute_project_results"
  | "issue_certificate"
  | "send_campaign";

const BACKOFF_MS = 10_000;

/**
 * Enqueue background work. In production jobs are rows in the `jobs` table (durable, retried with
 * backoff) and a drain starts right away in the background; pg_cron pings the drain endpoint every
 * minute for delayed and retried jobs. In development jobs run in-process after the response, so a
 * local server never picks up jobs from the shared database queue.
 */
export async function enqueue(name: JobName, data: Record<string, unknown> = {}, opts: { delayMs?: number; jobId?: string } = {}) {
  if (!isProd) return runInline(name, data, opts.delayMs ?? 0);
  const { error } = await db.from("jobs").insert({
    name,
    data,
    job_key: opts.jobId ?? null,
    run_at: new Date(Date.now() + (opts.delayMs ?? 0)).toISOString(),
  });
  if (error && error.code !== "23505") throw new Error(`enqueue ${name} failed: ${error.message}`); // 23505: same jobId already open
  if (!opts.delayMs) kickDrain();
}

function runInline(name: JobName, data: Record<string, unknown>, delayMs: number) {
  const run = async (attempt: number): Promise<void> => {
    try {
      const { processors } = await import("./processors.js");
      await processors[name](data);
    } catch (err) {
      logger.error({ err, name, attempt }, "inline job failed");
      if (attempt < 3) setTimeout(() => void run(attempt + 1), 5_000 * attempt);
    }
  };
  setTimeout(() => void run(1), delayMs);
}

/** Drains in the background; on Vercel, waitUntil keeps the function alive until it finishes. */
export function kickDrain() {
  waitUntil(drainJobs().catch((err) => logger.error({ err }, "job drain failed")));
}

/** Claims and runs due jobs until none are left or the time budget is spent. */
export async function drainJobs(budgetMs = env.JOBS_DRAIN_BUDGET_MS) {
  const { processors } = await import("./processors.js");
  const deadline = Date.now() + budgetMs;
  let ran = 0;
  while (Date.now() < deadline) {
    const { data: jobs, error } = await db.rpc("claim_jobs", { max_jobs: 5 });
    if (error) throw new Error(`claim_jobs failed: ${error.message}`);
    if (!jobs?.length) break;
    await Promise.all(
      jobs.map(async (job: { id: string; name: JobName; data: Record<string, unknown>; attempts: number; max_attempts: number }) => {
        try {
          const fn = processors[job.name];
          if (!fn) throw new Error(`No processor for ${job.name}`);
          await fn(job.data);
          await db.from("jobs").update({ status: "done", last_error: null }).eq("id", job.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const failed = job.attempts >= job.max_attempts;
          logger.error({ job: job.name, id: job.id, attempts: job.attempts, err: message }, failed ? "job failed permanently" : "job failed, will retry");
          await db
            .from("jobs")
            .update(failed ? { status: "failed", last_error: message } : { status: "pending", last_error: message, run_at: new Date(Date.now() + BACKOFF_MS * 2 ** (job.attempts - 1)).toISOString() })
            .eq("id", job.id);
        }
      }),
    );
    ran += jobs.length;
  }
  return ran;
}
