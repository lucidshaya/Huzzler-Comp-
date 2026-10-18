import { db, must } from "../lib/supabase.js";
import { canTransition, type JourneyStatus } from "../domain/journey.js";
import { conflict } from "../lib/errors.js";

export type Journey = {
  user_id: string;
  status: JourneyStatus;
  resume_status: JourneyStatus | null;
  plan_id: string | null;
  access_expires_at: string | null;
  grace_until: string | null;
  attempts_used: number;
  next_attempt_at: string | null;
  offers_declined: number;
  failed_projects: number;
  status_changed_at: string;
  lapsed_at: string | null;
  last_active_at: string | null;
};

export async function getJourney(userId: string): Promise<Journey> {
  return must(await db.from("user_journey").select("*").eq("user_id", userId).single(), "journey");
}

/**
 * Guarded, server-side status change. The update is conditional on the current status so two
 * concurrent requests (e.g. Paystack verify + webhook) can't both apply the same transition.
 * Returns false (no error) when the user is already in `to` — callers treat that as idempotent.
 */
export async function transition(
  userId: string,
  to: JourneyStatus,
  reason: string,
  opts: { actorId?: string | null; extra?: Partial<Journey> } = {},
): Promise<boolean> {
  const j = await getJourney(userId);
  if (j.status === to) return false;
  if (!canTransition(j.status, to, j.resume_status)) {
    throw conflict(`Cannot move from ${j.status} to ${to}`, "INVALID_TRANSITION");
  }
  const sideState = to === "LAPSED" || to === "SUSPENDED";
  const leavingSide = j.status === "LAPSED" || j.status === "SUSPENDED";
  const patch: Record<string, unknown> = {
    status: to,
    status_changed_at: new Date().toISOString(),
    ...(sideState ? { resume_status: j.status } : {}),
    ...(leavingSide ? { resume_status: null } : {}),
    ...(opts.extra ?? {}),
  };
  const { data, error } = await db.from("user_journey").update(patch).eq("user_id", userId).eq("status", j.status).select("user_id");
  if (error) throw error;
  if (!data?.length) {
    // Lost a race: someone else moved the user. Re-read; fine if they ended up where we wanted.
    const now = await getJourney(userId);
    if (now.status === to) return false;
    throw conflict("Journey changed concurrently, please retry", "CONCURRENT_UPDATE");
  }
  await db.from("journey_events").insert({ user_id: userId, from_status: j.status, to_status: to, reason, actor_id: opts.actorId ?? null });
  return true;
}

/** Moves forward through several steps (e.g. FIELD_CHOSEN -> ONBOARDING_STARTED) if each is legal. */
export async function advanceTo(userId: string, path: JourneyStatus[], reason: string) {
  for (const s of path) {
    const j = await getJourney(userId);
    if (j.status === s) continue;
    if (canTransition(j.status, s, j.resume_status)) await transition(userId, s, reason);
  }
}
