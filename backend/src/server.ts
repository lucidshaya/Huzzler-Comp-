import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { createApp } from "./app.js";

// Long-running host (local dev, or any Node server). On Vercel, api/index.js serves the app instead.
// Recurring jobs are scheduled by pg_cron in the database, not here.
createApp().listen(env.PORT, () => logger.info({ port: env.PORT }, "Huzzler API listening"));
