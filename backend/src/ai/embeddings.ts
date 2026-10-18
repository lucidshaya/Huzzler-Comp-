import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Embeds text with Supabase's built-in gte-small model via the `embed` Edge Function
 * (supabase/functions/embed). Returns null when embeddings are disabled or fail, and callers
 * fall back to non-vector behaviour.
 */
export async function embed(text: string): Promise<number[] | null> {
  if (!env.EMBEDDINGS_ENABLED) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/functions/v1/embed`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: text.slice(0, 8000) }),
    });
    if (!res.ok) throw new Error(`embed ${res.status}`);
    const { embedding } = (await res.json()) as { embedding: number[] };
    return embedding;
  } catch (err) {
    logger.warn({ err }, "embedding failed");
    return null;
  }
}

export const toPgVector = (v: number[]) => `[${v.join(",")}]`;
