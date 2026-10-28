import { api } from "./api";

// Sends browser crashes to the API (logged and kept in the audit log) so we can see the real error
// behind "the site crashed". Signed-in pages only; at most a few per page load, no duplicates.

const sent = new Set<string>();

export function reportClientError(error: unknown, where: string) {
  try {
    if (typeof window === "undefined" || sent.size >= 5) return;
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
}
