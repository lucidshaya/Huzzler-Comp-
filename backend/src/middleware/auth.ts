import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "../lib/supabase.js";
import { adminMfaRequired } from "../config/env.js";
import { HttpError, forbidden } from "../lib/errors.js";
import { hasPaidAccess, type JourneyStatus } from "../domain/journey.js";

export type AuthedUser = { id: string; email: string | null; appRole: string; aal: string };
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

const lastSeen = new Map<string, number>();

// Verified sessions are cached briefly so each request doesn't pay two extra Supabase round trips.
// A revoked session or a role change takes effect within AUTH_CACHE_MS.
const AUTH_CACHE_MS = 60_000;
const authCache = new Map<string, { user: AuthedUser; until: number }>();
const cacheKey = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
export const clearAuthCache = (userId?: string) => {
  if (!userId) return authCache.clear();
  for (const [k, v] of authCache) if (v.user.id === userId) authCache.delete(k);
};

/** Verifies the Supabase JWT on every request (Supabase validates signature + expiry + revocation). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new HttpError(401, "Sign in required");
    const key = cacheKey(token);
    const hit = authCache.get(key);
    if (hit && hit.until > Date.now()) {
      req.user = hit.user;
    } else {
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) throw new HttpError(401, "Session expired, please sign in again");
      const { data: profile } = await db.from("profiles").select("app_role, deleted_at").eq("id", data.user.id).single();
      if (!profile || profile.deleted_at) throw new HttpError(401, "Account not found");
      // getUser has already validated the token; read the assurance level and expiry from its payload.
      const payload = (() => {
        try {
          return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { aal?: string; exp?: number };
        } catch {
          return {};
        }
      })();
      req.user = { id: data.user.id, email: data.user.email ?? null, appRole: profile.app_role, aal: payload.aal ?? "aal1" };
      const until = Math.min(Date.now() + AUTH_CACHE_MS, (payload.exp ?? 0) * 1000);
      if (until > Date.now()) authCache.set(key, { user: req.user, until });
      if (authCache.size > 5000) authCache.delete(authCache.keys().next().value!);
    }

    // Activity tracking for inactivity rules, throttled to once per 10 minutes per user.
    const now = Date.now();
    if ((lastSeen.get(req.user.id) ?? 0) < now - 600_000) {
      lastSeen.set(req.user.id, now);
      void db.from("user_journey").update({ last_active_at: new Date(now).toISOString() }).eq("user_id", req.user.id);
    }
    next();
  } catch (err) {
    next(err);
  }
}

export const requireRole =
  (...roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Sign in required"));
    if (req.user.appRole !== "admin" && !roles.includes(req.user.appRole)) return next(forbidden("Staff access required"));
    if (adminMfaRequired && req.user.aal !== "aal2") return next(forbidden("Two-factor verification required", "MFA_REQUIRED"));
    next();
  };

/** Blocks anything that needs a paid, non-lapsed, non-suspended account. */
export async function requirePaidAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    const { data } = await db.from("user_journey").select("status").eq("user_id", req.user!.id).single();
    const s = data?.status as JourneyStatus;
    if (s === "LAPSED") throw forbidden("Your plan has lapsed. Renew to continue — your work is saved.", "LAPSED");
    if (s === "SUSPENDED") throw forbidden("Your account is suspended. Contact support.", "SUSPENDED");
    if (!hasPaidAccess(s)) throw forbidden("Begin onboarding to unlock this.", "PAYMENT_REQUIRED");
    next();
  } catch (err) {
    next(err);
  }
}
