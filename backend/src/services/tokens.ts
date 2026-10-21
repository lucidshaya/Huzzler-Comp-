import crypto from "node:crypto";
import { db, ok } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { audit } from "../lib/audit.js";
import { notify, emailUser, emailLayout } from "../lib/notify.js";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../lib/errors.js";
import { hasPaidAccess, PAID_STATUSES, type JourneyStatus } from "../domain/journey.js";
import { paystack, PaystackError, type PaystackTransaction } from "./paystack.js";
import { getJourney } from "./journey.js";

/** Token purchases use their own reference prefix so payment handlers can route them here. */
export const TOKEN_REF_PREFIX = "hz_t_";
export const isTokenReference = (ref: string) => ref.startsWith(TOKEN_REF_PREFIX);

export class InsufficientTokensError extends HttpError {
  constructor(needed: number, balance: number) {
    super(402, `This needs ${needed} tokens and you have ${balance}. Top up in Billing to keep going.`, "INSUFFICIENT_TOKENS");
  }
}

export async function tokenPrices() {
  const { data } = await db.from("token_prices").select("action, label, tool, cost, description").order("sort_order");
  return data ?? [];
}

export async function priceOf(action: string) {
  const { data } = await db.from("token_prices").select("action, label, tool, cost").eq("action", action).maybeSingle();
  if (!data) throw notFound("Unknown tool");
  return data;
}

export async function balanceOf(userId: string) {
  const { data } = await db.from("token_wallets").select("balance").eq("user_id", userId).maybeSingle();
  return data?.balance ?? 0;
}

/** Atomically spends tokens; throws InsufficientTokensError when the wallet is short. */
export async function spendTokens(userId: string, amount: number, label: string, tool: string, ref?: string) {
  if (amount <= 0) return balanceOf(userId);
  const { data, error } = await db.rpc("token_spend", { p_user: userId, p_amount: amount, p_label: label.slice(0, 200), p_tool: tool, p_ref: ref ?? null });
  if (error) {
    if (error.message.includes("INSUFFICIENT_TOKENS")) throw new InsufficientTokensError(amount, await balanceOf(userId));
    throw new Error(`token_spend failed: ${error.message}`);
  }
  return data as number;
}

export async function creditTokens(userId: string, amount: number, kind: "purchase" | "grant" | "stipend" | "refund", label: string, ref?: string, actorId?: string) {
  const { data, error } = await db.rpc("token_credit", { p_user: userId, p_amount: amount, p_kind: kind, p_label: label.slice(0, 200), p_ref: ref ?? null, p_actor: actorId ?? null });
  if (error) throw new Error(`token_credit failed: ${error.message}`);
  return data as number;
}

// ---------------------------------------------------------------------------
// Learner wallet
// ---------------------------------------------------------------------------

export async function walletSummary(userId: string) {
  const [{ data: wallet }, { data: ledger }, { data: packs }, prices, { data: purchases }, j] = await Promise.all([
    db.from("token_wallets").select("balance, lifetime_purchased, lifetime_granted, lifetime_spent").eq("user_id", userId).maybeSingle(),
    db.from("token_ledger").select("id, delta, balance_after, kind, label, tool, reference, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    db.from("token_packs").select("id, name, tokens, amount_kobo, description").eq("active", true).order("sort_order"),
    tokenPrices(),
    db.from("token_purchases").select("reference, pack_id, tokens, amount_kobo, status, channel, paid_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    getJourney(userId),
  ]);
  return {
    balance: wallet?.balance ?? 0,
    lifetime: { purchased: wallet?.lifetime_purchased ?? 0, granted: wallet?.lifetime_granted ?? 0, spent: wallet?.lifetime_spent ?? 0 },
    can_buy: hasPaidAccess(j.status),
    ledger: ledger ?? [],
    packs: packs ?? [],
    prices,
    purchases: purchases ?? [],
  };
}

export async function initializeTokenPurchase(userId: string, packId: string) {
  const j = await getJourney(userId);
  if (!hasPaidAccess(j.status)) throw forbidden("Tokens are for members with an active plan. Choose a plan first.", "PAYMENT_REQUIRED");
  const { data: pack } = await db.from("token_packs").select("*").eq("id", packId).eq("active", true).maybeSingle();
  if (!pack) throw notFound("That token pack isn't available.");
  const { data: authUser } = await db.auth.admin.getUserById(userId);
  const email = authUser.user?.email;
  if (!email) throw badRequest("Your account needs an email address to pay.");

  const reference = `${TOKEN_REF_PREFIX}${crypto.randomBytes(9).toString("hex")}`;
  ok(await db.from("token_purchases").insert({ user_id: userId, pack_id: pack.id, tokens: pack.tokens, amount_kobo: pack.amount_kobo, reference }), "token purchase insert");
  try {
    const init = await paystack.initialize({
      email,
      amount: pack.amount_kobo,
      reference,
      callback_url: `${env.APP_URL}/billing/callback`,
      metadata: { user_id: userId, kind: "tokens", pack_id: pack.id, tokens: pack.tokens },
    });
    return { reference, authorization_url: init.authorization_url };
  } catch (err) {
    await db.from("token_purchases").update({ status: "failed", raw: { init_error: String(err) } }).eq("reference", reference);
    logger.error({ err: String(err), reference }, "Paystack initialize (tokens) failed");
    if (err instanceof PaystackError && err.status < 500) throw new HttpError(400, `Paystack couldn't start the payment: ${err.providerMessage}`, "PAYMENT_INIT_FAILED");
    throw new HttpError(502, "We couldn't reach Paystack. Please try again in a moment.", "PAYMENT_PROVIDER_DOWN");
  }
}

/** Credits a successful token charge exactly once (verify and webhook can both arrive). */
export async function applyTokenCharge(tx: PaystackTransaction, via: "verify" | "webhook") {
  const { data: p } = await db.from("token_purchases").select("*").eq("reference", tx.reference).maybeSingle();
  if (!p) return { applied: false, reason: "unknown reference" };
  if (tx.status !== "success") {
    if (tx.status === "failed" || tx.status === "abandoned") await db.from("token_purchases").update({ status: tx.status }).eq("id", p.id).eq("status", "pending");
    return { applied: false, reason: tx.status };
  }
  if (tx.amount !== p.amount_kobo || tx.currency !== "NGN") {
    await db.from("token_purchases").update({ status: "failed", raw: tx as unknown as Record<string, unknown> }).eq("id", p.id).neq("status", "success");
    await audit(null, "tokens.amount_mismatch", "token_purchase", p.id, { amount: tx.amount, expected: p.amount_kobo });
    return { applied: false, reason: "amount mismatch" };
  }
  const { data: claimed } = await db
    .from("token_purchases")
    .update({ status: "success", paid_at: tx.paid_at ?? new Date().toISOString(), channel: tx.channel, paystack_transaction_id: tx.id, verified_via: via, raw: tx as unknown as Record<string, unknown> })
    .eq("id", p.id)
    .neq("status", "success")
    .select("id");
  if (!claimed?.length) return { applied: false, reason: "already applied" };

  const balance = await creditTokens(p.user_id, p.tokens, "purchase", `Paystack top-up (₦${(p.amount_kobo / 100).toLocaleString("en-NG")})`, tx.reference);
  await notify(p.user_id, "tokens.purchased", "Tokens added", `+${p.tokens.toLocaleString()} tokens. Your balance is ${balance.toLocaleString()}.`);
  void emailUser(
    p.user_id,
    "Your Huzzler token receipt",
    emailLayout("Tokens added to your wallet", `<p>Tokens: <b>${p.tokens.toLocaleString()}</b><br/>Amount: <b>₦${(p.amount_kobo / 100).toLocaleString("en-NG")}</b><br/>Reference: ${tx.reference}<br/>New balance: <b>${balance.toLocaleString()}</b></p>`, { label: "Open the Workstation", url: `${env.APP_URL}/workspace` }),
  );
  return { applied: true };
}

export async function verifyTokenPurchase(userId: string, reference: string) {
  const { data: p } = await db.from("token_purchases").select("user_id, status").eq("reference", reference).maybeSingle();
  if (!p || p.user_id !== userId) throw notFound("Payment not found");
  if (p.status === "success") return { status: "success", kind: "tokens" };
  const tx = await paystack.verify(reference);
  await applyTokenCharge(tx, "verify");
  return { status: tx.status, kind: "tokens" };
}

// ---------------------------------------------------------------------------
// Admin: the funding pool
// ---------------------------------------------------------------------------

export async function poolSummary() {
  const [{ data: pool }, { data: ledger }, { data: wallets }, { data: purchases }, { count: paidUsers }] = await Promise.all([
    db.from("token_pool").select("balance, lifetime_funded, lifetime_granted, updated_at").eq("id", 1).maybeSingle(),
    db.from("token_ledger").select("id, user_id, delta, balance_after, kind, label, tool, created_at, actor:actor_id(full_name, username), profile:user_id(full_name, username)").in("kind", ["pool_fund", "pool_grant", "grant", "stipend", "purchase"]).order("created_at", { ascending: false }).limit(80),
    db.from("token_wallets").select("user_id, balance, lifetime_purchased, lifetime_granted, lifetime_spent, profile:user_id(full_name, username)").order("balance", { ascending: false }).limit(50),
    db.from("token_purchases").select("reference, tokens, amount_kobo, status, paid_at, created_at, profile:user_id(full_name)").order("created_at", { ascending: false }).limit(50),
    db.from("user_journey").select("user_id", { count: "exact", head: true }).in("status", [...PAID_STATUSES, "CERTIFIED"]),
  ]);
  const sold = (purchases ?? []).filter((p) => p.status === "success");
  return {
    pool: { balance: Number(pool?.balance ?? 0), lifetime_funded: Number(pool?.lifetime_funded ?? 0), lifetime_granted: Number(pool?.lifetime_granted ?? 0) },
    paid_users: paidUsers ?? 0,
    revenue_kobo: sold.reduce((s, p) => s + p.amount_kobo, 0),
    tokens_sold: sold.reduce((s, p) => s + p.tokens, 0),
    ledger: (ledger ?? []).filter((l) => l.user_id === null || l.kind !== "purchase"),
    wallets: wallets ?? [],
    purchases: purchases ?? [],
    prices: await tokenPrices(),
  };
}

export async function fundPool(actorId: string, amount: number, note: string, ip?: string) {
  const { data, error } = await db.rpc("token_pool_fund", { p_amount: amount, p_label: note.slice(0, 200), p_actor: actorId });
  if (error) throw new Error(`token_pool_fund failed: ${error.message}`);
  await audit(actorId, "tokens.pool_funded", "token_pool", "1", { amount, note }, ip);
  return { balance: Number(data) };
}

async function grantOne(actorId: string | null, userId: string, amount: number, kind: "grant" | "stipend", label: string, ref?: string) {
  const { data, error } = await db.rpc("token_pool_grant", { p_user: userId, p_amount: amount, p_kind: kind, p_label: label.slice(0, 200), p_actor: actorId, p_ref: ref ?? null });
  if (error) {
    if (error.message.includes("POOL_INSUFFICIENT")) throw conflict("The token pool doesn't have enough tokens. Fund the pool first.", "POOL_INSUFFICIENT");
    throw new Error(`token_pool_grant failed: ${error.message}`);
  }
  return data as number;
}

/** Grants from the pool to one paid user, or the same amount to every paid user. */
export async function grantTokens(actorId: string, target: { user_id?: string; all_paid?: boolean }, amount: number, note: string, ip?: string) {
  let ids: string[];
  if (target.all_paid) {
    const { data } = await db.from("user_journey").select("user_id, profile:user_id(app_role, deleted_at)").in("status", [...PAID_STATUSES, "CERTIFIED"]);
    ids = ((data ?? []) as any[]).filter((r) => r.profile?.app_role === "user" && !r.profile?.deleted_at).map((r) => r.user_id);
    if (!ids.length) throw badRequest("No paid members to grant to yet.");
  } else if (target.user_id) {
    const j = await getJourney(target.user_id).catch(() => null);
    if (!j) throw notFound("User not found");
    if (!hasPaidAccess(j.status as JourneyStatus)) throw forbidden("Tokens can only go to members who have paid.", "NOT_PAID");
    ids = [target.user_id];
  } else {
    throw badRequest("Choose a member or 'all paid members'.");
  }
  const { data: pool } = await db.from("token_pool").select("balance").eq("id", 1).single();
  if (Number(pool?.balance ?? 0) < amount * ids.length) throw conflict(`That needs ${(amount * ids.length).toLocaleString()} tokens; the pool has ${Number(pool?.balance ?? 0).toLocaleString()}. Fund the pool first.`, "POOL_INSUFFICIENT");

  let granted = 0;
  for (const id of ids) {
    await grantOne(actorId, id, amount, "grant", note || "Tokens from the Huzzler team");
    await notify(id, "tokens.granted", "You received tokens", `The Huzzler team added ${amount.toLocaleString()} tokens to your wallet.`);
    granted++;
  }
  await audit(actorId, "tokens.granted", target.all_paid ? "token_pool" : "profile", target.user_id ?? "all_paid", { amount, recipients: granted, note }, ip);
  return { recipients: granted, total: amount * granted };
}

/** Opportunity stipend on accept: paid from the pool, partially if the pool is short. Never throws. */
export async function payStipend(userId: string, offerId: string, amount: number, company: string) {
  if (amount <= 0) return 0;
  try {
    const { data: pool } = await db.from("token_pool").select("balance").eq("id", 1).single();
    const give = Math.min(amount, Number(pool?.balance ?? 0));
    if (give <= 0) {
      logger.warn({ userId, offerId, amount }, "stipend skipped: token pool empty");
      return 0;
    }
    const { data: claimed } = await db.from("offers").update({ stipend_paid: true }).eq("id", offerId).eq("stipend_paid", false).select("id");
    if (!claimed?.length) return 0;
    await grantOne(null, userId, give, "stipend", `${company} · sprint token stipend`, offerId);
    return give;
  } catch (err) {
    logger.error({ err: String(err), userId, offerId }, "stipend failed");
    return 0;
  }
}

export async function updatePrice(actorId: string, action: string, cost: number, ip?: string) {
  const { data } = await db.from("token_prices").update({ cost }).eq("action", action).select("action, cost").maybeSingle();
  if (!data) throw notFound("Unknown tool");
  await audit(actorId, "tokens.price_changed", "token_price", action, { cost }, ip);
  return data;
}

export async function paidMembers(q: string) {
  const term = q.replace(/[%,()]/g, "").trim();
  let query = db.from("profiles").select("id, full_name, username, journey:user_journey(status), wallet:token_wallets(balance)").eq("app_role", "user").is("deleted_at", null).limit(20);
  if (term) query = query.or(`full_name.ilike.%${term}%,username.ilike.%${term}%`);
  const { data } = await query;
  return ((data ?? []) as any[])
    .map((p) => ({ id: p.id, full_name: p.full_name, username: p.username, status: (Array.isArray(p.journey) ? p.journey[0] : p.journey)?.status ?? null, balance: (Array.isArray(p.wallet) ? p.wallet[0] : p.wallet)?.balance ?? 0 }))
    .filter((p) => p.status && hasPaidAccess(p.status));
}
