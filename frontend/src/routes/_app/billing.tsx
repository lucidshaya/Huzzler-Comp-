import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Receipt } from "lucide-react";
import { api, naira } from "@/lib/api";
import { useMe } from "@/lib/journey";
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
  const { data, isLoading, error } = useQuery({
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

  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorNote error={error} />;
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
                  onClick={() => {
                    if (
                      confirm(
                        "Cancel your subscription? You keep access until the end of the paid period.",
                      )
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
