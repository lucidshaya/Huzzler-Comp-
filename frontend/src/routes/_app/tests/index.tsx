import { useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Hourglass,
  Lock,
  Play,
  RotateCcw,
  Save,
  Timer,
  Trophy,
} from "lucide-react";
import { api } from "@/lib/api";
import { MAX_TEST_ATTEMPTS, roleName, useMe, useRefreshMe } from "@/lib/journey";
import { FIELD_TESTS, KIND_GUIDE, TEST_SLOTS } from "@/lib/onboardingGuide";
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
      // A retake has new submissions: drop test pages cached from the previous attempt.
      qc.removeQueries({ queryKey: ["test"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      refresh();
    },
  });
  // The server repairs stuck attempts when this loads; pick up any journey change it made.
  const attemptStatus = data?.attempt?.status;
  const journeyStatus = me?.journey.status;
  const synced = useRef(false);
  useEffect(() => {
    if (synced.current) return;
    if (journeyStatus === "TESTING" && (attemptStatus === "passed" || attemptStatus === "failed")) {
      synced.current = true;
      void refresh();
    }
  }, [attemptStatus, journeyStatus, refresh]);
  if (isLoading || !me) return <ListPageSkeleton rows={5} label="Loading your tests" />;
  const j = me.journey;
  // attempts_used counts finished attempts (an admin can reset it); attempt_no only ever grows.
  const attemptLabel = Math.min(
    MAX_TEST_ATTEMPTS,
    j.status === "TESTING" ? j.attempts_used + 1 : Math.max(1, j.attempts_used),
  );
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
          <div className="w-full max-w-2xl text-left">
            <div className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Your {roleName(me.profile.role_id)} tests
            </div>
            <ol className="flex flex-col gap-2">
              {(FIELD_TESTS[me.profile.role_id ?? ""] ?? FIELD_TESTS.product_manager).map(
                (kind, n) => (
                  <li
                    key={n}
                    className="hz-fade-up flex items-start gap-3 rounded-xl border border-border p-3"
                    style={{ animationDelay: `${n * 70}ms` }}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 font-display text-sm font-bold text-primary">
                      T{n + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                        {TEST_SLOTS[n].label}
                        <Pill>{KIND_GUIDE[kind].label}</Pill>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {TEST_SLOTS[n].mins} min
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{KIND_GUIDE[kind].how}</p>
                    </div>
                  </li>
                ),
              )}
            </ol>
          </div>
          <div className="grid w-full max-w-2xl gap-2 text-left sm:grid-cols-3">
            {(
              [
                [
                  Timer,
                  "One test at a time",
                  "Each timer starts when you open that test, not now.",
                ],
                [Save, "Autosaves", "Answers save every 15 seconds. Take breaks between tests."],
                [Trophy, "Pass mark 70%", "Weighted average, with no test under 50%."],
              ] as const
            ).map(([Icon, title, body]) => (
              <div key={title} className="rounded-xl bg-muted/50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Icon className="h-3.5 w-3.5 text-primary" /> {title}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            Find a quiet spot with a stable connection, then start when you're ready.
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
        chip={`Attempt ${attemptLabel} of ${MAX_TEST_ATTEMPTS}`}
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
      {j.status === "TESTS_FAILED" && j.attempts_used >= MAX_TEST_ATTEMPTS && (
        <Notice tone="warn">
          You've used all {MAX_TEST_ATTEMPTS} attempts in your plan. See your feedback in{" "}
          <Link to="/results" className="font-bold underline">
            Results
          </Link>
          , or{" "}
          <Link to="/support" search={{ new: true }} className="font-bold underline">
            contact support
          </Link>{" "}
          if you think something went wrong.
        </Notice>
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
                {KIND_GUIDE[t.test_bank.kind as keyof typeof KIND_GUIDE] && (
                  <div className="text-xs text-muted-foreground">
                    {KIND_GUIDE[t.test_bank.kind as keyof typeof KIND_GUIDE].label}
                  </div>
                )}
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
