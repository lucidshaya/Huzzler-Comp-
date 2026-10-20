import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client. Sessions live in cookies managed by @supabase/ssr (not localStorage).
 * Only call this in the browser (effects, event handlers, client-only routes).
 */
export function supabase(): SupabaseClient {
  if (typeof window === "undefined") throw new Error("supabase() is browser-only");
  client ??= createBrowserClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  return client;
}

/** Set before a deliberate sign-out so the app doesn't treat it as an expired session. */
export const signOutIntent = { current: false };

/**
 * Always completes: asks Supabase to revoke the session (max 3s), then clears the local session
 * and any leftover auth cookies, then hard-redirects so no cached page state survives.
 */
export async function signOut(redirectTo = "/auth?mode=login") {
  signOutIntent.current = true;
  const sb = supabase();
  try {
    await Promise.race([sb.auth.signOut(), new Promise((r) => setTimeout(r, 3000))]);
  } catch {
    // network or already-revoked session: fall through to local cleanup
  }
  try {
    await sb.auth.signOut({ scope: "local" });
  } catch {
    // ignore
  }
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0]?.trim();
    if (name?.startsWith("sb-")) document.cookie = `${name}=; Max-Age=0; path=/`;
  }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("sb-")) localStorage.removeItem(k);
  } catch {
    // storage blocked
  }
  window.location.replace(redirectTo);
}
