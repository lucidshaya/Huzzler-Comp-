/* eslint-disable @typescript-eslint/no-explicit-any -- AI PM API payloads are loosely shaped JSON */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  Cpu,
  FlaskConical,
  Gavel,
  GitBranch,
  RefreshCw,
  Scale,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { roleName } from "@/lib/journey";
import { EmptyState, ErrorNote, fmtDateTime, Pill, ScoreBadge } from "@/components/app/ui";
import { CardSkeleton } from "@/components/app/Skeleton";
import { hzForm } from "@/components/app/Dialogs";
import { hzToast } from "@/components/app/Toast";
import { AgentMark } from "@/components/app/AgentMark";

function Header({
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
        <p className="max-w-2xl text-sm text-muted-foreground">{body}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ============================================================================
// Project grading: deliverables and demo day (onboarding grading stays in Admin)
// ============================================================================

export function GradingView() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["aipm", "grading"],
    queryFn: () => api<any>("/aipm/grading"),
  });
  const done = (msg: string) => {
    void qc.invalidateQueries({ queryKey: ["aipm"] });
    hzToast.success(msg);
  };
  const resolve = useMutation({
    mutationFn: ({
      type,
      id,
      ...body
    }: {
      type: string;
      id: string;
      score: number;
      feedback?: string;
      user_id?: string;
    }) => api(`/aipm/grading/${type}/${id}/resolve`, { body }),
    onSuccess: () => done("Grade saved. The learner can see it and the project score updates."),
    onError: hzToast.fromError,
  });
  const answer = useMutation({
    mutationFn: ({
      id,
      ...b
    }: {
      id: string;
      status: string;
      response: string;
      new_score?: number;
    }) => api(`/aipm/appeals/${id}`, { body: b }),
    onSuccess: () => done("Appeal answered. The learner has been notified."),
    onError: hzToast.fromError,
  });
  const grade = async (type: string, id: string, user_id?: string, current?: number | null) => {
    const v = await hzForm({
      title: "Record the final grade",
      confirmLabel: "Save grade",
      fields: [
        {
          name: "score",
          label: "Final score (0–100)",
          type: "number",
          required: true,
          min: 0,
          max: 100,
          defaultValue: current != null ? String(current) : undefined,
        },
        {
          name: "feedback",
          label: "Feedback for the learner (optional)",
          type: "textarea",
          maxLength: 4000,
        },
      ],
    });
    if (v)
      resolve.mutate({
        type,
        id,
        user_id,
        score: Number(v.score),
        feedback: String(v.feedback).trim() || undefined,
      });
  };
  const respond = async (id: string, adjust: boolean) => {
    const v = await hzForm({
      title: adjust ? "Adjust the score" : "Uphold the grade",
      body: "Your response is sent to the learner.",
      confirmLabel: adjust ? "Adjust score" : "Uphold grade",
      fields: [
        ...(adjust
          ? [
              {
                name: "score",
                label: "New score (0–100)",
                type: "number" as const,
                required: true,
                min: 0,
                max: 100,
              },
            ]
          : []),
        {
          name: "response",
          label: "Response to the learner",
          type: "textarea",
          required: true,
          minLength: 10,
          maxLength: 4000,
        },
      ],
    });
    if (v)
      answer.mutate({
        id,
        status: adjust ? "adjusted" : "upheld",
        response: String(v.response).trim(),
        ...(adjust ? { new_score: Number(v.score) } : {}),
      });
  };

  const dels: any[] = data?.deliverables ?? [];
  const flagged: any[] = data?.flagged_grades ?? [];
  const appeals: any[] = data?.appeals ?? [];
  return (
    <div className="flex flex-col gap-8">
      <Header
        chip="Project grading"
        title="Grade squad work."
        body="Deliverables and demo day that the AI couldn't grade, grades it flagged for a human, and appeals on project work. Your grade is final and updates the squad's project score."
        actions={
          <button onClick={() => refetch()} className="btn-duo-outline !py-2 !px-4 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        }
      />
      <ErrorNote error={error ?? resolve.error ?? answer.error} />
      {isLoading ? (
        <CardSkeleton />
      ) : (
        <>
          <section className="card-duo p-6">
            <div className="mb-4 flex items-center gap-2 font-display text-base font-bold">
              <Gavel className="h-4 w-4 text-primary" /> Deliverables waiting for a grade (
              {dels.length})
            </div>
            {dels.length === 0 ? (
              <p className="text-sm text-muted-foreground">Queue is empty.</p>
            ) : (
              <div className="divide-y divide-border">
                {dels.map((d) => (
                  <details key={d.id} className="py-3">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                      <b>{d.task?.title}</b>
                      <span className="text-muted-foreground">
                        {d.profile?.full_name ?? "Learner"} · {roleName(d.task?.role_id)} ·{" "}
                        {fmtDateTime(d.submitted_at)}
                      </span>
                      <Pill tone="gold">
                        {d.status === "awaiting_ai" ? "waiting for AI" : "needs review"}
                      </Pill>
                    </summary>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs">
                      {d.content}
                    </pre>
                    {(d.links ?? []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {d.links.map((l: string) => (
                          <a
                            key={l}
                            href={l}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-primary underline"
                          >
                            {l}
                          </a>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => grade("deliverable", d.id)}
                      className="btn-duo mt-3 !py-1.5 !px-4 text-xs"
                    >
                      Grade
                    </button>
                  </details>
                ))}
              </div>
            )}
          </section>
          <section className="card-duo p-6">
            <div className="mb-4 flex items-center gap-2 font-display text-base font-bold">
              <AlertTriangle className="h-4 w-4 text-[color:var(--gold)]" /> Grades the AI flagged (
              {flagged.length})
            </div>
            {flagged.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing flagged.</p>
            ) : (
              <div className="divide-y divide-border">
                {flagged.map((g) => (
                  <div
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      {g.profile?.full_name ?? "Learner"} ·{" "}
                      {g.subject_type === "demo" ? "Demo day" : "Deliverable"}{" "}
                      <ScoreBadge score={g.score} />
                      {g.flags?.possible_prompt_injection && <Pill tone="red">injection?</Pill>}
                      {g.flags?.anomaly && <Pill tone="gold">{g.flags.anomaly}</Pill>}
                    </span>
                    <button
                      onClick={() => grade(g.subject_type, g.subject_id, g.user_id, g.score)}
                      className="btn-duo-outline !py-1.5 !px-3 text-xs"
                    >
                      Confirm / override
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="card-duo p-6">
            <div className="mb-4 flex items-center gap-2 font-display text-base font-bold">
              <Scale className="h-4 w-4 text-primary" /> Appeals on project work
            </div>
            {appeals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appeals.</p>
            ) : (
              <div className="divide-y divide-border">
                {appeals.map((a) => (
                  <div key={a.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>{a.profile?.full_name}</b>
                      <Pill tone={a.status === "open" ? "gold" : "muted"}>{a.status}</Pill>
                      <span className="text-xs text-muted-foreground">
                        due {fmtDateTime(a.due_at)} · score {a.grade?.score}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{a.reason}</p>
                    {a.status === "open" && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => respond(a.id, false)}
                          className="btn-duo-outline !py-1.5 !px-3 text-xs"
                        >
                          Uphold grade
                        </button>
                        <button
                          onClick={() => respond(a.id, true)}
                          className="btn-duo !py-1.5 !px-3 text-xs"
                        >
                          Adjust score
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ============================================================================
// AI reasoning: how the AI PM thinks (or the rules engine standing in for it)
// ============================================================================

const KINDS = [
  { key: "", label: "All decisions", queue: "all" },
  { key: "squad_matching", label: "Squad matching", queue: "matching" },
  { key: "grading", label: "Grading", queue: "grader" },
  { key: "wbs", label: "Briefs → WBS", queue: "wbs-router" },
  { key: "offer_ranking", label: "Opportunity ranking", queue: "offer-ranker" },
];
const queueOf = (k: string) => KINDS.find((x) => x.key === k)?.queue ?? k;
const ENGINE: Record<string, { label: string; tone: "green" | "gold" | "muted" }> = {
  ai: { label: "Claude", tone: "green" },
  rules: { label: "Rules engine", tone: "gold" },
  mock: { label: "Mock", tone: "muted" },
};
const FEATURE_LABEL: Record<string, string> = {
  onboarding_grading: "Onboarding grading",
  project_grading: "Project grading",
  second_grading: "Second opinion",
  demo_grading: "Demo day",
  mentor_chat: "Mentor chat",
  aipm_wbs: "Briefs → WBS",
  help_bot: "Help bot",
  workstation: "Workstation",
  integrity_review: "Integrity",
};

export function AiView() {
  const [kind, setKind] = useState("");
  const status = useQuery({
    queryKey: ["aipm", "ai", "status"],
    queryFn: () => api<any>("/aipm/ai/status"),
    refetchInterval: 60_000,
  });
  const feed = useQuery({
    queryKey: ["aipm", "ai", "decisions", kind],
    queryFn: () => api<any[]>(`/aipm/ai/decisions?kind=${kind}`),
    refetchInterval: 30_000,
  });
  const preview = useQuery({
    queryKey: ["aipm", "ai", "matching"],
    queryFn: () => api<any>("/aipm/ai/matching-preview"),
  });
  const s = status.data;

  return (
    <div className="flex flex-col gap-8">
      <Header
        chip="AI reasoning"
        title="How the AI PM thinks."
        body="Every squad match, grade, work breakdown and opportunity ranking is logged with the steps behind it. Until the Anthropic API key is added, the rules engine makes these calls and explains itself the same way; once the key is set, Claude takes over and its reasoning appears here."
        actions={
          <button
            onClick={() => {
              void feed.refetch();
              void preview.refetch();
              void status.refetch();
            }}
            className="btn-duo-outline !py-2 !px-4 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${feed.isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        }
      />

      <section
        className={`card-duo flex flex-wrap items-center gap-5 p-6 ${s?.configured ? "border-[color:var(--brand-green)]/40" : "border-[color:var(--gold)]/40"}`}
      >
        <AgentMark size={52} animated={Boolean(s?.configured)} />
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2 font-display text-lg font-bold">
            {s?.configured ? "Claude is connected" : "AI key not connected yet"}
            <Pill tone={s?.configured ? "green" : "gold"}>
              {s?.configured ? "live" : s?.mock ? "mock mode" : "rules engine"}
            </Pill>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {s?.configured
              ? "Grading, briefs, the mentor and the Workstation call Claude. Matching stays deterministic so it's explainable and fair."
              : "Add ANTHROPIC_API_KEY to the API's environment and redeploy. Work waiting for AI grading is picked up automatically; nothing else needs to change."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center text-xs">
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-2">
            <div className="font-display text-lg font-bold">{s?.month.calls ?? "…"}</div>
            <div className="text-muted-foreground">AI calls this month</div>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-2">
            <div className="font-display text-lg font-bold">
              ${(s?.month.cost_usd ?? 0).toFixed(2)}
            </div>
            <div className="text-muted-foreground">AI spend this month</div>
          </div>
        </div>
      </section>

      {s && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(FEATURE_LABEL).map(([f, label]) => {
            const used = s.month.by_feature[f];
            return (
              <div
                key={f}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <Cpu className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 text-xs">
                  <div className="font-display text-sm font-bold">{label}</div>
                  <div className="truncate font-mono text-muted-foreground">{s.models[f]}</div>
                  <div className="text-muted-foreground">
                    {used
                      ? `${used.calls} calls · $${used.cost_usd.toFixed(3)}${used.failures ? ` · ${used.failures} failed` : ""}`
                      : "no calls yet"}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="card-duo p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-display text-base font-bold">
            <Users className="h-4 w-4 text-primary" /> Squad matching, right now
          </div>
          <span className="text-xs text-muted-foreground">
            Dry run · nothing is formed · stand-ins after {preview.data?.standin_after_hours ?? 72}{" "}
            h of waiting
          </span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          The matcher seeds each squad with whoever has waited longest, then picks the closest
          person for every required role by onboarding score band (×3), time zone (+2 if different)
          and weekly hours (÷5). Lower is closer.
        </p>
        {preview.isLoading ? (
          <CardSkeleton />
        ) : (preview.data?.archetypes ?? []).length === 0 ? (
          <EmptyState
            icon={Users}
            title="No one is waiting for a squad"
            body="People who accept an opportunity are placed straight away; anyone left over appears here."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {preview.data.archetypes.map((a: any) => (
              <div
                key={a.archetype_id}
                className="rounded-2xl border border-border bg-muted/20 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold">
                    {a.archetype_id.replace("_", " / ")}
                  </span>
                  <Pill tone="primary">{a.waiting} waiting</Pill>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">Needs {a.required}</div>
                {a.proposed.map((t: any, i: number) => (
                  <div
                    key={i}
                    className="mt-3 rounded-xl border border-[color:var(--brand-green)]/40 bg-[color:var(--brand-green)]/5 p-3 text-xs"
                  >
                    <div className="mb-1 font-bold">Would form now</div>
                    {t.members.map((m: any) => (
                      <div key={m.name}>
                        <b>{m.name}</b> ({m.role}){" "}
                        <span className="text-muted-foreground">— {m.why}</span>
                      </div>
                    ))}
                    {t.standins.length > 0 && (
                      <div className="mt-1 text-muted-foreground">
                        Stand-ins: {t.standins.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
                {a.waiting_why.map((w: any) => (
                  <div key={w.name} className="mt-2 text-xs">
                    <b>{w.name}</b> ({w.role}){" "}
                    <span className="text-muted-foreground">— {w.why}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card-duo p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-display text-base font-bold">
            <Brain className="h-4 w-4 text-primary" /> Decision log
          </div>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.key || "all"}
                onClick={() => setKind(k.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${kind === k.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {k.label}
                {k.key && s?.decisions[k.key]
                  ? ` · ${s.decisions[k.key].ai + s.decisions[k.key].rules + s.decisions[k.key].mock}`
                  : ""}
              </button>
            ))}
          </div>
        </div>
        <ErrorNote error={feed.error} />
        {feed.isLoading ? (
          <CardSkeleton />
        ) : (feed.data ?? []).length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No decisions logged yet"
            body="They appear as people are matched, graded and offered opportunities."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {(feed.data ?? []).map((d) => (
              <Decision key={d.id} d={d} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Decision({ d }: { d: any }) {
  const [open, setOpen] = useState(false);
  const engine = ENGINE[d.engine] ?? ENGINE.rules;
  const steps: Array<{ label: string; detail: string; weight?: number }> = d.reasoning ?? [];
  return (
    <div
      className={`rounded-2xl border p-4 ${d.status === "flagged" ? "border-[color:var(--gold)]/50 bg-[color:var(--gold)]/5" : d.status === "overridden" ? "border-border bg-muted/30 opacity-80" : "border-border bg-card"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono font-bold text-muted-foreground">
              <GitBranch className="mr-1 inline h-3 w-3" />
              {queueOf(d.kind)}
            </span>
            <Pill tone={engine.tone}>{engine.label}</Pill>
            {d.model && <span className="font-mono text-muted-foreground">{d.model}</span>}
            {d.status === "flagged" && <Pill tone="gold">flagged for a human</Pill>}
            {d.status === "overridden" && <Pill>overridden by a person</Pill>}
            <span className="text-muted-foreground">{fmtDateTime(d.created_at)}</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold">{d.summary}</p>
          {(d.profile?.full_name || d.team?.name) && (
            <p className="text-xs text-muted-foreground">
              {[d.profile?.full_name, d.team?.name].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {d.confidence != null && (
            <div
              className="hidden w-24 sm:block"
              title={`Confidence ${Math.round(d.confidence * 100)}%`}
            >
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${d.confidence * 100}%` }}
                />
              </div>
              <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                {Math.round(d.confidence * 100)}% sure
              </div>
            </div>
          )}
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {open && (
        <ol className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {steps.length === 0 && (
            <li className="text-xs text-muted-foreground">No reasoning recorded.</li>
          )}
          {steps.map((st, i) => (
            <li key={i} className="flex gap-3 text-xs">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <b>{st.label}</b>
                  {typeof st.weight === "number" && (
                    <span className="font-mono text-muted-foreground">{st.weight}</span>
                  )}
                </div>
                <div className="text-muted-foreground">{st.detail}</div>
              </div>
            </li>
          ))}
          {d.latency_ms != null && (
            <li className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-3 w-3" /> {d.latency_ms} ms
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
