import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

/** Service-role client. Bypasses RLS: every query must scope by the caller's id. */
export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Anon client, used only to sign staff in with a password on their behalf. */
export const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Unwraps a Supabase result, throwing on error. */
export function must<T>(res: { data: T; error: { message: string } | null }, what = "query"): NonNullable<T> {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what} returned no data`);
  return res.data as NonNullable<T>;
}

/** Throws on error for writes that don't return rows. */
export function ok(res: { error: { message: string } | null }, what = "write"): void {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
}
