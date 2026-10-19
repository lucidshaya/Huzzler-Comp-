import type { Request, Response, NextFunction } from "express";
import { db } from "./supabase.js";

export type Maintenance = { enabled: boolean; message: string; eta: string | null; updated_at: string | null };

const DEFAULT_MESSAGE = "We're improving Huzzler and will be back shortly. Your progress and drafts are safe.";
const KEY = "maintenance_mode";
let cache: { at: number; value: Maintenance } | null = null;

/** Site-wide maintenance switch (feature_flags.maintenance_mode), cached for 15 seconds. */
export async function getMaintenance(): Promise<Maintenance> {
  if (cache && Date.now() - cache.at < 15_000) return cache.value;
  const { data } = await db.from("feature_flags").select("enabled, value, updated_at").eq("key", KEY).maybeSingle();
  const v = (data?.value ?? {}) as { message?: string; eta?: string | null };
  const value = { enabled: Boolean(data?.enabled), message: v.message?.trim() || DEFAULT_MESSAGE, eta: v.eta ?? null, updated_at: data?.updated_at ?? null };
  cache = { at: Date.now(), value };
  return value;
}

export async function setMaintenance(enabled: boolean, message: string | null, eta: string | null) {
  await db.from("feature_flags").upsert({ key: KEY, enabled, value: { message: message?.trim() || null, eta } }, { onConflict: "key" });
  cache = null;
  return getMaintenance();
}

/**
 * While maintenance is on, learner-facing API calls get 503 MAINTENANCE. Staff (any non-user role)
 * keep working so the team can test; /admin and /aipm are never gated. Runs after requireAuth.
 */
export async function maintenanceGate(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.path.startsWith("/admin") || req.path.startsWith("/aipm")) return next();
    if (req.user && req.user.appRole !== "user") return next();
    const m = await getMaintenance();
    if (!m.enabled) return next();
    res.setHeader("Retry-After", "300");
    return res.status(503).json({ error: m.message, code: "MAINTENANCE", eta: m.eta });
  } catch (err) {
    next(err);
  }
}
