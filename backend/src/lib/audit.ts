import { db } from "./supabase.js";
import { logger } from "./logger.js";

export async function audit(actorId: string | null, action: string, targetType: string | null, targetId: string | null, details: Record<string, unknown> = {}, ip?: string) {
  const { error } = await db.from("audit_logs").insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, details, ip });
  if (error) logger.error({ err: error, action }, "audit log write failed");
}
