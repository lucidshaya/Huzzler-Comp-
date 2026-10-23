import crypto from "node:crypto";
import { db, must, ok } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import { badRequest, forbidden, notFound, HttpError } from "../lib/errors.js";
import { paystack, type PaystackTransaction } from "./paystack.js";
import { getProfile } from "./profile.js";

/** Paystack references for token top-ups; payments.ts routes these here. */
export const TOKEN_REF_PREFIX = "hz_t_";

export type TokenReason = "purchase" | "cv_generate" | "refund" | "admin_grant" | "welcome";

export async function cvSettings() {
  const { data } = await db.from("feature_flags").select("enabled, value").eq("key", "cv_builder").maybeSingle();
  const v = (data?.value ?? {}) as { cost?: number; welcome?: number };
  return { enabled: data?.enabled ?? true, cost: v.cost ?? 50, welcome: v.welcome ?? 0 };
}

export async function getBalance(userId: string): Promise<number> {
  const { data } = await db.from("token_wallets").select("balance").eq("user_id", userId).maybeSingle();
  return data?.balance ?? 0;
}

/** Creates the wallet on first visit and gives the one-off welcome tokens, if switched on. */
export async function ensureWallet(userId: string) {
  ok(await db.from("token_wallets").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true }), "wallet create");
  const { welcome } = await cvSettings();
  if (welcome > 0) await creditTokens(userId, welcome, "welcome", userId);
}

/** Atomic debit. Throws 402 INSUFFICIENT_TOKENS when the balance is too low. */
export async function spendTokens(userId: string, amount: number, reason: TokenReason, ref: string, meta: Record<string, unknown> = {}) {
  const { data, error } = await db.rpc("spend_tokens", { p_user: userId, p_amount: amount, p_reason: reason, p_ref: ref, p_meta: meta });
  if (error) {
    if (error.message.includes("INSUFFICIENT_TOKENS")) throw new HttpError(402, `You need ${amount} tokens for this. Top up your balance to continue.`, "INSUFFICIENT_TOKENS");
    throw new Error(`spend_tokens failed: ${error.message}`);
  }
  return data as number;
}

/** Credits once per (reason, ref); repeats return the current balance. */
export async function creditTokens(userId: string, amount: number, reason: TokenReason, ref: string, meta: Record<string, unknown> = {}) {
  const { data, error } = await db.rpc("credit_tokens", { p_user: userId, p_amount: amount, p_reason: reason, p_ref: ref, p_meta: meta });
  if (error) throw new Error(`credit_tokens failed: ${error.message}`);
  return data as number;
}

export async function walletSummary(userId: string) {
  await ensureWallet(userId);
  const [balance, settings, { data: packs }, { data: history }] = await Promise.all([
    getBalance(userId),
    cvSettings(),
    db.from("token_packs").select("id, name, tokens, amount_kobo").eq("active", true).order("sort_order"),
    db.from("token_ledger").select("id, delta, balance_after, reason, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);
  return { balance, costs: { cv_generate: settings.cost }, packs: packs ?? [], history: history ?? [] };
}

// ---------------------------------------------------------------------------
// Top-ups via Paystack
// ---------------------------------------------------------------------------
export async function initializeTokenPurchase(userId: string, packId: string) {
  const { data: pack } = await db.from("token_packs").select("*").eq("id", packId).eq("active", true).maybeSingle();
  if (!pack) throw notFound("That token pack isn't available.");
  const profile = await getProfile(userId);
  if (profile.is_minor) {
    const { data: g } = await db.from("guardian_consents").select("id").eq("user_id", userId).eq("status", "accepted").maybeSingle();
    if (!g) throw forbidden("A guardian needs to approve your account before payment.", "GUARDIAN_REQUIRED");
  }
  const { data: authUser } = await db.auth.admin.getUserById(userId);
  const email = authUser.user?.email;
  if (!email) throw badRequest("Your account needs an email address to pay.");

  const reference = `${TOKEN_REF_PREFIX}${crypto.randomBytes(9).toString("hex")}`;
  ok(
    await db.from("token_purchases").insert({ user_id: userId, pack_id: pack.id, reference, tokens: pack.tokens, amount_kobo: pack.amount_kobo, status: "pending" }),
    "token purchase insert",
  );
  const init = await paystack.initialize({
    email,
    amount: pack.amount_kobo,
    reference,
    callback_url: `${env.APP_URL}/billing/callback`,
    metadata: { user_id: userId, kind: "tokens", pack_id: pack.id },
  });
  return { reference, authorization_url: init.authorization_url, access_code: init.access_code };
}

/** Applies a successful top-up exactly once (verify endpoint or webhook, whichever is first). */
export async function applyTokenPurchase(tx: PaystackTransaction, via: "verify" | "webhook") {
  if (tx.status !== "success") return { applied: false, reason: tx.status };
  const { data: purchase } = await db.from("token_purchases").select("*").eq("reference", tx.reference).maybeSingle();
  if (!purchase) {
    logger.warn({ reference: tx.reference }, "token charge for unknown reference");
    return { applied: false, reason: "purchase row missing" };
  }
  if (tx.amount !== purchase.amount_kobo || tx.currency !== "NGN") {
    await db.from("token_purchases").update({ status: "failed", raw: tx as unknown as Record<string, unknown> }).eq("id", purchase.id).neq("status", "success");
    logger.error({ reference: tx.reference, amount: tx.amount, expected: purchase.amount_kobo }, "token purchase amount mismatch");
    await audit(null, "tokens.amount_mismatch", "token_purchase", purchase.id, { amount: tx.amount, expected: purchase.amount_kobo });
    return { applied: false, reason: "amount mismatch" };
  }
  const { data: updated } = await db
    .from("token_purchases")
    .update({ status: "success", paid_at: tx.paid_at ?? new Date().toISOString(), channel: tx.channel, paystack_transaction_id: tx.id, verified_via: via, raw: tx as unknown as Record<string, unknown> })
    .eq("id", purchase.id)
    .neq("status", "success")
    .select("id");
  // The ledger's (reason, ref) key also guards the credit, so a crash between the two steps can be retried safely.
  const balance = await creditTokens(purchase.user_id, purchase.tokens, "purchase", purchase.reference, { pack_id: purchase.pack_id });
  if (!updated?.length) return { applied: false, reason: "already applied" };
  await notify(purchase.user_id, "tokens.purchased", "Tokens added", `${purchase.tokens.toLocaleString("en-NG")} tokens are in your wallet. New balance: ${balance.toLocaleString("en-NG")}.`);
  return { applied: true };
}

export async function verifyTokenPurchase(userId: string, reference: string) {
  const { data: purchase } = await db.from("token_purchases").select("user_id, status").eq("reference", reference).maybeSingle();
  if (!purchase || purchase.user_id !== userId) throw notFound("Payment not found");
  if (purchase.status === "success") return { status: "success", kind: "tokens" as const };
  const tx = await paystack.verify(reference);
  if (tx.status === "success") {
    await applyTokenPurchase(tx, "verify");
    return { status: "success", kind: "tokens" as const };
  }
  if (tx.status === "failed" || tx.status === "abandoned") {
    await db.from("token_purchases").update({ status: tx.status, raw: tx as unknown as Record<string, unknown> }).eq("reference", reference).eq("status", "pending");
  }
  return { status: tx.status, kind: "tokens" as const };
}

/** Staff grant (support, goodwill, testing). */
export async function grantTokens(adminId: string, userId: string, amount: number, note: string) {
  must(await db.from("profiles").select("id").eq("id", userId).single(), "profile");
  await ensureWallet(userId);
  const balance = await creditTokens(userId, amount, "admin_grant", crypto.randomUUID(), { admin_id: adminId, note });
  await audit(adminId, "tokens.grant", "profile", userId, { amount, note });
  return { balance };
}
