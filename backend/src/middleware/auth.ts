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

/** Verifies the Supabase JWT on every request (Supabase validates signature + expiry + revocation). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new HttpError(401, "Sign in required");
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) throw new HttpError(401, "Session expired, please sign in again");
    const { data: profile } = await db.from("profiles").select("app_role, deleted_at").eq("id", data.user.id).single();
    if (!profile || profile.deleted_at) throw new HttpError(401, "Account not found");
    // getUser has already validated the token; read the assurance level from its payload.
    const aal = (() => {
      try {
        return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).aal ?? "aal1";
      } catch {
        return "aal1";
      }
    })();
    req.user = { id: data.user.id, email: data.user.email ?? null, appRole: profile.app_role, aal };

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
