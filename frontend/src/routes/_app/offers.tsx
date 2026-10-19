import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarDays, Clock, Info, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useRefreshMe } from "@/lib/journey";
import {
  Card,
  Countdown,
  EmptyState,
  ErrorNote,
  fmtDate,
  Notice,
  PageHeader,
  Pill,
  Spinner,
} from "@/components/app/ui";
import { hzConfirm } from "@/components/app/Dialogs";

export const Route = createFileRoute("/_app/offers")({
  head: () => ({ meta: [{ title: "Offers · Huzzler" }] }),
  component: Offers,
});

type Offer = {
  id: string;
  status: string;
  letter: string;
  expires_at: string;
  hours_per_week: number;
  archetype_id: string;
  persona: {
    name: string;
    logo_url: string | null;
    mission: string;
    product_brief: string;
    culture: string;
  };
  cohort: { start_date: string } | null;
};

const ARCH: Record<string, string> = {
  web3_fintech: "Web3 / Fintech",
  saas_mobile: "SaaS / Mobile",
  data_driven: "Data-Driven",
  infrastructure: "Infrastructure",
};

function Offers() {
  const qc = useQueryClient();
  const refresh = useRefreshMe();
  const { data, isLoading, error } = useQuery({
    queryKey: ["offers"],
    queryFn: () => api<Offer[]>("/offers"),
    refetchInterval: 20_000,
  });
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api(`/offers/${id}/respond`, { body: { accept } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers"] });
      refresh();
    },
  });
  const [openId, setOpenId] = useState<string | null>(null);
  if (isLoading) return <Spinner />;
  const offers = data ?? [];
  const pending = offers.filter((o) => o.status === "pending");
  const accepted = offers.find((o) => o.status === "accepted");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        chip="Offers"
        title="Your simulated internship offers"
        body="Each offer is from a fictional company tied to a real team that's forming. Accept one within 72 hours to be matched with your teammates."
      />
      <Notice>
        <span className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> These are simulated internships
          on Huzzler — the companies are fictional and these are not offers of employment. Your
          teammates are real people.
        </span>
      </Notice>
      <ErrorNote error={error ?? respond.error} />
      {accepted && (
        <Card className="ring-2 ring-[color:var(--brand-green)]/40">
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <Users className="h-5 w-5 text-primary" /> You accepted {accepted.persona.name}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            We're matching you with teammates for the cohort starting{" "}
            {fmtDate(accepted.cohort?.start_date)}. If a role stays empty for 72 hours, a clearly
            labelled Huzzler stand-in covers it so your team can start.
          </p>
        </Card>
      )}
      {!accepted && pending.length === 0 && (
        <EmptyState
          icon={Building2}
          title="No open offers right now"
          body="New offers are on the way. We'll notify you."
        />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map((o) => (
          <Card key={o.id} className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 font-display text-lg font-bold text-primary">
                {o.persona.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-lg font-bold">{o.persona.name}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Pill tone="primary">{ARCH[o.archetype_id]}</Pill>
                  <Pill>Simulated</Pill>
                </div>
              </div>
            </div>
            <p className="text-sm">{o.persona.mission}</p>
            <p className="text-sm text-muted-foreground">{o.persona.product_brief}</p>
            <div className="flex flex-wrap gap-4 text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> Starts {fmtDate(o.cohort?.start_date)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> ~{o.hours_per_week} h/week
              </span>
              <span className="flex items-center gap-1">
                Expires in <Countdown to={o.expires_at} />
              </span>
            </div>
            <button
              onClick={() => setOpenId(openId === o.id ? null : o.id)}
              className="self-start text-xs font-bold uppercase tracking-wider text-primary hover:underline"
            >
              {openId === o.id ? "Hide" : "Read"} offer letter
            </button>
            {openId === o.id && (
              <pre className="whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-4 font-sans text-sm leading-relaxed">
                {o.letter}
              </pre>
            )}
            <div className="mt-auto flex gap-2 pt-2">
              <button
                onClick={() => respond.mutate({ id: o.id, accept: true })}
                disabled={respond.isPending}
                className="btn-duo flex-1 !py-2.5"
              >
                Accept
              </button>
              <button
                onClick={async () => {
                  if (
                    await hzConfirm({
                      title: `Decline ${o.persona.name}?`,
                      body: "If you decline two offers, you'll be moved to the next cohort's offers.",
                      confirmLabel: "Decline offer",
                      cancelLabel: "Keep it",
                      danger: true,
                    })
                  )
                    respond.mutate({ id: o.id, accept: false });
                }}
                disabled={respond.isPending}
                className="btn-duo-outline !py-2.5"
              >
                Decline
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
