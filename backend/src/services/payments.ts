import crypto from "node:crypto";
import { db, must, ok } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { audit } from "../lib/audit.js";
import { notify, emailUser, emailLayout } from "../lib/notify.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { GRACE_DAYS, REFUND_WINDOW_HOURS } from "../domain/constants.js";
import { hasPaidAccess, PAID_STATUSES } from "../domain/journey.js";
import { paystack, PaystackError, type PaystackTransaction } from "./paystack.js";
import { HttpError } from "../lib/errors.js";
import { getJourney, transition } from "./journey.js";
import { getProfile } from "./profile.js";
import { applyTokenCharge, isTokenReference, verifyTokenPurchase } from "./tokens.js";

type PlanId = "one_time" | "monthly";
const DAY = 86_400_000;

async function getPlan(id: PlanId) {
  return must(await db.from("plans").select("*").eq("id", id).single(), "plan");
}

async function monthlyPlanCode(): Promise<string> {
  const plan = await getPlan("monthly");
  const code = plan.paystack_plan_code ?? env.PAYSTACK_MONTHLY_PLAN_CODE;
  if (!code) throw new Error("Monthly plan is not set up in Paystack. Run `npm run paystack:setup`.");
  return code;
}

/** The payer's email: from the signed-in session, else looked up. A failed lookup is a retry, not "no email". */
export async function payerEmail(userId: string, knownEmail?: string | null): Promise<string> {
  if (knownEmail) return knownEmail;
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) throw new HttpError(503, "We couldn't start checkout just now. Please try again.", "CHECKOUT_RETRY");
  if (!data.user?.email) throw badRequest("Your account needs an email address to pay.");
  return data.user.email;
}

/** Starts a Paystack checkout. Amounts always come from the plans table, never the client. */
export async function initializePayment(userId: string, planId: PlanId, knownEmail?: string | null) {
  const j = await getJourney(userId);
  const profile = await getProfile(userId);
  const upgrading = planId === "one_time" && j.plan_id === "monthly" && hasPaidAccess(j.status);
  if (j.status !== "PAYMENT_PENDING" && j.status !== "LAPSED" && !upgrading) {
    if (j.status === "GUARDIAN_PENDING") throw forbidden("A guardian needs to approve your account before payment.", "GUARDIAN_REQUIRED");
    throw conflict("Payment isn't due right now.", "NOT_PAYMENT_PENDING");
  }
  if (profile.is_minor) {
    const { data: g } = await db.from("guardian_consents").select("id").eq("user_id", userId).eq("status", "accepted").maybeSingle();
    if (!g) throw forbidden("A guardian needs to approve your account before payment.", "GUARDIAN_REQUIRED");
  }
  const email = await payerEmail(userId, knownEmail);

  const plan = await getPlan(planId);
  const reference = `hz_${planId === "monthly" ? "m" : "o"}_${crypto.randomBytes(9).toString("hex")}`;
  ok(await db.from("payments").insert({ user_id: userId, plan_id: planId, reference, amount_kobo: plan.amount_kobo, status: "pending" }), "payment insert");

  let init;
  try {
    init = await paystack.initialize({
      email,
      amount: plan.amount_kobo,
      reference,
      callback_url: `${env.APP_URL}/billing/callback`,
      metadata: { user_id: userId, plan_id: planId, upgrade: upgrading },
      ...(planId === "monthly" ? { plan: await monthlyPlanCode() } : {}),
    });
  } catch (err) {
    // Don't leave a dangling pending payment, and tell the user something they can act on.
    await db.from("payments").update({ status: "failed", raw: { init_error: String(err) } }).eq("reference", reference);
    logger.error({ err: String(err), reference }, "Paystack initialize failed");
    if (err instanceof PaystackError && err.status < 500) {
      const msg = /email/i.test(err.providerMessage)
        ? "Paystack couldn't accept the email on your account. Update your email in Settings or contact support."
        : `Paystack couldn't start the payment: ${err.providerMessage}`;
      throw new HttpError(400, msg, "PAYMENT_INIT_FAILED");
    }
    throw new HttpError(502, "We couldn't reach Paystack. Please try again in a moment.", "PAYMENT_PROVIDER_DOWN");
  }
  return { reference, authorization_url: init.authorization_url, access_code: init.access_code };
}

const metaOf = (t: PaystackTransaction): Record<string, any> => (typeof t.metadata === "string" ? safeJson(t.metadata) : (t.metadata ?? {})) as Record<string, any>;
const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};
const planCodeOf = (t: PaystackTransaction) => (typeof t.plan === "string" ? t.plan : t.plan?.plan_code) || t.plan_object?.plan_code || null;

/**
 * Applies a successful Paystack charge exactly once. Called from both the verify endpoint and the
 * charge.success webhook — whichever arrives first unlocks access; the other is a no-op.
 */
export async function applySuccessfulCharge(tx: PaystackTransaction, via: "verify" | "webhook") {
  // Token top-ups have their own table; without this they'd look like subscription renewals below.
  if (isTokenReference(tx.reference)) return applyTokenCharge(tx, via);
  if (tx.status !== "success") return { applied: false, reason: tx.status };

  let { data: payment } = await db.from("payments").select("*").eq("reference", tx.reference).maybeSingle();

  // Subscription renewals are charged by Paystack with references we didn't create.
  if (!payment) {
    const userId = await userForCustomer(tx.customer.customer_code, metaOf(tx).user_id);
    if (!userId) {
      logger.warn({ reference: tx.reference }, "charge.success for unknown customer");
      return { applied: false, reason: "unknown customer" };
    }
    const monthly = await getPlan("monthly");
    const ins = await db.from("payments").insert({ user_id: userId, plan_id: "monthly", reference: tx.reference, amount_kobo: monthly.amount_kobo, status: "pending" }).select().single();
    payment = ins.data ?? (await db.from("payments").select("*").eq("reference", tx.reference).single()).data;
  }
  if (!payment) return { applied: false, reason: "payment row missing" };

  const plan = await getPlan(payment.plan_id);
  if (tx.amount !== plan.amount_kobo || tx.currency !== "NGN") {
    await db.from("payments").update({ status: "failed", raw: tx as unknown as Record<string, unknown> }).eq("id", payment.id).neq("status", "success");
    logger.error({ reference: tx.reference, amount: tx.amount, expected: plan.amount_kobo }, "payment amount mismatch");
    await audit(null, "payment.amount_mismatch", "payment", payment.id, { amount: tx.amount, expected: plan.amount_kobo });
    return { applied: false, reason: "amount mismatch" };
  }

  // The conditional update is the idempotency guard.
  const { data: updated } = await db
    .from("payments")
    .update({ status: "success", paid_at: tx.paid_at ?? new Date().toISOString(), channel: tx.channel, paystack_transaction_id: tx.id, verified_via: via, raw: tx as unknown as Record<string, unknown> })
    .eq("id", payment.id)
    .neq("status", "success")
    .select("id");
  if (!updated?.length) return { applied: false, reason: "already applied" };

  const userId = payment.user_id as string;
  const j = await getJourney(userId);
  const now = Date.now();

  if (payment.plan_id === "monthly") {
    const code = planCodeOf(tx);
    const { data: sub } = await db.from("subscriptions").select("id").eq("user_id", userId).in("status", ["active", "attention", "non_renewing"]).maybeSingle();
    if (!sub) {
      await db.from("subscriptions").insert({ user_id: userId, plan_id: "monthly", paystack_customer_code: tx.customer.customer_code, status: "active", next_payment_date: new Date(now + 31 * DAY).toISOString() });
    } else {
      await db.from("subscriptions").update({ status: "active", paystack_customer_code: tx.customer.customer_code }).eq("id", sub.id);
    }
    if (code) logger.debug({ code }, "monthly plan charge");
  }

  const accessExpires =
    payment.plan_id === "one_time"
      ? new Date(now + (plan.access_days ?? 180) * DAY)
      : new Date(Math.max(now, j.access_expires_at ? new Date(j.access_expires_at).getTime() : now) + 31 * DAY);
  const extra = { plan_id: payment.plan_id, access_expires_at: accessExpires.toISOString(), grace_until: null };

  if (j.status === "PAYMENT_PENDING") {
    await transition(userId, "PAID", `payment ${tx.reference}`, { extra });
  } else if (j.status === "LAPSED" && j.resume_status) {
    await transition(userId, j.resume_status, `renewed ${tx.reference}`, { extra: { ...extra, lapsed_at: null } });
  } else {
    await db.from("user_journey").update(extra).eq("user_id", userId);
  }

  // Monthly -> one-time upgrade: stop the subscription once the one-time charge clears.
  if (payment.plan_id === "one_time") {
    const { data: subs } = await db.from("subscriptions").select("*").eq("user_id", userId).in("status", ["active", "attention", "non_renewing"]);
    for (const s of subs ?? []) await cancelSubscriptionRow(s).catch((err) => logger.error({ err }, "upgrade: subscription disable failed"));
  }

  await notify(userId, "payment.success", "Payment received", `Your ${plan.name} plan is active. You can start your onboarding tests now.`);
  void emailUser(userId, "Your Huzzler receipt", receiptHtml(plan.name, plan.amount_kobo, tx.reference, tx.paid_at));
  return { applied: true };
}

const receiptHtml = (planName: string, kobo: number, ref: string, paidAt: string | null) =>
  emailLayout(
    "Thanks for your payment",
    `<p>Plan: <b>${planName}</b><br/>Amount: <b>₦${(kobo / 100).toLocaleString("en-NG")}</b><br/>Reference: ${ref}<br/>Date: ${new Date(paidAt ?? Date.now()).toDateString()}</p><p>Your billing history is always on the Billing page.</p>`,
    { label: "Start your onboarding tests", url: `${env.APP_URL}/tests` },
  );

async function userForCustomer(customerCode: string, metaUserId?: string): Promise<string | null> {
  if (metaUserId) return metaUserId;
  const { data: sub } = await db.from("subscriptions").select("user_id").eq("paystack_customer_code", customerCode).limit(1).maybeSingle();
  if (sub) return sub.user_id;
  const { data: p } = await db.from("payments").select("user_id").eq("raw->customer->>customer_code", customerCode).limit(1).maybeSingle();
  return p?.user_id ?? null;
}

export async function verifyPayment(userId: string, reference: string) {
  if (isTokenReference(reference)) return verifyTokenPurchase(userId, reference);
  const { data: payment } = await db.from("payments").select("user_id, status").eq("reference", reference).maybeSingle();
  if (!payment || payment.user_id !== userId) throw notFound("Payment not found");
  if (payment.status === "success") return { status: "success" };
  const tx = await paystack.verify(reference);
  if (tx.status === "success") {
    await applySuccessfulCharge(tx, "verify");
    return { status: "success" };
  }
  if (tx.status === "failed" || tx.status === "abandoned") {
    await db.from("payments").update({ status: tx.status, raw: tx as unknown as Record<string, unknown> }).eq("reference", reference).eq("status", "pending");
  }
  return { status: tx.status };
}

// ---------------------------------------------------------------------------
// Webhooks: stored raw first, processed exactly once.
// ---------------------------------------------------------------------------
export async function recordWebhook(rawBody: Buffer, payload: { event: string; data: any }) {
  const hash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const { data, error } = await db
    .from("payment_events")
    .insert({ event_hash: hash, event_type: payload.event, reference: payload.data?.reference ?? null, payload })
    .select("id")
    .maybeSingle();
  if (error && error.code === "23505") return null; // duplicate delivery
  if (error) throw error;
  return data!.id as string;
}

export async function processWebhookEvent(eventId: string) {
  const { data: ev } = await db.from("payment_events").select("*").eq("id", eventId).single();
  if (!ev || ev.processed_at) return;
  const { event, data } = ev.payload as { event: string; data: any };
  try {
    switch (event) {
      case "charge.success": {
        // Re-verify with Paystack rather than trusting the webhook body's amount alone.
        const tx = await paystack.verify(data.reference);
        await applySuccessfulCharge(tx, "webhook");
        break;
      }
      case "subscription.create": {
        const userId = await userForCustomer(data.customer?.customer_code);
        if (!userId) throw new Error("subscription.create: unknown customer");
        const row = {
          user_id: userId, plan_id: "monthly", paystack_subscription_code: data.subscription_code, paystack_email_token: data.email_token,
          paystack_customer_code: data.customer?.customer_code, status: "active", next_payment_date: data.next_payment_date,
        };
        const { data: existing } = await db.from("subscriptions").select("id").eq("user_id", userId).in("status", ["active", "attention", "non_renewing"]).maybeSingle();
        if (existing) await db.from("subscriptions").update(row).eq("id", existing.id);
        else await db.from("subscriptions").insert(row);
        if (data.next_payment_date) await db.from("user_journey").update({ access_expires_at: data.next_payment_date }).eq("user_id", userId);
        break;
      }
      case "invoice.payment_failed": {
        const code = data.subscription?.subscription_code;
        const { data: sub } = await db.from("subscriptions").update({ status: "attention" }).eq("paystack_subscription_code", code).select("user_id").maybeSingle();
        if (sub) await startGrace(sub.user_id);
        break;
      }
      case "subscription.not_renew":
        await db.from("subscriptions").update({ status: "non_renewing" }).eq("paystack_subscription_code", data.subscription_code);
        break;
      case "subscription.disable":
        await db.from("subscriptions").update({ status: data.status === "complete" ? "completed" : "cancelled", cancelled_at: new Date().toISOString() }).eq("paystack_subscription_code", data.subscription_code);
        break;
      case "refund.processed":
      case "refund.failed":
        await db.from("refunds").update({ status: event === "refund.processed" ? "processed" : "failed" }).eq("paystack_refund_id", data.id ?? data.refund_id);
        break;
      default:
        break;
    }
    await db.from("payment_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", eventId);
  } catch (err) {
    await db.from("payment_events").update({ error: String(err).slice(0, 1000) }).eq("id", eventId);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Lapse / grace
// ---------------------------------------------------------------------------
async function startGrace(userId: string) {
  const j = await getJourney(userId);
  if (j.grace_until) return;
  const until = new Date(Date.now() + GRACE_DAYS * DAY).toISOString();
  await db.from("user_journey").update({ grace_until: until }).eq("user_id", userId);
  await notify(userId, "billing.grace", "Payment didn't go through", `Renew within ${GRACE_DAYS} days to keep your place on your team.`);
  await emailUser(
    userId,
    "Your Huzzler payment didn't go through",
    emailLayout("Your payment didn't go through", `<p>We couldn't renew your monthly plan. Renew within ${GRACE_DAYS} days to keep your place on your team. Your progress is saved either way.</p>`, { label: "Go to Billing", url: `${env.APP_URL}/billing` }),
  );
}

/** Daily: start grace for expired access, lapse users whose grace ran out. Returns lapsed user ids. */
export async function runLapseCheck(): Promise<string[]> {
  const nowIso = new Date().toISOString();
  const { data: expired } = await db.from("user_journey").select("user_id, grace_until, status").in("status", PAID_STATUSES).lt("access_expires_at", nowIso);
  const lapsed: string[] = [];
  for (const j of expired ?? []) {
    if (!j.grace_until) {
      await startGrace(j.user_id);
    } else if (new Date(j.grace_until) < new Date()) {
      await transition(j.user_id, "LAPSED", "grace period ended", { extra: { lapsed_at: nowIso } });
      await notify(j.user_id, "billing.lapsed", "Your access is paused", "Your plan has lapsed. Your work is saved and read-only; renew to pick up at your next project.");
      lapsed.push(j.user_id);
    }
  }
  return lapsed;
}

async function cancelSubscriptionRow(s: { id: string; paystack_subscription_code: string | null; paystack_email_token: string | null }) {
  if (s.paystack_subscription_code) {
    let token = s.paystack_email_token;
    if (!token) token = (await paystack.fetchSubscription(s.paystack_subscription_code)).email_token;
    await paystack.disableSubscription(s.paystack_subscription_code, token);
  }
  await db.from("subscriptions").update({ status: "non_renewing", cancelled_at: new Date().toISOString() }).eq("id", s.id);
}

export async function cancelSubscription(userId: string) {
  const { data: sub } = await db.from("subscriptions").select("*").eq("user_id", userId).in("status", ["active", "attention"]).maybeSingle();
  if (!sub) throw notFound("No active subscription");
  await cancelSubscriptionRow(sub);
  await audit(userId, "billing.cancel", "subscription", sub.id);
  return { cancelled: true };
}

export async function billingSummary(userId: string) {
  const j = await getJourney(userId);
  const [{ data: payments }, { data: sub }, plans] = await Promise.all([
    db.from("payments").select("reference, plan_id, amount_kobo, status, channel, paid_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
    db.from("subscriptions").select("status, next_payment_date, cancelled_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("plans").select("id, name, amount_kobo, interval, access_days"),
  ]);
  return { plan_id: j.plan_id, status: j.status, access_expires_at: j.access_expires_at, grace_until: j.grace_until, subscription: sub, payments: payments ?? [], plans: plans.data ?? [] };
}

// ---------------------------------------------------------------------------
// Refunds (admin)
// ---------------------------------------------------------------------------
export async function refundPayment(adminId: string, paymentId: string, reason: string, override: boolean) {
  const { data: p } = await db.from("payments").select("*").eq("id", paymentId).single();
  if (!p || p.status !== "success") throw badRequest("Only successful payments can be refunded.");
  const withinWindow = p.paid_at && Date.now() - new Date(p.paid_at).getTime() <= REFUND_WINDOW_HOURS * 3_600_000;
  const { count } = await db.from("test_submissions").select("id", { count: "exact", head: true }).eq("user_id", p.user_id).neq("status", "not_started");
  const eligible = withinWindow && (count ?? 0) === 0;
  if (!eligible && !override) throw forbidden(`Outside policy (full refund within ${REFUND_WINDOW_HOURS}h if no test started). Pass override with a reason to proceed.`, "REFUND_POLICY");

  const r = await paystack.refund(p.paystack_transaction_id);
  ok(await db.from("refunds").insert({ payment_id: p.id, amount_kobo: p.amount_kobo, status: "processing", paystack_refund_id: r.id, reason, admin_id: adminId }), "refund insert");
  await db.from("payments").update({ status: "refunded" }).eq("id", p.id);
  const j = await getJourney(p.user_id);
  if (j.status === "PAID") await transition(p.user_id, "PAYMENT_PENDING", "refunded", { actorId: adminId, extra: { plan_id: null, access_expires_at: null } });
  await audit(adminId, "payment.refund", "payment", p.id, { reason, override, eligible });
  return { ok: true };
}
