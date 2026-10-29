import { api } from "./api";

// Sends browser crashes to the API (logged and kept in the audit log) so we can see the real error
// behind "the site crashed". Signed-in pages only; at most a few per page load, no duplicates.

const sent = new Set<string>();

// After a deploy, an open tab asks for code chunks from the previous release, which no longer exist.
// Reload once to pick up the new release instead of showing an error page.
const STALE_CHUNK =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;
const RELOAD_KEY = "hz-stale-reload";

/** True when the page is reloading to recover from a stale chunk (callers should render nothing). */
export function reloadOnStaleChunk(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  const msg = error instanceof Error ? error.message : String(error);
  if (!STALE_CHUNK.test(msg)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false; // reloaded just now and it failed again: show the error
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

export function reportClientError(error: unknown, where: string) {
  try {
    if (typeof window === "undefined" || sent.size >= 5) return;
    if (reloadOnStaleChunk(error)) return;
    const e = error instanceof Error ? error : new Error(String(error));
    const key = `${where}:${e.message}`;
    if (sent.has(key)) return;
    sent.add(key);
    void api("/client-errors", {
      body: {
        message: e.message.slice(0, 1000),
        stack: e.stack?.slice(0, 4000),
        where: where.slice(0, 80),
        url: window.location.pathname + window.location.search,
        ua: navigator.userAgent.slice(0, 300),
      },
    }).catch(() => undefined);
  } catch {
    /* never let reporting cause another error */
  }
}

let installed = false;
/** Window-level errors (outside React's render) too. */
export function installClientErrorReporting() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (ev) =>
    reportClientError(ev.error ?? ev.message, "window.onerror"),
  );
  window.addEventListener("unhandledrejection", (ev) =>
    reportClientError(ev.reason, "unhandledrejection"),
  );
  // Vite's own signal that a preloaded chunk is missing.
  window.addEventListener("vite:preloadError", (ev) => {
    const err = (ev as Event & { payload?: unknown }).payload;
    if (reloadOnStaleChunk(err ?? new Error("Failed to fetch dynamically imported module")))
      ev.preventDefault();
  });
}
