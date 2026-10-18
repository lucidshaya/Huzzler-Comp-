import crypto from "node:crypto";
import { env } from "../config/env.js";

const BASE = "https://api.paystack.co";

async function ps<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || json.status === false) throw new Error(`Paystack ${path}: ${json.message ?? res.status}`);
  return json.data as T;
}

export type PaystackTransaction = {
  id: number;
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "reversed";
  reference: string;
  amount: number;
  currency: string;
  channel: string;
  paid_at: string | null;
  metadata: Record<string, unknown> | string | null;
  customer: { email: string; customer_code: string };
  plan?: { plan_code?: string } | string | null;
  plan_object?: { plan_code?: string };
};

export const paystack = {
  initialize: (p: { email: string; amount: number; reference: string; callback_url: string; metadata: Record<string, unknown>; plan?: string; channels?: string[] }) =>
    ps<{ authorization_url: string; access_code: string; reference: string }>("POST", "/transaction/initialize", p),
  verify: (reference: string) => ps<PaystackTransaction>("GET", `/transaction/verify/${encodeURIComponent(reference)}`),
  createPlan: (p: { name: string; interval: "monthly"; amount: number; currency: "NGN" }) => ps<{ plan_code: string }>("POST", "/plan", p),
  listPlans: () => ps<Array<{ plan_code: string; name: string; amount: number; interval: string }>>("GET", "/plan"),
  disableSubscription: (code: string, token: string) => ps<unknown>("POST", "/subscription/disable", { code, token }),
  fetchSubscription: (code: string) => ps<{ subscription_code: string; email_token: string; status: string; next_payment_date: string | null }>("GET", `/subscription/${code}`),
  manageLink: (code: string) => ps<{ link: string }>("GET", `/subscription/${code}/manage/link`),
  refund: (transaction: number, amount?: number) => ps<{ id: number; status: string }>("POST", "/refund", { transaction, ...(amount ? { amount } : {}) }),
};

/** HMAC SHA-512 of the raw request body with the secret key, compared in constant time. */
export function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
