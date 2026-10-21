import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  Coins,
  Info,
  ListChecks,
  MapPin,
  Terminal,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { roleName, useMe, useRefreshMe } from "@/lib/journey";
import { memberName, useTeam, useWorkspace } from "@/lib/team";
import { fmtTokens } from "@/lib/tokens";
import { Countdown, EmptyState, ErrorNote, fmtDate, Notice, Pill } from "@/components/app/ui";
import { hzConfirm } from "@/components/app/Dialogs";
import { hzToast } from "@/components/app/Toast";
import { CardsPageSkeleton } from "@/components/app/Skeleton";
import { HustlerPanel } from "@/components/app/Hustler";

export const Route = createFileRoute("/_app/opportunities")({
  validateSearch: z.object({
    tab: z.enum(["offers", "active", "completed", "rejected"]).optional(),
  }),
  head: () => ({ meta: [{ title: "Opportunities · Huzzler" }] }),
  component: Opportunities,
});

export type Opportunity = {
  id: string;
  status: "pending" | "accepted" | "declined" | "expired" | "superseded";
  stage: "offers" | "active" | "completed" | "rejected";
  letter: string;
  expires_at: string;
  created_at: string;
  hours_per_week: number;
  archetype_id: string;
  role_id: string;
  title: string | null;
  engagement_type: "internship" | "job";
  location: string | null;
  compensation: string | null;
  stipend_tokens: number;
  stipend_paid: boolean;
  duration_weeks: number | null;
  match_score: number | null;
  squad_name: string;
  can_restore: boolean;
  persona: {
    name: string;
    logo_text: string | null;
    mission: string;
    product_brief: string;
    culture: string;
  };
  cohort: { start_date: string } | null;
};

type Tab = "offers" | "active" | "completed" | "rejected";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "offers", label: "Offers" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "rejected", label: "Rejected" },
];

const logoOf = (o: Opportunity) =>
  (o.persona.logo_text || o.persona.name.slice(0, 1)).toUpperCase();
const titleOf = (o: Opportunity) => o.title ?? `${roleName(o.role_id)} Intern`;
const typeOf = (o: Opportunity) => (o.engagement_type === "job" ? "Job sprint" : "Internship");

function Opportunities() {
  const qc = useQueryClient();
  const refresh = useRefreshMe();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["offers"],
    queryFn: () => api<Opportunity[]>("/offers"),
    refetchInterval: 30_000,
  });
  const all = data ?? [];
  const by = (k: Tab) => all.filter((o) => o.stage === k);
  const [tab, setTab] = useState<Tab | null>(search.tab ?? null);
  const current: Tab =
    tab ?? (by("offers").length ? "offers" : by("active").length ? "active" : "offers");
  const [openId, setOpenId] = useState<string | null>(null);

  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api<{ accepted: boolean; placed?: boolean; stipend_tokens?: number }>(
        `/offers/${id}/respond`,
        {
          body: { accept },
        },
      ),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["offers"] });
      void qc.invalidateQueries({ queryKey: ["team"] });
      void qc.invalidateQueries({ queryKey: ["workspace"] });
      void qc.invalidateQueries({ queryKey: ["wallet"] });
      refresh();
      if (r.accepted) {
        hzToast.success(
          r.placed ? "Welcome to your squad" : "Offer accepted",
          [
            r.placed
              ? "Taking you to your team workspace."
              : "We're placing you with teammates now.",
            r.stipend_tokens ? `+${fmtTokens(r.stipend_tokens)} sprint tokens added.` : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
        navigate({ to: "/workspace" });
      } else {
        hzToast.info("Offer declined", "It's in Rejected; you can restore it while it's open.");
      }
    },
    onError: hzToast.fromError,
  });
  const restore = useMutation({
    mutationFn: (id: string) => api(`/offers/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["offers"] });
      setTab("offers");
      hzToast.success("Offer restored", "It's back in Offers.");
    },
    onError: hzToast.fromError,
  });

  if (isLoading) return <CardsPageSkeleton cards={3} label="Loading opportunities" />;
  const opened = openId ? all.find((o) => o.id === openId) : null;
  if (opened) return <EngagementDetail o={opened} onBack={() => setOpenId(null)} />;

  const accept = async (o: Opportunity) => {
    if (
      await hzConfirm({
        title: "Accept this opportunity?",
        body: `You'll join ${o.squad_name}${o.stipend_tokens ? ` and receive +${fmtTokens(o.stipend_tokens)} sprint tokens` : ""}. Your other offers close.`,
        confirmLabel: "Yes, accept",
      })
    )
      respond.mutate({ id: o.id, accept: true });
  };
  const decline = async (o: Opportunity) => {
    if (
      await hzConfirm({
        title: `Decline ${o.persona.name}?`,
        body: "It moves to Rejected; you can restore it while it's still open. After two declines you're moved to the next cohort's offers.",
        confirmLabel: "Yes, decline",
        cancelLabel: "Keep it",
        danger: true,
      })
    )
      respond.mutate({ id: o.id, accept: false });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="chip w-fit">Opportunities</span>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Where offers turn into shipped work.
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Review live offers, manage your active internship, and track your completed roles.
        </p>
      </header>
      <Notice>
        <span className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> These are simulated internships
          on Huzzler: the companies are fictional and these aren't offers of employment. Your
          teammates are real people.
        </span>
      </Notice>
      <ErrorNote error={error} onRetry={() => refetch()} />

      <div
        className="flex w-fit flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-muted/50 p-1.5"
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={current === t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-display text-sm font-bold tracking-tight transition-colors ${current === t.key ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${current === t.key ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
            >
              {by(t.key).length}
            </span>
          </button>
        ))}
      </div>

      {current === "offers" &&
        (by("offers").length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No open offers right now"
            body={
              by("active").length
                ? "You've accepted an opportunity. Open it from Active."
                : "Pass your onboarding tests to get offers. New ones arrive automatically."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {by("offers").map((o) => (
              <OfferCard
                key={o.id}
                o={o}
                busy={respond.isPending}
                onAccept={() => accept(o)}
                onDecline={() => decline(o)}
              />
            ))}
          </div>
        ))}
      {(current === "active" || current === "completed") && (
        <EngagementList
          list={by(current)}
          onOpen={setOpenId}
          empty={
            current === "active"
              ? "No active engagements yet. Accept an offer to join a squad."
              : "Your completed work will show here."
          }
        />
      )}
      {current === "rejected" &&
        (by("rejected").length === 0 ? (
          <EmptyState icon={XCircle} title="No declined offers" />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {by("rejected").map((o) => (
              <div key={o.id} className="card-duo flex flex-col gap-4 p-6 opacity-80">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Logo o={o} muted />
                    <div>
                      <div className="font-display text-base font-bold">{titleOf(o)}</div>
                      <div className="text-xs text-muted-foreground">{o.persona.name}</div>
                    </div>
                  </div>
                  <Pill>
                    {o.status === "superseded"
                      ? "Closed"
                      : o.status === "expired"
                        ? "Expired"
                        : "Declined"}
                  </Pill>
                </div>
                <p className="text-xs text-muted-foreground">{o.persona.product_brief}</p>
                {o.can_restore && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => restore.mutate(o.id)}
                      disabled={restore.isPending}
                      className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
                    >
                      Restore to Offers
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

function Logo({ o, muted, size = "md" }: { o: Opportunity; muted?: boolean; size?: "md" | "lg" }) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-xl font-display font-bold ${size === "lg" ? "h-14 w-14 rounded-2xl text-xl" : "h-12 w-12 text-lg"} ${muted ? "bg-muted text-muted-foreground ring-1 ring-border" : "bg-primary/10 text-primary ring-2 ring-primary/20"}`}
    >
      {logoOf(o)}
    </div>
  );
}

function OfferCard({
  o,
  busy,
  onAccept,
  onDecline,
}: {
  o: Opportunity;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [letter, setLetter] = useState(false);
  return (
    <div className="card-duo flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Logo o={o} />
          <div className="min-w-0">
            <div className="font-display text-base font-bold">{titleOf(o)}</div>
            <div className="truncate text-xs text-muted-foreground">
              {o.persona.name} · {typeOf(o)}
            </div>
          </div>
        </div>
        {o.match_score != null && (
          <div className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            {o.match_score}% match
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{o.persona.product_brief}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        {o.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {o.location}
          </span>
        )}
        {o.compensation && (
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> {o.compensation}
          </span>
        )}
        {o.duration_weeks && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {o.duration_weeks}-week sprint
          </span>
        )}
        {o.stipend_tokens > 0 && (
          <span className="inline-flex items-center gap-1 font-bold text-primary">
            <Coins className="h-3.5 w-3.5" /> +{fmtTokens(o.stipend_tokens)} tokens
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Starts {fmtDate(o.cohort?.start_date)} · ~{o.hours_per_week} h/week
        </span>
        <span>
          Expires in <Countdown to={o.expires_at} />
        </span>
      </div>
      <button
        onClick={() => setLetter((v) => !v)}
        className="self-start text-xs font-bold uppercase tracking-wider text-primary hover:underline"
      >
        {letter ? "Hide" : "Read"} offer letter
      </button>
      {letter && (
        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-4 font-sans text-sm leading-relaxed">
          {o.letter}
        </pre>
      )}
      <div className="mt-auto flex gap-2 pt-2">
        <button onClick={onAccept} disabled={busy} className="btn-duo flex-1 !py-2 !px-4 text-sm">
          Accept
        </button>
        <button onClick={onDecline} disabled={busy} className="btn-duo-outline !py-2 !px-4 text-sm">
          Decline
        </button>
      </div>
    </div>
  );
}

function EngagementList({
  list,
  onOpen,
  empty,
}: {
  list: Opportunity[];
  onOpen: (id: string) => void;
  empty: string;
}) {
  const ws = useWorkspace(list.some((o) => o.stage === "active"));
  if (list.length === 0) return <EmptyState icon={Briefcase} title={empty} />;
  const tasks = ws.data?.tasks ?? [];
  const done = tasks.filter((t) => t.status === "done").length;
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {list.map((o) => (
        <button
          key={o.id}
          onClick={() => onOpen(o.id)}
          className="card-duo group flex flex-col gap-4 p-6 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Logo o={o} />
              <div>
                <div className="font-display text-base font-bold">{titleOf(o)}</div>
                <div className="text-xs text-muted-foreground">{o.persona.name}</div>
              </div>
            </div>
            <Pill tone={o.stage === "active" ? "primary" : "green"}>{o.stage}</Pill>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" /> {typeOf(o)}
            </span>
            {o.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {o.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {o.squad_name}
            </span>
          </div>
          <div className="mt-auto flex items-center justify-between pt-2 text-xs">
            <span className="text-muted-foreground">
              {o.stage === "active" && tasks.length
                ? `${done} of ${tasks.length} squad tasks done`
                : `Accepted ${fmtDate(o.created_at)}`}
            </span>
            <span className="font-bold text-primary">
              Open details <ArrowRight className="inline h-3.5 w-3.5" />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

/** One accepted opportunity: your tasks, your squad, your deliverables (live workspace data). */
function EngagementDetail({ o, onBack }: { o: Opportunity; onBack: () => void }) {
  const team = useTeam();
  const ws = useWorkspace();
  const meId = useMe().data?.user.id;
  const myTasks = (ws.data?.tasks ?? []).filter((t) => t.assignee_id && t.assignee_id === meId);
  const tone = (s: string) =>
    s === "done" ? "green" : s === "review" ? "gold" : s === "blocked" ? "red" : "muted";
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <button
        onClick={onBack}
        className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Opportunities
      </button>
      <div className="card-duo p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Logo o={o} size="lg" />
            <div>
              <div className="font-display text-xl font-bold tracking-tight md:text-2xl">
                {titleOf(o)}
              </div>
              <div className="text-sm text-muted-foreground">{o.persona.name}</div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" /> {typeOf(o)}
                </span>
                {o.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {o.location}
                  </span>
                )}
                {o.duration_weeks && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {o.duration_weeks}-week sprint
                  </span>
                )}
              </div>
            </div>
          </div>
          {o.stage === "active" && (
            <div className="flex flex-wrap gap-2">
              <Link
                to="/workspace"
                search={{ tab: "workstation" }}
                className="btn-duo-outline !py-2.5 !px-4 text-sm"
              >
                <Terminal className="h-4 w-4" /> Workstation
              </Link>
              <Link
                to="/workspace"
                search={{ tab: "squad" }}
                className="btn-duo !py-2.5 !px-4 text-sm"
              >
                <Users className="h-4 w-4" /> Open squad
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <div className="card-duo p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-base font-bold">
                <ListChecks className="h-4 w-4 text-primary" /> Assigned tasks
              </div>
              <span className="text-xs font-bold text-primary">
                {myTasks.filter((t) => t.status === "done").length}/{myTasks.length} done
              </span>
            </div>
            {ws.isLoading ? (
              <div className="skeleton h-24 rounded-xl" />
            ) : myTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {o.stage === "active"
                  ? "Your tasks appear here as soon as your squad's project starts."
                  : "This engagement is complete."}
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {myTasks.map((t) => (
                  <Link
                    key={t.id}
                    to="/workspace/task/$taskId"
                    params={{ taskId: t.id }}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-all ${t.status === "done" ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30 hover:border-primary/40"}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <CheckCircle2
                        className={`h-5 w-5 shrink-0 ${t.status === "done" ? "text-primary" : "text-muted-foreground/40"}`}
                      />
                      <div className="min-w-0">
                        <div
                          className={`truncate font-display text-sm font-bold ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}
                        >
                          {t.title}
                        </div>
                        <div className="text-xs text-muted-foreground">Due {fmtDate(t.due_at)}</div>
                      </div>
                    </div>
                    <Pill tone={tone(t.status)}>{t.status.replace("_", " ")}</Pill>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card-duo p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-display text-base font-bold">
                <Users className="h-4 w-4 text-primary" /> Squad members
              </div>
              <Link
                to="/workspace"
                search={{ tab: "squad" }}
                className="text-xs font-bold text-primary hover:underline"
              >
                View tree →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(team.data?.members ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3.5"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-xs font-bold text-primary">
                    {memberName(m)
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-xs font-bold">
                      {memberName(m)}
                      {m.user_id && m.user_id === meId ? " (You)" : ""}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {roleName(m.role_id)}
                    </div>
                  </div>
                </div>
              ))}
              {!team.data?.members.length && (
                <p className="text-sm text-muted-foreground">Your squad is forming.</p>
              )}
            </div>
          </div>

          {o.stage === "active" && myTasks.length > 0 && (
            <div className="card-duo p-6">
              <div className="mb-4 flex items-center gap-2 font-display text-base font-bold">
                <Upload className="h-4 w-4 text-primary" /> Deliverables
              </div>
              <div className="divide-y divide-border">
                {myTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-display text-sm font-bold">{t.title}</div>
                      <div className="text-xs text-muted-foreground">Due {fmtDate(t.due_at)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={tone(t.status)}>
                        {t.status === "review"
                          ? "Submitted"
                          : t.status === "done"
                            ? "Approved"
                            : "In progress"}
                      </Pill>
                      {!["review", "done"].includes(t.status) && (
                        <Link
                          to="/workspace/task/$taskId"
                          params={{ taskId: t.id }}
                          className="btn-duo !py-1.5 !px-3 text-xs"
                        >
                          Submit
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <HustlerPanel tasks={myTasks} />
      </div>
    </div>
  );
}
