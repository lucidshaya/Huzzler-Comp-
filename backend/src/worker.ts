import { Worker, Queue } from "bullmq";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { QUEUE_NAME, redisConnection, type JobName } from "./jobs/queue.js";
import { processors, SCHEDULE } from "./jobs/processors.js";

if (!env.REDIS_URL) {
  logger.error("REDIS_URL is not set. Without Redis, jobs run inside the API process (dev only) and this worker isn't needed.");
  process.exit(1);
}

const queue = new Queue(QUEUE_NAME, { connection: redisConnection() });
for (const s of SCHEDULE) {
  await queue.upsertJobScheduler(`cron:${s.name}`, { pattern: s.cron }, { name: s.name, data: {} });
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const fn = processors[job.name as JobName];
    if (!fn) throw new Error(`No processor for ${job.name}`);
    return fn(job.data);
  },
  { connection: redisConnection(), concurrency: 8 },
);

worker.on("failed", (job, err) => logger.error({ job: job?.name, id: job?.id, attempts: job?.attemptsMade, err: err.message }, "job failed"));
worker.on("completed", (job) => logger.debug({ job: job.name, id: job.id }, "job done"));
logger.info({ schedules: SCHEDULE.length }, "worker started");

const shutdown = async () => {
  await worker.close();
  await queue.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
