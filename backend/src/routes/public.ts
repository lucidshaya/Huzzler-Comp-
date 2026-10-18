import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { h, parse } from "./util.js";
import { notFound, HttpError } from "../lib/errors.js";
import { verifySignature } from "../services/paystack.js";
import { recordWebhook } from "../services/payments.js";
import { enqueue } from "../jobs/queue.js";
import { getGuardianRequest, respondGuardian } from "../services/profile.js";
import { verifyCertificate, publicPortfolio } from "../services/certification.js";
import { recordCiResult } from "../services/projects.js";

export const publicRouter = Router();

publicRouter.get(
  "/catalogue",
  h(async () => {
    const [roles, archetypes, compat, plans] = await Promise.all([
      db.from("roles").select("*").order("sort_order"),
      db.from("archetypes").select("*"),
      db.from("role_archetype_compatibility").select("role_id, archetype_id"),
      db.from("plans").select("id, name, amount_kobo, interval, access_days"),
    ]);
    return { roles: roles.data, archetypes: archetypes.data, compatibility: compat.data, plans: plans.data };
  }),
);

// Paystack webhook: verify signature on the raw body, store, ack fast, process in the queue.
publicRouter.post("/webhooks/paystack", async (req, res, next) => {
  try {
    const raw: Buffer | undefined = (req as any).rawBody;
    if (!raw || !verifySignature(raw, req.header("x-paystack-signature"))) {
      logger.warn("rejected unsigned Paystack webhook");
      return res.status(401).end();
    }
    const id = await recordWebhook(raw, req.body);
    if (id) await enqueue("process_payment_event", { eventId: id }, { jobId: `ps-${id}` });
    res.status(200).end();
  } catch (err) {
    next(err);
  }
});

publicRouter.get(
  "/guardian/:token",
  h(async (req) => {
    const r = await getGuardianRequest(req.params.token);
    return { guardian_name: r.guardian_name, child_first_name: r.child_first_name, status: r.status, expired: r.expired };
  }),
);
publicRouter.post(
  "/guardian/:token",
  h(async (req) => {
    const { accept, confirm_guardian } = parse(z.object({ accept: z.boolean(), confirm_guardian: z.literal(true) }), req.body);
    void confirm_guardian;
    return respondGuardian(req.params.token, accept, req.ip);
  }),
);

publicRouter.get(
  "/verify/:code",
  h(async (req) => {
    const cert = await verifyCertificate(req.params.code);
    if (!cert) throw notFound("No valid certificate with this ID.");
    return cert;
  }),
);

publicRouter.get(
  "/portfolio/:username",
  h(async (req) => {
    const p = await publicPortfolio(req.params.username);
    if (!p) throw notFound();
    return p;
  }),
);

// GitHub Actions posts acceptance-test results here (token from the project's CI settings).
publicRouter.post(
  "/ci/:instanceId",
  h(async (req) => {
    const b = parse(z.object({ token: z.string(), passed: z.number().int().min(0), total: z.number().int().min(1) }), req.body);
    if (b.passed > b.total) throw new HttpError(400, "passed > total");
    return recordCiResult(req.params.instanceId, b.token, b.passed, b.total);
  }),
);
