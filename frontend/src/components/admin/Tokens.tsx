/* eslint-disable @typescript-eslint/no-explicit-any -- admin API payloads are loosely shaped JSON */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Coins, Gift, PiggyBank, Search, Users } from "lucide-react";
import { api, naira } from "@/lib/api";
import { fmtTokens } from "@/lib/tokens";
import { STATUS_LABEL, type JourneyStatus } from "@/lib/journey";
import { Card, CardTitle, ErrorNote, fmtDateTime, inputCls, Pill } from "@/components/app/ui";
import { hzConfirm, hzPrompt } from "@/components/app/Dialogs";
import { hzToast } from "@/components/app/Toast";
import { TableSkeleton } from "@/components/app/Skeleton";
import { SmallBtn, Table, Td, useInvalidate } from "./Tabs";

type Summary = {
  pool: { balance: number; lifetime_funded: number; lifetime_granted: number };
  paid_users: number;
  revenue_kobo: number;
  tokens_sold: number;
  ledger: any[];
  wallets: any[];
  purchases: any[];
  prices: Array<{
    action: string;
    label: string;
    tool: string;
    cost: number;
    description: string | null;
  }>;
};

const KIND: Record<string, string> = {
  pool_fund: "Pool funded",
  pool_grant: "From pool",
  grant: "Granted",
  stipend: "Stipend",
  purchase: "Bought",
};

/** The token funding pool: admins top it up, then grant tokens to members who have paid. */
export function TokensTab() {
  const inv = useInvalidate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "tokens"],
    queryFn: () => api<Summary>("/admin/tokens"),
  });
  const [fund, setFund] = useState({ amount: "", note: "" });
  const [grant, setGrant] = useState({ amount: "", note: "", q: "" });
  const [who, setWho] = useState<{ id: string; full_name: string | null } | "all" | null>(null);
  const members = useQuery({
    queryKey: ["admin", "tokens", "members", grant.q],
    queryFn: () => api<any[]>(`/admin/tokens/members?q=${encodeURIComponent(grant.q)}`),
    enabled: grant.q.trim().length >= 2,
  });
  const fundM = useMutation({
    mutationFn: () =>
      api<{ balance: number }>("/admin/tokens/fund", {
        body: { amount: Number(fund.amount), note: fund.note },
      }),
    onSuccess: (r) => {
      inv();
      hzToast.success("Pool funded", `The pool now holds ${fmtTokens(r.balance)} tokens.`);
      setFund({ amount: "", note: "" });
    },
    onError: hzToast.fromError,
  });
  const grantM = useMutation({
    mutationFn: () =>
      api<{ recipients: number; total: number }>("/admin/tokens/grant", {
        body: {
          amount: Number(grant.amount),
          note: grant.note,
          ...(who === "all" ? { all_paid: true } : { user_id: (who as { id: string }).id }),
        },
      }),
    onSuccess: (r) => {
      inv();
      hzToast.success(
        "Tokens granted",
        `${fmtTokens(r.total)} tokens to ${r.recipients} member${r.recipients === 1 ? "" : "s"}.`,
      );
      setGrant({ amount: "", note: "", q: "" });
      setWho(null);
    },
    onError: hzToast.fromError,
  });
  const price = useMutation({
    mutationFn: ({ action, cost }: { action: string; cost: number }) =>
      api(`/admin/tokens/prices/${action}`, { method: "PUT", body: { cost } }),
    onSuccess: () => {
      inv();
      hzToast.success("Price updated", "Learners see the new cost straight away.");
    },
    onError: hzToast.fromError,
  });

  if (isLoading) return <TableSkeleton />;
  if (!data) return <ErrorNote error={error} />;
  const amount = Number(grant.amount) || 0;
  const needed = who === "all" ? amount * data.paid_users : amount;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={PiggyBank} label="Funding pool" value={fmtTokens(data.pool.balance)} />
        <Stat icon={Gift} label="Granted from pool" value={fmtTokens(data.pool.lifetime_granted)} />
        <Stat
          icon={Coins}
          label="Tokens sold"
          value={`${fmtTokens(data.tokens_sold)} · ${naira(data.revenue_kobo)}`}
        />
        <Stat icon={Users} label="Paid members" value={String(data.paid_users)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle icon={PiggyBank}>Fund the pool</CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            The pool pays opportunity stipends and the grants you make. Members can also buy their
            own tokens in Billing.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await hzConfirm({
                  title: `Add ${fmtTokens(Number(fund.amount))} tokens to the pool?`,
                  confirmLabel: "Fund pool",
                })
              )
                fundM.mutate();
            }}
            className="grid gap-2 sm:grid-cols-[140px_1fr_auto]"
          >
            <input
              type="number"
              min={1}
              max={10000000}
              required
              aria-label="Tokens to add"
              placeholder="Tokens"
              className={`${inputCls} !py-2 text-sm`}
              value={fund.amount}
              onChange={(e) => setFund({ ...fund, amount: e.target.value })}
            />
            <input
              required
              minLength={3}
              maxLength={200}
              aria-label="Note"
              placeholder="Note, e.g. October sprint budget"
              className={`${inputCls} !py-2 text-sm`}
              value={fund.note}
              onChange={(e) => setFund({ ...fund, note: e.target.value })}
            />
            <button disabled={fundM.isPending} className="btn-duo !py-2 !px-4 text-xs">
              Fund
            </button>
          </form>
        </Card>

        <Card>
          <CardTitle icon={Gift}>Grant tokens to members who've paid</CardTitle>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWho("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${who === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              All paid members ({data.paid_users})
            </button>
            {who && who !== "all" && <Pill tone="primary">{who.full_name ?? "Member"}</Pill>}
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Find a paid member"
              placeholder="Or find one member by name or username"
              className={`${inputCls} !py-2 pl-9 text-sm`}
              value={grant.q}
              onChange={(e) => setGrant({ ...grant, q: e.target.value })}
            />
            {grant.q.trim().length >= 2 && (members.data ?? []).length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg">
                {(members.data ?? []).map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setWho({ id: m.id, full_name: m.full_name });
                        setGrant({ ...grant, q: "" });
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>
                        {m.full_name ?? "—"}{" "}
                        <span className="text-xs text-muted-foreground">@{m.username}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {STATUS_LABEL[m.status as JourneyStatus]} · {fmtTokens(m.balance)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!who)
                return hzToast.info(
                  "Choose who gets the tokens",
                  "Pick all paid members or find one member.",
                );
              if (
                await hzConfirm({
                  title: `Grant ${fmtTokens(needed)} tokens from the pool?`,
                  body:
                    who === "all"
                      ? `${fmtTokens(amount)} each to ${data.paid_users} paid members.`
                      : `${fmtTokens(amount)} to ${who.full_name ?? "this member"}.`,
                  confirmLabel: "Grant tokens",
                })
              )
                grantM.mutate();
            }}
            className="grid gap-2 sm:grid-cols-[140px_1fr_auto]"
          >
            <input
              type="number"
              min={1}
              max={100000}
              required
              aria-label="Tokens each"
              placeholder="Tokens each"
              className={`${inputCls} !py-2 text-sm`}
              value={grant.amount}
              onChange={(e) => setGrant({ ...grant, amount: e.target.value })}
            />
            <input
              maxLength={200}
              aria-label="Message"
              placeholder="Message (optional)"
              className={`${inputCls} !py-2 text-sm`}
              value={grant.note}
              onChange={(e) => setGrant({ ...grant, note: e.target.value })}
            />
            <button
              disabled={grantM.isPending || !who}
              className="btn-duo !py-2 !px-4 text-xs disabled:opacity-50"
            >
              Grant
            </button>
          </form>
          {needed > data.pool.balance && (
            <p className="mt-2 text-xs font-semibold text-red-500">
              That's more than the pool holds ({fmtTokens(data.pool.balance)}). Fund the pool first.
            </p>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle icon={Coins}>What AI tools cost learners</CardTitle>
        <Table head={["Tool", "Action", "Cost", ""]}>
          {data.prices.map((p) => (
            <tr key={p.action}>
              <Td>{p.tool}</Td>
              <Td>
                <div className="font-semibold">{p.label}</div>
                <div className="text-xs text-muted-foreground">{p.description}</div>
              </Td>
              <Td>{p.cost} tokens</Td>
              <Td>
                <SmallBtn
                  onClick={async () => {
                    const v = await hzPrompt({
                      title: `Price for ${p.label}`,
                      label: "Tokens per run",
                      type: "number",
                      min: 0,
                      max: 10000,
                      defaultValue: String(p.cost),
                      confirmLabel: "Save price",
                    });
                    if (v !== null) price.mutate({ action: p.action, cost: Number(v) });
                  }}
                >
                  Change
                </SmallBtn>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Pool and grant history</CardTitle>
          <div className="max-h-[380px] divide-y divide-border overflow-y-auto">
            {data.ledger.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            )}
            {data.ledger.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <b>{KIND[l.kind] ?? l.kind}</b>{" "}
                  <span className="text-muted-foreground">{l.label}</span>
                  <div className="text-xs text-muted-foreground">
                    {l.user_id ? (l.profile?.full_name ?? "Member") : "Pool"}
                    {l.actor ? ` · by ${l.actor.username ?? l.actor.full_name}` : ""} ·{" "}
                    {fmtDateTime(l.created_at)}
                  </div>
                </span>
                <span
                  className={`shrink-0 font-display font-bold ${l.delta > 0 ? "text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]" : ""}`}
                >
                  {l.delta > 0 ? "+" : ""}
                  {fmtTokens(l.delta)}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle>Member balances</CardTitle>
          <div className="max-h-[380px] divide-y divide-border overflow-y-auto">
            {data.wallets.length === 0 && (
              <p className="text-sm text-muted-foreground">No wallets yet.</p>
            )}
            {data.wallets.map((w) => (
              <div key={w.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {w.profile?.full_name ?? "—"}{" "}
                  <span className="text-xs text-muted-foreground">@{w.profile?.username}</span>
                  <div className="text-xs text-muted-foreground">
                    bought {fmtTokens(w.lifetime_purchased)} · granted{" "}
                    {fmtTokens(w.lifetime_granted)} · used {fmtTokens(w.lifetime_spent)}
                  </div>
                </span>
                <span className="font-display font-bold text-primary">{fmtTokens(w.balance)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Coins; label: string; value: string }) {
  return (
    <div className="card-duo p-4">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary ring-2 ring-primary/25">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 font-display text-xl font-bold tracking-tight">{value}</div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
    </div>
  );
}
