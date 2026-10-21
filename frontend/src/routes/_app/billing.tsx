import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Coins, CreditCard, Receipt, Sparkles } from "lucide-react";
import { api, naira } from "@/lib/api";
import { hasPaid, useMe } from "@/lib/journey";
import { buyTokens, fmtTokens, useWallet } from "@/lib/tokens";
import { ButtonSpinner } from "@/components/app/Loader";
import {
  Card,
  CardTitle,
  EmptyState,
  ErrorNote,
  fmtDate,
  Notice,
  PageHeader,
  Pill,
  Spinner,
} from "@/components/app/ui";
import { hzConfirm } from "@/components/app/Dialogs";
import { ListPageSkeleton } from "@/components/app/Skeleton";

export const Route = createFileRoute("/_app/billing")({
  head: () => ({ meta: [{ title: "Billing · Huzzler" }] }),
  component: Billing,
});

type Summary = {
  plan_id: string | null;
  status: string;
  access_expires_at: string | null;
  grace_until: string | null;
  subscription: {
    status: string;
    next_payment_date: string | null;
    cancelled_at: string | null;
  } | null;
  payments: Array<{
    reference: string;
    plan_id: string;
    amount_kobo: number;
    status: string;
    channel: string | null;
    paid_at: string | null;
    created_at: string;
  }>;
};

function Billing() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["billing"],
    queryFn: () => api<Summary>("/billing"),
  });
  const pay = useMutation({
    mutationFn: (plan: "one_time" | "monthly") =>
      api<{ authorization_url: string }>("/billing/initialize", { body: { plan } }),
    onSuccess: (r) => (window.location.href = r.authorization_url),
  });
  const cancel = useMutation({
    mutationFn: () => api("/billing/cancel", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }),
  });

  if (isLoading) return <ListPageSkeleton rows={4} label="Loading billing" />;
  if (error || !data) return <ErrorNote error={error} onRetry={() => refetch()} />;
  const lapsed = data.status === "LAPSED";
  const monthlyActive =
    data.plan_id === "monthly" &&
    data.subscription &&
    ["active", "attention"].includes(data.subscription.status);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader chip="Billing" title="Your plan and payments" />
      {lapsed && (
        <Notice tone="warn">
          Your plan has lapsed. Your work is saved — renew to continue from your next project.
        </Notice>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Plan
          </div>
          <div className="mt-2 font-display text-2xl font-bold">
            {data.plan_id === "one_time"
              ? "One-time"
              : data.plan_id === "monthly"
                ? "Monthly"
                : "None yet"}
          </div>
          {data.subscription && (
            <div className="mt-1">
              <Pill tone={data.subscription.status === "active" ? "green" : "gold"}>
                {data.subscription.status.replace("_", " ")}
              </Pill>
            </div>
          )}
        </Card>
        <Card>
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {data.plan_id === "monthly" ? "Renews" : "Access until"}
          </div>
          <div className="mt-2 font-display text-2xl font-bold">
            {fmtDate(data.subscription?.next_payment_date ?? data.access_expires_at)}
          </div>
          {data.grace_until && (
            <div className="mt-1 text-xs font-semibold text-[color:var(--fire)]">
              Grace period ends {fmtDate(data.grace_until)}
            </div>
          )}
        </Card>
        <Card>
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Actions
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {lapsed && (
              <>
                <button
                  onClick={() => pay.mutate("monthly")}
                  disabled={pay.isPending}
                  className="btn-duo !py-2 text-sm"
                >
                  Renew monthly ({naira(250000)})
                </button>
                <button
                  onClick={() => pay.mutate("one_time")}
                  disabled={pay.isPending}
                  className="btn-duo-outline !py-2 text-sm"
                >
                  Switch to one-time ({naira(500000)})
                </button>
              </>
            )}
            {monthlyActive && !lapsed && (
              <>
                <button
                  onClick={() => pay.mutate("one_time")}
                  disabled={pay.isPending}
                  className="btn-duo-outline !py-2 text-sm"
                >
                  Upgrade to one-time ({naira(500000)})
                </button>
                <button
                  onClick={async () => {
                    if (
                      await hzConfirm({
                        title: "Cancel your subscription?",
                        body: "You keep full access until the end of the period you've paid for. You can subscribe again any time.",
                        confirmLabel: "Cancel subscription",
                        cancelLabel: "Keep my plan",
                        danger: true,
                      })
                    )
                      cancel.mutate();
                  }}
                  disabled={cancel.isPending}
                  className="rounded-xl px-3 py-2 text-sm font-bold text-red-500 ring-1 ring-red-500/30 hover:bg-red-500/10"
                >
                  Cancel subscription
                </button>
              </>
            )}
            {!lapsed && !monthlyActive && (
              <span className="text-sm text-muted-foreground">
                {me?.journey.plan_id === "one_time"
                  ? "Nothing to do — you're paid up."
                  : "Choose a plan from Begin onboarding."}
              </span>
            )}
          </div>
          <ErrorNote error={pay.error ?? cancel.error} />
        </Card>
      </div>
      {monthlyActive && (
        <p className="text-xs text-muted-foreground">
          Upgrading charges the full one-time price; earlier monthly payments aren't credited.
        </p>
      )}

      <TokensSection paid={me ? hasPaid(me.journey.status) : false} />

      <Card>
        <CardTitle icon={Receipt}>Payment history</CardTitle>
        {data.payments.length === 0 ? (
          <EmptyState icon={CreditCard} title="No payments yet" />
        ) : (
          <div className="divide-y divide-border">
            {data.payments.map((p) => (
              <div
                key={p.reference}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-display font-bold">
                    {p.plan_id === "one_time" ? "One-time plan" : "Monthly plan"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {fmtDate(p.paid_at ?? p.created_at)} · {p.reference}
                    {p.channel ? ` · ${p.channel}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Pill
                    tone={
                      p.status === "success"
                        ? "green"
                        : p.status === "refunded"
                          ? "primary"
                          : p.status === "pending"
                            ? "gold"
                            : "red"
                    }
                  >
                    {p.status}
                  </Pill>
                  <span className="font-display font-bold">{naira(p.amount_kobo)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  purchase: "Top-up",
  grant: "From Huzzler",
  stipend: "Sprint stipend",
  spend: "Used",
  refund: "Refund",
};

/** Tokens: balance, buy packs (Paystack), what each AI action costs, and every movement. */
function TokensSection({ paid }: { paid: boolean }) {
  const { data, isLoading, error, refetch } = useWallet();
  const [buying, setBuying] = useState<string | null>(null);
  const buy = useMutation({
    mutationFn: (id: string) => {
      setBuying(id);
      return buyTokens(id);
    },
    onError: () => setBuying(null),
  });
  useEffect(() => {
    if (window.location.hash === "#tokens")
      document.getElementById("tokens")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isLoading]);

  if (isLoading) return <div id="tokens" className="skeleton h-64 rounded-2xl" />;
  if (error || !data) return <ErrorNote error={error} onRetry={() => refetch()} />;
  return (
    <section id="tokens" className="flex scroll-mt-24 flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary ring-2 ring-primary/25">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Token balance
              </div>
              <div className="font-display text-3xl font-bold text-primary">
                {fmtTokens(data.balance)}
              </div>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            {(
              [
                ["Bought", data.lifetime.purchased],
                ["Granted", data.lifetime.granted],
                ["Used", data.lifetime.spent],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/50 p-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-display font-bold">{fmtTokens(v)}</dd>
              </div>
            ))}
          </dl>
          <Link
            to="/workspace"
            search={{ tab: "workstation" }}
            className="btn-duo-outline mt-4 w-full !py-2 text-sm"
          >
            <Sparkles className="h-4 w-4" /> Open the Workstation
          </Link>
        </Card>
        <Card className="md:col-span-2">
          <CardTitle icon={CreditCard}>Buy tokens</CardTitle>
          {!paid ? (
            <p className="text-sm text-muted-foreground">
              Tokens are for members with an active plan. Choose a plan from Begin onboarding first.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {data.packs.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 rounded-xl border border-border p-4">
                  <div className="font-display text-lg font-bold">+{fmtTokens(p.tokens)}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.name}
                    {p.description ? ` · ${p.description}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {naira(Math.round(p.amount_kobo / (p.tokens / 100)))} per 100 tokens
                  </div>
                  <button
                    onClick={() => buy.mutate(p.id)}
                    disabled={buy.isPending}
                    className="btn-duo mt-auto !py-2 text-sm"
                  >
                    {buying === p.id && buy.isPending ? <ButtonSpinner /> : null} Pay{" "}
                    {naira(p.amount_kobo)}
                  </button>
                </div>
              ))}
            </div>
          )}
          <ErrorNote error={buy.error} />
          <p className="mt-3 text-xs text-muted-foreground">
            Paid securely with Paystack (card, bank transfer or USSD). Tokens land as soon as the
            payment is confirmed and never expire while your account is active.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle icon={Sparkles}>What AI tools cost</CardTitle>
          <div className="divide-y divide-border">
            {data.prices.map((p) => (
              <div key={p.action} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold">
                    {p.tool} · {p.label}
                  </div>
                  {p.description && (
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  )}
                </div>
                <Pill tone="primary">{p.cost} tokens</Pill>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Hints, mentor chat and the help bot stay free. If a run fails, its tokens are returned
            automatically.
          </p>
        </Card>
        <Card>
          <CardTitle icon={Receipt}>Token activity</CardTitle>
          {data.ledger.length === 0 ? (
            <EmptyState icon={Coins} title="No token activity yet" />
          ) : (
            <div className="max-h-[360px] divide-y divide-border overflow-y-auto">
              {data.ledger.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${l.delta > 0 ? "bg-[color:var(--brand-green)]/15 text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]" : "bg-muted text-muted-foreground"}`}
                    >
                      {l.delta > 0 ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{l.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {KIND_LABEL[l.kind] ?? l.kind} · {fmtDate(l.created_at)}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 font-display font-bold ${l.delta > 0 ? "text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]" : ""}`}
                  >
                    {l.delta > 0 ? "+" : ""}
                    {fmtTokens(l.delta)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
