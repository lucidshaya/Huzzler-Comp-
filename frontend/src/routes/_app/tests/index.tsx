import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Hourglass, Lock, Play, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { MAX_TEST_ATTEMPTS, useMe, useRefreshMe } from "@/lib/journey";
import {
  Card,
  ErrorNote,
  fmtDate,
  Notice,
  PageHeader,
  Pill,
  ScoreBadge,
  Spinner,
} from "@/components/app/ui";
import { ListPageSkeleton } from "@/components/app/Skeleton";

export const Route = createFileRoute("/_app/tests/")({
  head: () => ({ meta: [{ title: "Onboarding tests · Huzzler" }] }),
  component: TestsOverview,
});

type Overview = {
  attempt: { id: string; attempt_no: number; status: string; weighted_score: number | null };
  tests: Array<{
    id: string;
    test_no: number;
    status: string;
    score: number | null;
    carried_over: boolean;
    weight: number;
    test_bank: { title: string; kind: string; time_limit_min: number };
  }>;
} | null;

const STATUS: Record<string, { label: string; tone: "muted" | "primary" | "gold" | "green" }> = {
  not_started: { label: "Not started", tone: "muted" },
  in_progress: { label: "In progress", tone: "primary" },
  submitted: { label: "Submitted", tone: "primary" },
  grading: { label: "Grading", tone: "primary" },
  awaiting_ai: { label: "Queued for grading", tone: "gold" },
  needs_review: { label: "Human review", tone: "gold" },
  graded: { label: "Graded", tone: "green" },
};

function TestsOverview() {
  const { data: me } = useMe();
  const refresh = useRefreshMe();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api<Overview>("/onboarding"),
    refetchInterval: (q) => (q.state.data?.attempt?.status === "grading" ? 8000 : false),
  });
  const start = useMutation({
    mutationFn: () => api("/onboarding/start", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      refresh();
    },
  });
  if (isLoading || !me) return <ListPageSkeleton rows={5} label="Loading your tests" />;
  const j = me.journey;
  const retakeOpen =
    j.status === "TESTS_FAILED" &&
    j.attempts_used < MAX_TEST_ATTEMPTS &&
    (!j.next_attempt_at || new Date(j.next_attempt_at) <= new Date());

  if (!data?.attempt || !Array.isArray(data.tests) || (j.status === "TESTS_FAILED" && retakeOpen)) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <PageHeader
          chip="Onboarding"
          title={j.status === "TESTS_FAILED" ? "Ready for your retake?" : "Your 5 onboarding tests"}
          body={
            j.status === "TESTS_FAILED"
              ? "You'll only retake the tests you scored under 70% on. Passing scores carry over."
              : "Take them in order. Each test is timed; your answers save as drafts while you work. You can take breaks between tests."
          }
        />
        <ErrorNote error={error ?? start.error} />
        <Card className="flex flex-col items-center gap-6 py-10 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary ring-4 ring-primary/10">
            {j.status === "TESTS_FAILED" ? (
              <RotateCcw className="h-8 w-8" />
            ) : (
              <Play className="h-8 w-8" />
            )}
          </div>
          <div className="grid w-full max-w-2xl grid-cols-5 gap-2">
            {[
              ["T1", "Fundamentals", "20m"],
              ["T2", "Practical", "45m"],
              ["T3", "Core task", "90m"],
              ["T4", "Scenario", "60m"],
              ["T5", "Teamwork", "20m"],
            ].map(([n, label, mins]) => (
              <div key={n} className="rounded-xl border border-border p-2">
                <div className="font-display text-sm font-bold text-primary">{n}</div>
                <div className="truncate text-[11px] font-semibold">{label}</div>
                <div className="text-[10px] text-muted-foreground">{mins}</div>
              </div>
            ))}
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            Find a quiet spot with a stable connection. The timer starts when you open each test,
            not now — you can take breaks between tests.
          </p>
          <button onClick={() => start.mutate()} disabled={start.isPending} className="btn-duo">
            {start.isPending ? (
              "Preparing…"
            ) : j.status === "TESTS_FAILED" ? (
              <>
                <RotateCcw className="h-4 w-4" /> Start attempt {j.attempts_used + 1}
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Start onboarding
              </>
            )}
          </button>
        </Card>
      </div>
    );
  }

  const nextOpen = data.tests.find((t) => t.status === "not_started" || t.status === "in_progress");
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        chip={`Attempt ${data.attempt.attempt_no} of 2`}
        title="Your onboarding tests"
        body="Pass mark: 70% weighted average, with no test below 50%."
        actions={
          ["passed", "failed"].includes(data.attempt.status) ? (
            <Link to="/results" className="btn-duo !py-2 !px-4 text-sm">
              See results
            </Link>
          ) : undefined
        }
      />
      {data.attempt.status === "grading" && (
        <Notice>
          <span className="flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-primary" /> All tests are in. We're finishing grading
            — this page updates automatically.
          </span>
        </Notice>
      )}
      {j.status === "TESTS_FAILED" && !retakeOpen && j.next_attempt_at && (
        <Notice tone="warn">Your retake opens on {fmtDate(j.next_attempt_at)}.</Notice>
      )}
      <div className="flex flex-col gap-3">
        {data.tests.map((t) => {
          const st = STATUS[t.status] ?? STATUS.not_started;
          const isNext = nextOpen?.test_no === t.test_no;
          const locked = !isNext && (t.status === "not_started" || t.status === "in_progress");
          return (
            <div
              key={t.id}
              className={`card-duo flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${isNext ? "ring-2 ring-primary/40" : ""}`}
            >
              <span
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl font-display text-lg font-bold ${t.status === "graded" ? "bg-[color:var(--brand-green)]/15 text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]" : "bg-primary/10 text-primary"}`}
              >
                {t.status === "graded" ? <CheckCircle2 className="h-6 w-6" /> : `T${t.test_no}`}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display font-bold">{t.test_bank.title}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t.weight}% of total</span>·
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {t.test_bank.time_limit_min} min
                  </span>
                  {t.carried_over && <Pill tone="green">Carried over</Pill>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {t.status === "graded" ? (
                  <ScoreBadge score={t.score} />
                ) : (
                  <Pill tone={st.tone}>{st.label}</Pill>
                )}
                {isNext && (
                  <Link
                    to="/tests/$testNo"
                    params={{ testNo: String(t.test_no) }}
                    className="btn-duo !py-2 !px-4 text-sm"
                  >
                    {t.status === "in_progress" ? "Continue" : "Start"}
                  </Link>
                )}
                {locked && (
                  <Lock
                    className="h-4 w-4 text-muted-foreground"
                    aria-label="Locked until earlier tests are done"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
