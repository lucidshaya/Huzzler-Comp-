import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

/**
 * A stalled connection must fail fast instead of hanging the request until the platform kills it.
 * Auth calls and storage uploads get longer.
 */
const timedFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const ms = url.includes("/storage/v1/") ? 60_000 : url.includes("/auth/v1/") ? 45_000 : 20_000;
  const signal = init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
  return fetch(input, { ...init, signal });
};

/** Service-role client. Bypasses RLS: every query must scope by the caller's id. */
export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: timedFetch },
});

/** Anon client, used only to sign staff in with a password on their behalf. */
export const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: timedFetch },
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
