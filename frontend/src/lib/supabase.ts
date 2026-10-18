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

export async function signOut() {
  signOutIntent.current = true;
  await supabase().auth.signOut();
}
