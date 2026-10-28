/* eslint-disable @typescript-eslint/no-explicit-any -- AI PM API payloads are loosely shaped JSON */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileBarChart2,
  Layers,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Shuffle,
  Users,
  Wand2,
} from "lucide-react";
import { api } from "@/lib/api";
import { roleName } from "@/lib/journey";
import {
  Card,
  EmptyState,
  ErrorNote,
  fmtDate,
  fmtDateTime,
  inputCls,
  Pill,
  Progress,
} from "@/components/app/ui";
import { CardSkeleton } from "@/components/app/Skeleton";
import { HzSelect } from "@/components/app/HzSelect";
import { hzConfirm } from "@/components/app/Dialogs";
import { hzToast } from "@/components/app/Toast";
import { AgentMark } from "@/components/app/AgentMark";

export type AipmTab = "briefs" | "talent" | "board" | "grading" | "tests" | "ai" | "reports";

const useArchetypes = () =>
  useQuery({
    queryKey: ["catalogue"],
    queryFn: () =>
      api<{ archetypes: Array<{ id: string; name: string }> }>("/catalogue", { auth: false }),
    staleTime: 3_600_000,
    select: (d) => d.archetypes ?? [],
  });

const useRefresh = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["aipm"] });
};

const LEVELS = [
  { value: "1", label: "Level 1 · Warm-up", hint: "One small feature, about a week" },
  { value: "2", label: "Level 2 · Cross-role feature", hint: "Every role hands off to the next" },
  { value: "3", label: "Level 3 · Rescue", hint: "Stabilise and document existing work" },
  { value: "4", label: "Level 4 · Launch a slice", hint: "Build, release, monitor, measure" },
  { value: "5", label: "Level 5 · Capstone", hint: "Discovery to demo day" },
];

function ViewHeader({
  chip,
  title,
  body,
  actions,
}: {
  chip: string;
  title: string;
  body: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <span className="chip w-fit">{chip}</span>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        <p className="max-w-xl text-sm text-muted-foreground">{body}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

// ============================================================================
// 1. BRIEFS & WORK BREAKDOWN
// ============================================================================

export function BriefsView({ onNext }: { onNext: () => void }) {
  const refresh = useRefresh();
  const archetypes = useArchetypes();
  const briefs = useQuery({
    queryKey: ["aipm", "briefs"],
    queryFn: () => api<any[]>("/aipm/briefs"),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [f, setF] = useState({
    company: "",
    title: "",
    scope: "",
    timeline_weeks: "4",
    archetype_id: "",
    level: "2",
  });

  const create = useMutation({
    mutationFn: () =>
      api<any>("/aipm/briefs", {
        body: {
          ...f,
          timeline_weeks: Number(f.timeline_weeks),
          level: Number(f.level),
          archetype_id: f.archetype_id || archetypes.data?.[0]?.id,
        },
      }),
    onSuccess: (b) => {
      refresh();
      setSelected(b.id);
      hzToast.success(
        "Work breakdown ready",
        `${b.template?.role_tasks?.length ?? 0} tasks planned for ${b.company}. It's waiting for content review.`,
      );
    },
    onError: hzToast.fromError,
  });

  const list = briefs.data ?? [];
  const active = list.find((b) => b.id === selected) ?? list[0];

  return (
    <div className="flex flex-col gap-8">
      <ViewHeader
        chip="Briefs & WBS"
        title="Turn partner briefs into sprint plans."
        body="Paste a partner's requirements to generate milestones, tasks for every role, hints and a timeline. Plans land as drafts in the Content bank for review before any squad gets them."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          className="card-duo flex flex-col gap-4 p-6 lg:col-span-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="flex items-center gap-3">
            <AgentMark size={40} animated={create.isPending} />
            <div>
              <div className="font-display text-base font-bold">New project brief</div>
              <div className="text-xs text-muted-foreground">
                The AI PM plans it; a content reviewer approves it.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Company</span>
              <input
                required
                minLength={2}
                maxLength={120}
                value={f.company}
                onChange={(e) => setF({ ...f, company: e.target.value })}
                placeholder="e.g. Zowa Pay"
                className={`${inputCls} !py-2 text-sm`}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Duration (weeks)</span>
              <input
                type="number"
                required
                min={1}
                max={16}
                value={f.timeline_weeks}
                onChange={(e) => setF({ ...f, timeline_weeks: e.target.value })}
                className={`${inputCls} !py-2 text-sm`}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Company type</span>
              <HzSelect
                label="Company type"
                value={f.archetype_id || archetypes.data?.[0]?.id || ""}
                onChange={(v) => setF({ ...f, archetype_id: v })}
                options={(archetypes.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
                placeholder="Loading…"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Project level</span>
              <HzSelect
                label="Project level"
                value={f.level}
                onChange={(v) => setF({ ...f, level: v })}
                options={LEVELS}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Project title</span>
            <input
              required
              minLength={3}
              maxLength={160}
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              placeholder="e.g. Mobile checkout with USSD fallback"
              className={`${inputCls} !py-2 text-sm`}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Scope & goals</span>
            <textarea
              required
              minLength={20}
              maxLength={6000}
              rows={5}
              value={f.scope}
              onChange={(e) => setF({ ...f, scope: e.target.value })}
              placeholder="What should the squad build, for whom, and how will the partner judge success?"
              className={`${inputCls} text-sm leading-relaxed`}
            />
          </label>
          <ErrorNote error={create.error} />
          <button
            type="submit"
            disabled={create.isPending}
            className="btn-duo !py-2.5 !px-5 text-sm"
          >
            {create.isPending ? (
              <>
                <Wand2 className="h-4 w-4 animate-pulse" /> Planning the sprint…
              </>
            ) : (
              <>
                <Layers className="h-4 w-4" /> Generate sprint plan
              </>
            )}
          </button>
        </form>

        <div className="card-duo flex flex-col gap-5 p-6 lg:col-span-7">
          {briefs.isLoading ? (
            <CardSkeleton />
          ) : !active ? (
            <EmptyState
              icon={Layers}
              title="No briefs yet"
              body="Generate your first sprint plan from a partner brief. It appears here with its milestones and role tasks."
            />
          ) : (
            <WbsPanel brief={active} onNext={onNext} />
          )}
        </div>
      </div>

      {list.length > 1 && (
        <Card>
          <div className="mb-3 font-display text-base font-bold">Earlier briefs</div>
          <div className="divide-y divide-border">
            {list.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelected(b.id)}
                className={`flex w-full flex-wrap items-center justify-between gap-2 py-3 text-left text-sm transition-colors hover:text-primary ${active?.id === b.id ? "text-primary" : ""}`}
              >
                <span className="min-w-0">
                  <span className="font-display font-bold">{b.company}</span>{" "}
                  <span className="text-muted-foreground">· {b.title}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TemplateStatus status={b.template?.status} /> {fmtDate(b.created_at)}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function TemplateStatus({ status }: { status?: string }) {
  if (status === "approved") return <Pill tone="green">approved</Pill>;
  if (status === "retired") return <Pill>retired</Pill>;
  return <Pill tone="gold">awaiting review</Pill>;
}

function WbsPanel({ brief, onNext }: { brief: any; onNext: () => void }) {
  const t = brief.template ?? {};
  const tasks: any[] = t.role_tasks ?? [];
  const milestones: any[] = t.milestones ?? [];
  const roles = [...new Set(tasks.map((x) => x.role_id))];
  const hours = tasks.reduce((s, x) => s + (Number(x.estimate_hours) || 0), 0);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-primary">
            Work Breakdown Structure · {brief.company}
          </div>
          <h2 className="mt-1 font-display text-lg font-bold">{t.title ?? brief.title}</h2>
          <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{t.brief}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
            {brief.timeline_weeks} weeks
          </span>
          <TemplateStatus status={t.status} />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <b className="text-foreground">{tasks.length}</b> tasks
        </span>
        {hours > 0 && (
          <span>
            <b className="text-foreground">{hours}</b> estimated hours
          </span>
        )}
        <span>
          Level <b className="text-foreground">{brief.level}</b> v{t.version}
        </span>
        <span>
          {brief.generated_by === "ai"
            ? "Planned by Claude"
            : "Planned from the Huzzler task library"}
        </span>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold text-muted-foreground">Required roles</div>
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => (
            <span
              key={r}
              className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary"
            >
              {roleName(r)}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {milestones.map((m) => {
          const mt = tasks.filter((x) => x.milestone_key === m.key);
          return (
            <div key={m.key}>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5 text-primary" /> {m.title} · day{" "}
                {m.day_offset}
              </div>
              <div className="divide-y divide-border rounded-xl border border-border">
                {mt.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-muted-foreground">
                    No tasks in this milestone.
                  </div>
                ) : (
                  mt.map((x) => (
                    <div
                      key={x.key}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {roleName(x.role_id)}
                          </span>
                          <span className="font-display text-sm font-bold">{x.title}</span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {x.description}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {x.estimate_hours ? `${x.estimate_hours}h` : ""}
                        {x.depends_on?.length ? ` · needs ${x.depends_on.length}` : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          {t.status === "approved"
            ? `Live: new level ${brief.level} squads in this company type get this project.`
            : "A content reviewer approves it in Admin → Content bank → Projects."}
        </p>
        <button type="button" onClick={onNext} className="btn-duo-outline !py-2 !px-4 text-xs">
          Draft a squad →
        </button>
      </div>
    </>
  );
}

// ============================================================================
// 2. TALENT POOL & SQUADS
// ============================================================================

export function TalentView({ onNext }: { onNext: () => void }) {
  const refresh = useRefresh();
  const archetypes = useArchetypes();
  const { data, isLoading, error } = useQuery({
    queryKey: ["aipm", "talent"],
    queryFn: () => api<any>("/aipm/talent"),
  });
  const candidates: any[] = data?.candidates ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const x of candidates) c[x.archetype_id] = (c[x.archetype_id] ?? 0) + 1;
    return c;
  }, [candidates]);
  const busiest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const [archetype, setArchetype] = useState("");
  const current = archetype || busiest || archetypes.data?.[0]?.id || "";
  const [picked, setPicked] = useState<string[]>([]);
  const shown = candidates.filter((c) => c.archetype_id === current);
  const chosen = shown.filter((c) => picked.includes(c.user_id));
  const tpl = data?.squad_templates?.[current] as
    { required: Record<string, number>; optional: string[] } | undefined;
  const archName = (id: string) => archetypes.data?.find((a) => a.id === id)?.name ?? id;

  const seats = useMemo(() => {
    if (!tpl) return [];
    return Object.entries(tpl.required).map(([role, n]) => {
      const have = chosen.filter((c) => c.role_id === role).length;
      return { role, need: n, have };
    });
  }, [tpl, chosen]);
  const standins = seats.reduce((s, x) => s + Math.max(0, x.need - x.have), 0);
  const tooBig = chosen.length + standins > (data?.max_team_size ?? 7);

  const draft = useMutation({
    mutationFn: () =>
      api<any>("/aipm/squads", { body: { archetype_id: current, user_ids: picked } }),
    onSuccess: (r) => {
      refresh();
      setPicked([]);
      hzToast.success(
        `${r.name} formed`,
        `${r.members} builder${r.members === 1 ? "" : "s"}${r.standins ? ` and ${r.standins} stand-in${r.standins === 1 ? "" : "s"}` : ""}. Project 1 has started.`,
      );
      onNext();
    },
    onError: hzToast.fromError,
  });
  const auto = useMutation({
    mutationFn: () => api<{ formed: number }>("/aipm/matching/run", { method: "POST" }),
    onSuccess: (r) => {
      refresh();
      if (r.formed)
        hzToast.success(
          `Formed ${r.formed} squad${r.formed === 1 ? "" : "s"}`,
          "Matching grouped people by role, skill level, time zone and hours.",
        );
      else
        hzToast.info(
          "No new squads yet",
          "Not enough compatible people are waiting. Draft one by hand to use stand-ins.",
        );
    },
    onError: hzToast.fromError,
  });

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="flex flex-col gap-8">
      <ViewHeader
        chip="Talent & Squads"
        title="Verified talent pool."
        body="Everyone here passed onboarding and accepted an offer. Pick builders from one company type to form a squad; empty required seats get a Huzzler stand-in until a real person joins."
        actions={
          <>
            <button
              type="button"
              onClick={() => auto.mutate()}
              disabled={auto.isPending}
              className="btn-duo-outline !py-2 !px-4 text-xs"
            >
              <Shuffle className="h-3.5 w-3.5" />{" "}
              {auto.isPending ? "Matching…" : "Run auto-matching"}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (
                  standins &&
                  !(await hzConfirm({
                    title: `Start with ${standins} stand-in${standins === 1 ? "" : "s"}?`,
                    body: "Stand-ins complete their tasks with pre-written work so the squad isn't blocked, and are replaced as soon as a real person matches.",
                    confirmLabel: "Form squad",
                  }))
                )
                  return;
                draft.mutate();
              }}
              disabled={!chosen.length || tooBig || draft.isPending}
              className="btn-duo !py-2 !px-4 text-xs disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />{" "}
              {draft.isPending ? "Forming…" : `Draft squad (${chosen.length})`}
            </button>
          </>
        }
      />
      <ErrorNote error={error} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <div className="mb-3 font-display text-base font-bold">Squad plan</div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Company type</span>
            <HzSelect
              label="Company type"
              value={current}
              onChange={(v) => {
                setArchetype(v);
                setPicked([]);
              }}
              options={(archetypes.data ?? []).map((a) => ({
                value: a.id,
                label: a.name,
                hint: `${counts[a.id] ?? 0} waiting`,
              }))}
            />
          </label>
          <div className="mt-4 flex flex-col gap-2">
            {seats.map((s) => (
              <div
                key={s.role}
                className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs"
              >
                <span className="font-semibold">{roleName(s.role)}</span>
                <span
                  className={
                    s.have >= s.need
                      ? "font-bold text-primary"
                      : "font-bold text-[color:var(--gold)]"
                  }
                >
                  {Math.min(s.have, s.need)}/{s.need}
                  {s.have < s.need ? " · stand-in" : " ✓"}
                </span>
              </div>
            ))}
            {tpl?.optional?.length ? (
              <p className="text-[11px] text-muted-foreground">
                Optional seats: {tpl.optional.map(roleName).join(", ")}.
              </p>
            ) : null}
            {tooBig && (
              <p className="text-xs font-semibold text-red-500">
                That's more than {data?.max_team_size ?? 7} seats including stand-ins.
              </p>
            )}
          </div>
        </Card>

        <div className="lg:col-span-8">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              icon={Users}
              title={`No one waiting for ${archName(current)}`}
              body="People appear here after they pass onboarding and accept an offer from this company type."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {shown.map((c) => {
                const on = picked.includes(c.user_id);
                const days = Math.max(
                  0,
                  Math.floor((Date.now() - new Date(c.waiting_since).getTime()) / 86_400_000),
                );
                return (
                  <button
                    key={c.user_id}
                    type="button"
                    onClick={() => toggle(c.user_id)}
                    aria-pressed={on}
                    className={`card-duo flex flex-col gap-4 p-5 text-left transition-all ${on ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:border-primary/40"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary ring-2 ring-primary/25">
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-display text-base font-bold">{c.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {roleName(c.role_id)}
                            {c.username ? ` · @${c.username}` : ""}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${days >= 3 ? "bg-[color:var(--gold)]/15 text-[color:var(--gold)]" : "bg-primary/15 text-primary"}`}
                      >
                        {days === 0 ? "today" : `${days}d waiting`}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs">
                      <div>
                        <div className="text-[10px] text-muted-foreground">Assessment</div>
                        <div className="font-display font-bold text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]">
                          {c.score !== null ? `${Math.round(c.score)}%` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Hours/week</div>
                        <div className="font-display font-bold">{c.hours_per_week}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">Time zone</div>
                        <div className="font-display font-bold">{c.tz_band}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end border-t border-border pt-3 text-xs font-bold text-primary">
                      {on ? "✓ Selected" : "Select"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {(data?.active_squads ?? []).length > 0 && (
        <Card>
          <div className="mb-3 font-display text-base font-bold">Active squads</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.active_squads.map((t: any) => {
              const real = t.members.filter((m: any) => !m.is_standin).length;
              const ins = t.members.length - real;
              return (
                <div key={t.id} className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-display text-sm font-bold">{t.name}</span>
                    <Pill tone="primary">P{t.current_level}</Pill>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {archName(t.archetype_id)} · {real} builder{real === 1 ? "" : "s"}
                    {ins ? ` · ${ins} stand-in${ins === 1 ? "" : "s"}` : ""} · since{" "}
                    {fmtDate(t.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// 3. SPRINT BOARD
// ============================================================================

const COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "review", label: "In review" },
  { key: "done", label: "Done" },
] as const;
const PM_MOVES = COLUMNS.filter((c) => c.key !== "done");

export function BoardView() {
  const refresh = useRefresh();
  const { data, isLoading, error } = useQuery({
    queryKey: ["aipm", "board"],
    queryFn: () => api<any>("/aipm/board"),
    refetchInterval: 60_000,
  });
  const [team, setTeam] = useState("");
  const teams: any[] = data?.teams ?? [];
  const tasks: any[] = (data?.tasks ?? []).filter((t: any) => !team || t.team_id === team);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string; title: string }) =>
      api(`/aipm/tasks/${id}/status`, { body: { status } }),
    onSuccess: (_d, v) => {
      refresh();
      hzToast.success(
        "Task moved",
        `"${v.title}" is now ${COLUMNS.find((c) => c.key === v.status)?.label.toLowerCase()}. The squad was told in chat.`,
      );
    },
    onError: hzToast.fromError,
  });
  const reassign = useMutation({
    mutationFn: ({
      id,
      member_id,
    }: {
      id: string;
      member_id: string;
      title: string;
      name: string;
    }) => api(`/aipm/tasks/${id}/reassign`, { body: { member_id } }),
    onSuccess: (_d, v) => {
      refresh();
      hzToast.success("Task reassigned", `"${v.title}" now belongs to ${v.name}.`);
    },
    onError: hzToast.fromError,
  });
  const standup = useMutation({
    mutationFn: () =>
      api<{ squads: number }>("/aipm/standups", { body: { team_id: team || null } }),
    onSuccess: (r) =>
      hzToast.success(
        "Stand-up requested",
        `${r.squads} squad${r.squads === 1 ? "" : "s"} notified in chat and by notification.`,
      ),
    onError: hzToast.fromError,
  });

  return (
    <div className="flex flex-col gap-8">
      <ViewHeader
        chip="Sprint Board"
        title="Active squad deliverables."
        body="Every task on every active squad, live. Unblock work, move tasks, reassign them and ask squads for stand-ups. A task is marked done when its deliverable is graded."
        actions={
          <>
            <div className="w-56">
              <HzSelect
                label="Squad"
                value={team}
                onChange={setTeam}
                options={[
                  { value: "", label: "All active squads" },
                  ...teams.map((t) => ({
                    value: t.id,
                    label: t.name,
                    hint: `P${t.level} · ${t.project_title}`,
                  })),
                ]}
              />
            </div>
            <button
              type="button"
              onClick={() => standup.mutate()}
              disabled={standup.isPending || !teams.length}
              className="btn-duo !py-2.5 !px-4 text-xs disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />{" "}
              {standup.isPending ? "Sending…" : "Request stand-up updates"}
            </button>
          </>
        }
      />
      <ErrorNote error={error} />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No active squads"
          body="Form a squad in Talent & Squads; its first project and tasks appear here straight away."
        />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="grid min-w-[1100px] grid-cols-5 gap-4">
            {COLUMNS.map((col) => {
              const colTasks = tasks.filter((t) => t.status === col.key);
              return (
                <div
                  key={col.key}
                  className={`card-duo flex flex-col gap-3 bg-muted/20 p-3 ${col.key === "blocked" && colTasks.length ? "ring-1 ring-[color:var(--fire)]/30" : ""}`}
                >
                  <div className="flex items-center justify-between border-b border-border px-1 pb-2.5">
                    <span className="font-display text-sm font-bold">{col.label}</span>
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
                      {colTasks.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {colTasks.length === 0 && (
                      <div className="px-1 py-6 text-center text-xs text-muted-foreground">
                        Nothing here.
                      </div>
                    )}
                    {colTasks.map((t) => {
                      const members: any[] = (data.members?.[t.team_id] ?? []).filter(
                        (m: any) => !m.is_standin && m.id !== t.assignee_member_id,
                      );
                      return (
                        <div
                          key={t.id}
                          className={`rounded-xl border bg-card p-3.5 shadow-sm ${t.blocker || t.status === "blocked" ? "border-[color:var(--fire)]/50" : "border-border"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            {!team && (
                              <span className="truncate text-[10px] font-bold text-primary">
                                {teamName(t.team_id)}
                              </span>
                            )}
                            <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                              {roleName(t.role_id).split(" ")[0]}
                            </span>
                          </div>
                          <div className="mt-2 font-display text-xs font-bold leading-snug">
                            {t.title}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="truncate font-semibold text-foreground">
                              {t.assignee_name}
                            </span>
                            {t.due_at && (
                              <span
                                className={`flex shrink-0 items-center gap-1 ${t.overdue ? "font-bold text-[color:var(--fire)]" : ""}`}
                              >
                                <Clock className="h-3 w-3" /> {fmtDate(t.due_at)}
                              </span>
                            )}
                          </div>
                          {t.blocker && (
                            <div className="mt-2.5 rounded-lg border border-[color:var(--fire)]/30 bg-[color:var(--fire)]/10 p-2 text-[11px] text-[color:var(--fire)]">
                              <div className="flex items-center gap-1 font-bold">
                                <AlertTriangle className="h-3.5 w-3.5" /> Stand-up blocker
                              </div>
                              <div className="mt-0.5 line-clamp-3">{t.blocker}</div>
                            </div>
                          )}
                          {t.status !== "done" && (
                            <div className="mt-3 flex flex-col gap-2">
                              <HzSelect
                                size="sm"
                                label={`Move "${t.title}"`}
                                placeholder="Move to…"
                                value=""
                                disabled={move.isPending}
                                onChange={(v) =>
                                  v && move.mutate({ id: t.id, status: v, title: t.title })
                                }
                                options={PM_MOVES.filter((m) => m.key !== t.status).map((m) => ({
                                  value: m.key,
                                  label: m.label,
                                }))}
                              />
                              {members.length > 0 && (
                                <HzSelect
                                  size="sm"
                                  label={`Reassign "${t.title}"`}
                                  placeholder="Reassign to…"
                                  value=""
                                  disabled={reassign.isPending}
                                  onChange={(v) => {
                                    const m = members.find((x) => x.id === v);
                                    if (m)
                                      reassign.mutate({
                                        id: t.id,
                                        member_id: m.id,
                                        title: t.title,
                                        name: m.name,
                                      });
                                  }}
                                  options={members.map((m) => ({
                                    value: m.id,
                                    label: m.name,
                                    hint: roleName(m.role_id),
                                  }))}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. ACTIVITY & SPONSOR REPORTS
// ============================================================================

const ACTION_LABEL: Record<string, string> = {
  "aipm.brief_created": "Brief planned",
  "aipm.squad_drafted": "Squad drafted",
  "aipm.task_status": "Task moved",
  "aipm.task_reassigned": "Task reassigned",
  "aipm.standup_request": "Stand-up requested",
  "aipm.report_created": "Sponsor report created",
  "teams.run_matching": "Auto-matching ran",
  "project.finalize": "Project finalised",
  "project.team_score": "Team score set",
};

export function ReportsView() {
  const refresh = useRefresh();
  const board = useQuery({ queryKey: ["aipm", "board"], queryFn: () => api<any>("/aipm/board") });
  const reports = useQuery({
    queryKey: ["aipm", "reports"],
    queryFn: () => api<any[]>("/aipm/reports"),
  });
  const activity = useQuery({
    queryKey: ["aipm", "activity"],
    queryFn: () => api<any[]>("/aipm/activity"),
  });
  const teams: any[] = board.data?.teams ?? [];
  const [team, setTeam] = useState("");
  const current = team || teams[0]?.id || "";

  const create = useMutation({
    mutationFn: () => api<any>(`/aipm/teams/${current}/report`, { method: "POST" }),
    onSuccess: (r) => {
      refresh();
      hzToast.success("Report created", `Summary compiled for ${r.summary?.company}.`);
    },
    onError: hzToast.fromError,
  });

  return (
    <div className="flex flex-col gap-8">
      <ViewHeader
        chip="Activity & Reports"
        title="Sponsor reports & system log."
        body="Compile a progress summary for a partner company from the squad's real tasks, graded work and stand-ups, and review every project-management action."
        actions={
          <>
            <div className="w-56">
              <HzSelect
                label="Squad"
                value={current}
                onChange={setTeam}
                placeholder="No active squads"
                options={teams.map((t) => ({ value: t.id, label: t.name, hint: t.project_title }))}
              />
            </div>
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={!current || create.isPending}
              className="btn-duo !py-2.5 !px-5 text-xs disabled:opacity-50"
            >
              <FileBarChart2 className="h-4 w-4" />{" "}
              {create.isPending ? "Compiling…" : "Create sponsor report"}
            </button>
          </>
        }
      />

      {reports.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (reports.data ?? []).length === 0 ? (
        <EmptyState
          icon={FileBarChart2}
          title="No sponsor reports yet"
          body="Pick a squad and create a report. It's saved here so you can share progress with the partner."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {(reports.data ?? []).map((rep) => {
            const s = rep.summary ?? {};
            return (
              <div key={rep.id} className="card-duo flex flex-col gap-5 p-6">
                <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-primary">
                      Partner summary · {fmtDateTime(rep.created_at)}
                    </div>
                    <div className="mt-0.5 font-display text-lg font-bold">{s.company}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.team_name} · P{s.level} {s.project_title}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[color:var(--brand-green)]/15 px-3 py-1 font-display text-xs font-bold text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]">
                    {s.completion_rate}% complete
                  </span>
                </div>
                <div>
                  <Progress value={s.completion_rate ?? 0} />
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>
                      <b className="text-foreground">{s.tasks_done}</b>/{s.tasks_total} tasks done
                    </span>
                    {s.blocked > 0 && (
                      <span className="font-semibold text-[color:var(--fire)]">
                        {s.blocked} blocked
                      </span>
                    )}
                    <span>due {fmtDate(s.due_at)}</span>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">
                    Deliverables shipped
                  </div>
                  {(s.deliverables_shipped ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nothing graded yet.</p>
                  ) : (
                    <ul className="space-y-1.5 text-xs">
                      {s.deliverables_shipped.map((d: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">
                    Squad performance
                  </div>
                  <div className="divide-y divide-border rounded-xl border border-border bg-muted/20 px-4">
                    {(s.members ?? []).map((m: any) => (
                      <div
                        key={m.name}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-display font-bold">{m.name}</span>{" "}
                          <span className="text-muted-foreground">· {m.role}</span>
                          <div className="text-[11px] text-muted-foreground">
                            {m.tasks_done}/{m.tasks_total} tasks · {m.checkins_14d} stand-ups in 14
                            days{m.avg_score !== null ? ` · avg ${m.avg_score}%` : ""}
                          </div>
                        </div>
                        <Pill
                          tone={
                            m.rating === "Needs support"
                              ? "gold"
                              : m.rating === "No graded work yet"
                                ? "muted"
                                : "primary"
                          }
                        >
                          {m.rating}
                        </Pill>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card-duo p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-display text-base font-bold">Recent activity</span>
          <button
            type="button"
            onClick={() => activity.refetch()}
            className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${activity.isFetching ? "animate-spin" : ""}`} />{" "}
            Refresh
          </button>
        </div>
        {(activity.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No project-management activity yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {(activity.data ?? []).map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-1.5 py-3.5 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-bold">
                      {ACTION_LABEL[a.action] ?? a.action}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      · {fmtDateTime(a.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    by {a.actor?.full_name ?? a.actor?.username ?? "system"}
                    {a.details?.company ? ` · ${a.details.company}` : ""}
                    {a.details?.from && a.details?.to
                      ? ` · ${a.details.from} → ${a.details.to}`
                      : ""}
                    {typeof a.details?.formed === "number" ? ` · ${a.details.formed} squad(s)` : ""}
                  </p>
                </div>
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {a.action.startsWith("aipm.") ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <ShieldAlert className="h-3 w-3" />
                  )}
                  {a.action.split(".")[0]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
