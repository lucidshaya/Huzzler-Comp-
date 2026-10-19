import { supabase } from "./supabase";

/** Fired on any 401 so the app can show the "session expired" dialog. */
export const SESSION_EXPIRED_EVENT = "huzzler:session-expired";
/** Fired when the API answers 503 MAINTENANCE, so the maintenance gate re-checks right away. */
export const MAINTENANCE_EVENT = "huzzler:maintenance";

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function token(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.auth !== false) {
    const t = await token();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach Huzzler. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 && (data as { code?: string }).code === "MAINTENANCE" && typeof window !== "undefined")
    window.dispatchEvent(new Event(MAINTENANCE_EVENT));
  if (!res.ok)
    throw new ApiError(
      res.status,
      (data as { error?: string }).error ?? "Something went wrong",
      (data as { code?: string }).code,
    );
  return data as T;
}

/** Uploads a file straight to Supabase Storage using a signed upload URL from the API. */
export async function uploadFile(file: File, signPath = "/uploads/sign"): Promise<string> {
  const signed = await api<{ path: string; token: string }>(signPath, {
    body:
      signPath === "/uploads/sign"
        ? { filename: file.name }
        : { ext: file.name.split(".").pop()?.toLowerCase() },
  });
  const { error } = await supabase()
    .storage.from("submissions")
    .uploadToSignedUrl(signed.path, signed.token, file);
  if (error) throw new ApiError(400, error.message);
  return signed.path;
}

export const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;
