import crypto from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import { db } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { h, parse } from "./util.js";
import { notFound, HttpError } from "../lib/errors.js";
import { verifySignature } from "../services/paystack.js";
import { recordWebhook } from "../services/payments.js";
import { enqueue, kickDrain } from "../jobs/queue.js";
import { env } from "../config/env.js";
import { getMaintenance } from "../lib/maintenance.js";
import { unsubscribe } from "../services/emailCampaigns.js";
import { getGuardianRequest, respondGuardian } from "../services/profile.js";
import { verifyCertificate, publicPortfolio } from "../services/certification.js";
import { recordCiResult } from "../services/projects.js";
import { AcceptInput, acceptInvite, inviteInfo } from "../services/staff.js";

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

// Staff invites: open the link from the email, set a username and password.
publicRouter.get("/invites/:token", h(async (req) => inviteInfo(req.params.token)));
publicRouter.post("/invites/:token/accept", h(async (req) => acceptInvite(req.params.token, parse(AcceptInput, req.body), req.ip)));

// Site status for the web app (maintenance screen). Public and cheap: cached for 15s.
publicRouter.get(
  "/status",
  h(async () => {
    const m = await getMaintenance();
    return { maintenance: { enabled: m.enabled, message: m.message, eta: m.eta } };
  }),
);

// Unsubscribe from announcements. GET shows a confirm button (link scanners prefetch GETs);
// POST does it, which is also what mail apps' one-click "Unsubscribe" sends (RFC 8058).
const unsubPage = (title: string, body: string, form = "") =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Huzzler</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1f2933;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#fff"><main style="max-width:420px;padding:32px;text-align:center"><div style="font-size:22px;font-weight:800;margin-bottom:18px">Huzzler</div><h1 style="font-size:20px;margin:0 0 8px">${title}</h1><p style="color:#cbd2d9;line-height:1.6;margin:0 0 20px">${body}</p>${form}</main></body></html>`;

publicRouter.get("/email/unsubscribe", (req, res) => {
  const u = String(req.query.u ?? "");
  const t = String(req.query.t ?? "");
  if (!/^[0-9a-f-]{36}$/.test(u) || !/^[0-9a-f]{32}$/.test(t)) return res.status(400).type("html").send(unsubPage("Link not valid", "This unsubscribe link is incomplete. Use the link from the latest email."));
  res.type("html").send(
    unsubPage(
      "Unsubscribe from announcements?",
      "You'll stop getting Huzzler announcement emails. Important account emails (payments, guardian consent) still reach you.",
      `<form method="post"><input type="hidden" name="u" value="${u}"><input type="hidden" name="t" value="${t}"><button style="background:#1cb0f6;color:#fff;border:0;border-radius:14px;padding:12px 22px;font-weight:800;font-size:15px;cursor:pointer">Unsubscribe</button></form>`,
    ),
  );
});
publicRouter.post("/email/unsubscribe", express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    const u = String(req.body?.u ?? req.query.u ?? "");
    const t = String(req.body?.t ?? req.query.t ?? "");
    const ok = /^[0-9a-f-]{36}$/.test(u) && /^[0-9a-f]{32}$/.test(t) && (await unsubscribe(u, t));
    if (!ok) return res.status(400).type("html").send(unsubPage("Link not valid", "We couldn't verify this unsubscribe link. Use the link from the latest email."));
    res.type("html").send(unsubPage("You're unsubscribed", "You won't get Huzzler announcement emails any more. You can close this page."));
  } catch (err) {
    next(err);
  }
});

// pg_cron pings this every minute (see migration 20261018000003_jobs.sql). Ack fast, drain in the background.
publicRouter.post("/jobs/drain", (req, res) => {
  const token = Buffer.from(req.header("authorization")?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(env.CRON_SECRET ?? "");
  if (!env.CRON_SECRET || token.length !== expected.length || !crypto.timingSafeEqual(token, expected)) return res.status(401).end();
  kickDrain();
  res.status(202).json({ ok: true });
});

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
