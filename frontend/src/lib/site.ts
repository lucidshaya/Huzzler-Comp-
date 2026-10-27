/**
 * The public address of the web app. Share previews (WhatsApp, LinkedIn, X) and canonical links
 * need absolute URLs. Override with VITE_SITE_URL for previews or staging.
 */
export const SITE_URL: string = (import.meta.env.VITE_SITE_URL ?? "https://huzzler.tech").replace(
  /\/$/,
  "",
);
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");
export const absolute = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** Where people reach a person at Huzzler (also the Data Protection contact). */
export const SUPPORT_EMAIL = "fourtechonoliges@gmail.com";
