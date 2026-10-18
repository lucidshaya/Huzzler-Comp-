import { Queue } from "bullmq";
import { env } from "../config/env.js";
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
  | "issue_certificate";

export const QUEUE_NAME = "huzzler";

export const redisConnection = () => {
  const u = new URL(env.REDIS_URL!);
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, username: u.username || undefined, tls: u.protocol === "rediss:" ? {} : undefined, maxRetriesPerRequest: null };
};

let queue: Queue | null = null;
const getQueue = () => (queue ??= new Queue(QUEUE_NAME, { connection: redisConnection() }));

const DEFAULTS = { attempts: 5, backoff: { type: "exponential" as const, delay: 10_000 }, removeOnComplete: 1000, removeOnFail: 5000 };

/**
 * Enqueue background work. With REDIS_URL set this is BullMQ (durable, survives restarts, run by
 * `npm run dev:worker`). Without Redis (local dev only) jobs run in-process after the response.
 */
export async function enqueue(name: JobName, data: Record<string, unknown> = {}, opts: { delayMs?: number; jobId?: string } = {}) {
  if (env.REDIS_URL) {
    await getQueue().add(name, data, { ...DEFAULTS, delay: opts.delayMs, jobId: opts.jobId });
    return;
  }
  if (env.NODE_ENV === "production") throw new Error("REDIS_URL is required in production");
  const run = async (attempt: number): Promise<void> => {
    try {
      const { processors } = await import("./processors.js");
      await processors[name](data);
    } catch (err) {
      logger.error({ err, name, attempt }, "inline job failed");
      if (attempt < 3) setTimeout(() => void run(attempt + 1), 5_000 * attempt);
    }
  };
  setTimeout(() => void run(1), opts.delayMs ?? 0);
}
