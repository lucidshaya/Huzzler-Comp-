import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { createApp } from "./app.js";
import { SCHEDULE } from "./jobs/processors.js";
import { enqueue } from "./jobs/queue.js";

createApp().listen(env.PORT, () => logger.info({ port: env.PORT }, "Huzzler API listening"));

// Without Redis (local dev) there's no worker process, so run the schedule in-process.
if (!env.REDIS_URL && env.NODE_ENV !== "production") {
  for (const s of SCHEDULE) setInterval(() => void enqueue(s.name), s.everyMs).unref();
  logger.warn("REDIS_URL not set: background jobs run in-process (development only)");
}
