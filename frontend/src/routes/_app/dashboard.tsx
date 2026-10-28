import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { hzToast } from "@/components/app/Toast";
import {
  ArrowRight,
  RefreshCw,
  Award,
  Briefcase,
  ClipboardCheck,
  Eye,
  FileText,
  Lock,
  MessageSquareText,
  Sparkles,
  Target,
  Users,
  CheckCircle2,
  AlertTriangle,
  Megaphone,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  hasPaid,
  MILESTONES,
  nextStep,
  onTeam,
  roleName,
  STATUS_LABEL,
  useMe,
  type Me,
} from "@/lib/journey";
import {
  Card,
  CardTitle,
  EmptyState,
  Locked,
  Notice,
  PageHeader,
  Pill,
  Progress,
  ScoreBadge,
} from "@/components/app/ui";
import { TeamTree } from "@/components/app/TeamTree";
import { Board } from "@/components/app/Board";
import {
  IdentityPortfolio,
  sampleIdentity,
  type Identity,
} from "@/components/app/IdentityPortfolio";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Huzzler" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useMe();
  if (!me) return null;
  const paid = hasPaid(me.journey.status) || me.journey.status === "LAPSED";
  return paid ? <RealDashboard me={me} /> : <PreviewDashboard me={me} />;
}

function NextStepCard({ me }: { me: Me }) {
  const step = nextStep(me);
  return (
    <div className="card-duo relative overflow-hidden p-5 md:p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            Your next step
          </div>
          <div className="mt-1 font-display text-xl font-bold md:text-2xl">{step.label}</div>
          <p className="mt-1 text-sm text-muted-foreground">{step.hint}</p>
        </div>
        <Link to={step.to} className="btn-duo shrink-0">
          {step.label} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <JourneyRail me={me} />
    </div>
  );
}

function JourneyRail({ me }: { me: Me }) {
  const reached = MILESTONES.map((m) => m.reached(me.journey.status));
  const pct = (reached.filter(Boolean).length / MILESTONES.length) * 100;
  return (
    <div className="relative mt-6">
      <Progress value={pct} />
      <ol className="mt-3 grid grid-cols-6 gap-1 text-center text-[10px] font-bold uppercase tracking-wider">
        {MILESTONES.map((m, i) => (
          <li key={m.key} className={reached[i] ? "text-primary" : "text-muted-foreground"}>
            <span className="flex flex-col items-center gap-1">
              {reached[i] ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <span className="h-4 w-4 rounded-full border-2 border-current" />
              )}
              {m.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview (before payment): sample data only, no AI calls, locked actions.
// ---------------------------------------------------------------------------
const SAMPLE_TEAM = [
  { id: "1", name: "Tolu A.", role: "Product Manager", owns: ["Spec", "Standups"] },
  { id: "2", name: "Kunle S.", role: "Software Engineer" },
  { id: "3", name: "You", role: "Your role", isYou: true },
  { id: "4", name: "Amina B.", role: "UI/UX Designer" },
  { id: "5", name: "Stand-in", role: "QA / Test Engineer", isStandin: true },
];
const SAMPLE_TASKS = [
  { id: "a", title: "Write the one-page spec", status: "done", role: "PM", assignee: "Tolu" },
  {
    id: "b",
    title: "Design the receipt screen",
    status: "review",
    role: "Design",
    assignee: "Amina",
  },
  {
    id: "c",
    title: "Build the share-receipt feature",
    status: "in_progress",
    role: "Engineer",
    assignee: "Kunle",
  },
  { id: "d", title: "Your first task", status: "todo", role: "You", assignee: "You", isMine: true },
  {
    id: "e",
    title: "Test the feature",
    status: "todo",
    role: "QA",
    assignee: "Stand-in",
    isStandin: true,
  },
];

function PreviewDashboard({ me }: { me: Me }) {
  useEffect(() => {
    if (me.journey.status === "FIELD_CHOSEN")
      void api("/me/preview", { method: "POST" }).catch(() => {});
  }, [me.journey.status]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        chip={`${roleName(me.profile.role_id)} · Preview`}
        title="This is what your Huzzler journey looks like."
        body="Everything below is sample data so you can see how it works. Begin onboarding to make it yours."
        actions={<DashboardActions />}
      />
      <Notice>
        <span className="flex items-center gap-2 font-semibold">
          <Eye className="h-4 w-4 text-primary" /> Preview mode — sample data. Nothing here is real
          yet.
        </span>
      </Notice>
      <NextStepCard me={me} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle icon={Users} aside={<Pill>Preview</Pill>}>
            Your team (sample)
          </CardTitle>
          <TeamTree members={SAMPLE_TEAM} teamName="Kobo Savings Squad" />
        </Card>
        <Card>
          <CardTitle icon={MessageSquareText} aside={<Pill>Preview</Pill>}>
            Feedback (sample)
          </CardTitle>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Mini PRD</span>
            <ScoreBadge score={78} />
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <p>
              <b className="text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]">
                Strengths:
              </b>{" "}
              <span className="text-muted-foreground">
                Clear problem statement backed by user quotes; non-goals keep scope tight.
              </span>
            </p>
            <p>
              <b className="text-[color:var(--gold)]">Gap:</b>{" "}
              <span className="text-muted-foreground">
                Success metric isn't defined precisely (no window or denominator).
              </span>
            </p>
            <p>
              <b className="text-primary">Next step:</b>{" "}
              <span className="text-muted-foreground">
                Rewrite the metric as "groups completing a first cycle within 30 days ÷ groups
                created".
              </span>
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle icon={Target} aside={<Pill>Preview</Pill>}>
          Project board (sample)
        </CardTitle>
        <Locked label="Begin onboarding to get your tasks">
          <Board tasks={SAMPLE_TASKS} linkable={false} />
        </Locked>
      </Card>

      <IdentityPortfolio data={sampleIdentity()} preview />
      <Card>
        <CardTitle icon={Briefcase} aside={<Lock className="h-4 w-4 text-muted-foreground" />}>
          Opportunities
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pass onboarding to get simulated internship opportunities from partner companies, each
          with a squad, a sprint and token stipend. After you're certified you can opt in to be
          recommended to real employers.
        </p>
        <Link to="/begin" className="btn-duo-outline mt-4 w-full !py-2 text-sm sm:w-auto">
          <Lock className="h-4 w-4" /> Locked
        </Link>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Real dashboard (after payment)
// ---------------------------------------------------------------------------
type Overview = {
  attempt: { status: string; weighted_score: number | null; attempt_no: number } | null;
  tests: Array<{ test_no: number; status: string; score: number | null }>;
} | null;
type Workspace = {
  project: { id: string; level: number; due_at: string; template: { title: string } } | null;
  tasks: Array<{ id: string; status: string; assignee_id: string | null }>;
  checkedInToday: boolean;
  results: Array<{ total: number; passed: boolean }>;
} | null;

function RealDashboard({ me }: { me: Me }) {
  const s = me.journey.status;
  const team = onTeam(s) || s === "CERTIFIED" || s === "LAPSED";
  const tests = useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api<Overview>("/onboarding"),
    enabled: s !== "LAPSED",
  });
  const ws = useQuery({
    queryKey: ["workspace"],
    queryFn: () => api<Workspace>("/workspace"),
    enabled: team,
  });
  const offers = useQuery({
    queryKey: ["offers"],
    queryFn: () => api<Array<{ status: string }>>("/offers"),
    enabled: s === "OFFER_PENDING",
  });
  const identity = useQuery({
    queryKey: ["identity"],
    queryFn: () => api<Identity>("/me/identity"),
    staleTime: 60_000,
  });

  const testsDone = tests.data?.tests.filter((t) => t.status === "graded").length ?? 0;
  const myTasks = ws.data?.tasks.filter((t) => t.assignee_id === me.user.id) ?? [];
  const passedProjects = ws.data?.results.filter((r) => r.passed).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        chip={`${roleName(me.profile.role_id)} · ${STATUS_LABEL[s]}`}
        title={`Hi ${me.profile.full_name?.split(" ")[0] ?? "there"} 👋`}
        actions={<DashboardActions />}
      />
      <NextStepCard me={me} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ClipboardCheck} label="Tests graded" value={`${testsDone}/5`} />
        <Stat
          icon={Award}
          label="Onboarding score"
          value={
            tests.data?.attempt?.weighted_score != null
              ? `${Math.round(Number(tests.data.attempt.weighted_score))}%`
              : "—"
          }
        />
        <Stat icon={Target} label="Projects passed" value={`${passedProjects}/5`} />
        <Stat
          icon={Users}
          label="My open tasks"
          value={String(myTasks.filter((t) => t.status !== "done").length)}
        />
      </div>

      {team && ws.data?.project && (
        <DailyQuests checkedIn={ws.data.checkedInToday} tasks={myTasks} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle icon={ClipboardCheck}>Onboarding tests</CardTitle>
          {tests.data?.attempt && tests.data.tests?.length ? (
            <ul className="divide-y divide-border">
              {tests.data.tests.map((t) => (
                <li key={t.test_no} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-semibold">Test {t.test_no}</span>
                  {t.status === "graded" ? (
                    <ScoreBadge score={t.score} />
                  ) : (
                    <Pill tone={t.status === "not_started" ? "muted" : "primary"}>
                      {t.status.replace(/_/g, " ")}
                    </Pill>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="Ready when you are"
              body="Five tests, in order. Drafts save automatically."
              action={
                <Link to="/tests" className="btn-duo !py-2 !px-4 text-sm">
                  Start tests
                </Link>
              }
            />
          )}
        </Card>
        <Card>
          <CardTitle icon={Target}>Current project</CardTitle>
          {ws.data?.project ? (
            <div className="flex flex-col gap-3">
              <div className="font-display text-lg font-bold">
                P{ws.data.project.level}: {ws.data.project.template.title}
              </div>
              <Progress
                value={
                  (ws.data.tasks.filter((t) => t.status === "done").length /
                    Math.max(1, ws.data.tasks.length)) *
                  100
                }
              />
              <div className="text-xs text-muted-foreground">
                Due {new Date(ws.data.project.due_at).toDateString()}
              </div>
              {!ws.data.checkedInToday && (
                <Notice tone="warn">You haven't posted today's check-in yet.</Notice>
              )}
              <Link to="/workspace" className="btn-duo-outline !py-2 text-sm">
                Open workspace
              </Link>
            </div>
          ) : s === "OFFER_PENDING" ? (
            <EmptyState
              icon={Briefcase}
              title={
                offers.data?.some((o) => o.status === "accepted")
                  ? "Opportunity accepted — placing you on a squad"
                  : "Your opportunities are waiting"
              }
              body={
                offers.data?.some((o) => o.status === "accepted")
                  ? "We're placing you with teammates now. You'll land in your team workspace."
                  : "Accept one within 72 hours to join a squad."
              }
              action={
                <Link to="/opportunities" className="btn-duo !py-2 !px-4 text-sm">
                  View opportunities
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No team yet"
              body="Pass onboarding to get simulated internship offers and join a real team."
            />
          )}
        </Card>
      </div>

      {identity.data ? (
        <IdentityPortfolio data={identity.data} />
      ) : identity.isLoading ? (
        <div className="skeleton h-80 rounded-2xl" />
      ) : null}
    </div>
  );
}

/** Today's habits that keep a squad healthy, from live workspace data. */
function DailyQuests({
  checkedIn,
  tasks,
}: {
  checkedIn: boolean;
  tasks: Array<{ status: string }>;
}) {
  const moving = tasks.filter((t) => t.status !== "todo" && t.status !== "blocked").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const quests: Array<{
    icon: LucideIcon;
    title: string;
    detail: string;
    progress: number;
    total: number;
  }> = [
    {
      icon: Megaphone,
      title: "Post today's stand-up",
      detail: checkedIn
        ? "Your squad knows what you're on."
        : "Yesterday, today and any blockers. Two minutes.",
      progress: checkedIn ? 1 : 0,
      total: 1,
    },
    {
      icon: Rocket,
      title: "Keep your tasks moving",
      detail: tasks.length
        ? `${moving} of ${tasks.length} started, in review or done.`
        : "No tasks assigned to you yet.",
      progress: moving,
      total: Math.max(1, tasks.length),
    },
    {
      icon: AlertTriangle,
      title: blocked
        ? `Clear ${blocked} blocked task${blocked === 1 ? "" : "s"}`
        : "Stay unblocked",
      detail: blocked
        ? "Say what you need in chat or ask the mentor; your PM can reassign."
        : "Nothing is blocking you.",
      progress: blocked ? 0 : 1,
      total: 1,
    },
  ];
  const done = quests.filter((q) => q.progress >= q.total).length;
  return (
    <Card>
      <CardTitle
        icon={Sparkles}
        aside={
          <Pill tone={done === quests.length ? "green" : "primary"}>
            {done}/{quests.length} done
          </Pill>
        }
      >
        Daily quests
      </CardTitle>
      <ul className="grid gap-3 md:grid-cols-3">
        {quests.map((q) => {
          const complete = q.progress >= q.total;
          const Icon = complete ? CheckCircle2 : q.icon;
          return (
            <li key={q.title}>
              <Link
                to="/workspace"
                className={`flex h-full flex-col gap-2 rounded-xl border p-3 transition-colors hover:border-primary/50 ${complete ? "border-[color:var(--brand-green)]/40 bg-[color:var(--brand-green)]/5" : "border-border bg-muted/30"}`}
              >
                <span className="flex items-center gap-2 font-display text-sm font-bold">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${complete ? "text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]" : "text-primary"}`}
                  />
                  {q.title}
                </span>
                <span className="text-xs text-muted-foreground">{q.detail}</span>
                <Progress
                  value={(Math.min(q.progress, q.total) / q.total) * 100}
                  className="mt-auto"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function DashboardActions() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RefreshButton />
      <ResumeButton />
    </div>
  );
}

/** Reloads everything on the dashboard (journey, tests, team, tokens) without a full page reload. */
function RefreshButton() {
  const qc = useQueryClient();
  const fetching = useIsFetching() > 0;
  const [spin, setSpin] = useState(false);
  const run = async () => {
    setSpin(true);
    try {
      await qc.invalidateQueries();
      hzToast.success("Dashboard is up to date");
    } finally {
      setSpin(false);
    }
  };
  return (
    <button
      onClick={() => void run()}
      disabled={spin}
      aria-label="Refresh dashboard"
      title="Refresh"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-70"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${spin || fetching ? "animate-spin" : ""}`} /> Refresh
    </button>
  );
}

/** Small shortcut to Profile → AI résumé. */
function ResumeButton() {
  return (
    <Link
      to="/profile"
      search={{ tab: "resume" }}
      className="group inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/15"
    >
      <FileText className="h-3.5 w-3.5" /> Build your résumé now
      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Award; label: string; value: string }) {
  return (
    <div className="card-duo p-4">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary ring-2 ring-primary/25">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 font-display text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
    </div>
  );
}
