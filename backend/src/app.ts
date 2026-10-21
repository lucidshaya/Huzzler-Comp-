import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { HttpError } from "./lib/errors.js";
import { publicRouter } from "./routes/public.js";
import { meRouter } from "./routes/me.js";
import { billingRouter } from "./routes/billing.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { teamRouter } from "./routes/team.js";
import { supportRouter } from "./routes/support.js";
import { adminRouter, adminAuthRouter } from "./routes/admin.js";
import { aipmRouter } from "./routes/aipm.js";
import { requireAuth } from "./middleware/auth.js";
import { maintenanceGate } from "./lib/maintenance.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet());
  const origins = env.CORS_ORIGINS.split(",").map((s) => s.trim());
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || origins.includes(origin)), credentials: false }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));

  // Raw body is kept for Paystack signature verification.
  app.use(express.json({ limit: "1mb", verify: (req, _res, buf) => ((req as any).rawBody = buf) }));

  const limiter = (windowMs: number, limit: number) => rateLimit({ windowMs, limit, standardHeaders: "draft-7", legacyHeaders: false });
  app.use("/api", limiter(60_000, 300));
  app.use(["/api/billing", "/api/webhooks"], limiter(60_000, 30));
  app.use("/api/mentor", limiter(60_000, 20));
  app.use(["/api/support", "/api/help"], limiter(60_000, 30));
  app.use(["/api/admin/auth", "/api/guardian", "/api/invites"], limiter(15 * 60_000, 20));
  app.use("/api/workstation/run", limiter(60_000, 20));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", publicRouter);
  app.use("/api/admin/auth", adminAuthRouter);
  app.use("/api", requireAuth);
  app.use("/api", maintenanceGate);
  app.use("/api/me", meRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/onboarding", onboardingRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/aipm", aipmRouter);
  app.use("/api", supportRouter);
  app.use("/api", teamRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    req.log?.error({ err }, "unhandled error");
    res.status(500).json({ error: "Something went wrong on our side. Please try again." });
  });
  return app;
}
