/* eslint-disable @typescript-eslint/no-explicit-any -- test content/answers are kind-specific JSON validated server-side */
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock, Cloud, Send } from "lucide-react";
import { api } from "@/lib/api";
import { Countdown, ErrorNote, Notice } from "@/components/app/ui";
import {
  ChoiceQuestions,
  CodeAnswer,
  NumericAnswers,
  Ranking,
  SeededIssues,
  WrittenAnswer,
  type RunResult,
} from "@/components/app/TestInputs";
import { hzConfirm } from "@/components/app/Dialogs";
import { DetailSkeleton } from "@/components/app/Skeleton";
import { KIND_GUIDE, type TestKind } from "@/lib/onboardingGuide";

export const Route = createFileRoute("/_app/tests/$testNo")({
  head: () => ({ meta: [{ title: "Test · Huzzler" }] }),
  component: TestRunner,
});

type TestPayload = {
  submission: {
    id: string;
    status: string;
    draft: Record<string, unknown> | null;
    started_at: string | null;
    deadline_at: string | null;
  };
  test: {
    title: string;
    kind: string;
    content: Record<string, any>;
    time_limit_min: number;
    weight: number;
    test_no: number;
    requires_declaration: boolean;
  };
};

function TestRunner() {
  const { testNo } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["test", testNo],
    queryFn: () => api<TestPayload>(`/onboarding/tests/${testNo}`),
    staleTime: Infinity,
  });
  const start = useMutation({
    mutationFn: () => api<TestPayload>(`/onboarding/tests/${testNo}/start`, { method: "POST" }),
    onSuccess: (d) => qc.setQueryData(["test", testNo], d),
  });

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [declared, setDeclared] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = useRef(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (data && !loaded.current) {
      setAnswers(data.submission.draft ?? {});
      loaded.current = true;
    }
  }, [data]);

  const change = (v: Record<string, any>) => {
    setAnswers(v);
    dirty.current = true;
  };

  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    try {
      const r = await api<{ at: string }>(`/onboarding/tests/${testNo}/draft`, {
        method: "PUT",
        body: { draft: answers },
      });
      setSavedAt(r.at);
    } catch {
      dirty.current = true; // retry on the next tick (slow networks)
    }
  }, [answers, testNo]);

  // Autosave every 15 seconds and when the tab is hidden.
  useEffect(() => {
    const t = setInterval(save, 15_000);
    const onHide = () => document.visibilityState === "hidden" && void save();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [save]);

  const submit = useMutation({
    mutationFn: async () => {
      await save();
      return api(`/onboarding/tests/${testNo}/submit`, {
        body: { answers, ai_declaration: declared },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      qc.removeQueries({ queryKey: ["test", testNo] });
      navigate({ to: "/tests" });
    },
  });
  const onExpire = useCallback(() => submit.mutate(), [submit]);
  const runCode = useCallback(
    (source: string) => api<RunResult>(`/onboarding/tests/${testNo}/run`, { body: { source } }),
    [testNo],
  );

  if (isLoading) return <DetailSkeleton label="Loading test" />;
  if (error || !data)
    return (
      <div className="flex flex-col gap-4">
        <ErrorNote error={error} onRetry={() => refetch()} />
        <Link to="/tests" className="btn-duo-outline self-start">
          Back to tests
        </Link>
      </div>
    );
  const { test, submission } = data;

  if (submission.status === "not_started") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <Link
          to="/tests"
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> All tests
        </Link>
        <div className="card-duo p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            Test {test.test_no} · {test.weight}%
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold">{test.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{test.content.instructions}</p>
          {KIND_GUIDE[test.kind as TestKind] && (
            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
              <b>{KIND_GUIDE[test.kind as TestKind].label}:</b>{" "}
              {KIND_GUIDE[test.kind as TestKind].how}
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-primary" /> {test.time_limit_min} minutes, starting when
            you press Start.
          </div>
          <Notice>If time runs out, your last saved draft is submitted automatically.</Notice>
          <ErrorNote error={start.error} />
          <button
            onClick={() => start.mutate()}
            disabled={start.isPending}
            className="btn-duo mt-5"
          >
            {start.isPending ? "Starting…" : "Start the timer"}
          </button>
        </div>
      </div>
    );
  }
  if (submission.status !== "in_progress") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-start gap-4">
        <Notice tone="success">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> You've submitted this test.
          </span>
        </Notice>
        <Link to="/tests" className="btn-duo">
          Back to tests
        </Link>
      </div>
    );
  }

  const c = test.content;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="sticky top-[57px] z-10 -mx-4 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-bold">
            T{test.test_no}: {test.title}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Cloud className="h-3 w-3" />{" "}
            {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : "Autosaves every 15s"}
          </div>
        </div>
        {submission.deadline_at && (
          <div className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
            <Clock className="h-4 w-4" />
            <Countdown to={submission.deadline_at} onExpire={onExpire} />
          </div>
        )}
      </div>

      <div className="card-duo p-5">
        <p className="text-sm">{c.instructions}</p>
        {c.brief && (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
            {c.brief}
          </div>
        )}
      </div>

      {(test.kind === "mcq" || test.kind === "sjt") && (
        <ChoiceQuestions content={c as any} value={answers} onChange={change} />
      )}
      {test.kind === "ranking" && <Ranking content={c as any} value={answers} onChange={change} />}
      {test.kind === "seeded_issues" && (
        <SeededIssues content={c as any} value={answers} onChange={change} />
      )}
      {test.kind === "numeric" && (
        <NumericAnswers content={c as any} value={answers} onChange={change} />
      )}
      {test.kind === "sql_result" && (
        <CodeAnswer content={c} value={answers} onChange={change} field="sql" onRun={runCode} />
      )}
      {test.kind === "code_sandbox" && (
        <CodeAnswer content={c} value={answers} onChange={change} onRun={runCode} />
      )}
      {test.kind === "ai_rubric" && <WrittenAnswer content={c} value={answers} onChange={change} />}

      <div className="sticky bottom-[76px] z-20 -mx-1 rounded-2xl border border-border bg-background/95 px-4 py-3 shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur md:bottom-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {test.requires_declaration ? (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[color:var(--primary)]"
                checked={declared}
                onChange={(e) => setDeclared(e.target.checked)}
              />
              <span>
                This is my own work. I may have used AI tools to learn, but not to produce this
                answer.
              </span>
            </label>
          ) : (
            <span />
          )}
          <div className="flex flex-col items-end gap-1">
            <ErrorNote error={submit.error} onRetry={() => submit.mutate()} />
            <button
              onClick={async () => {
                if (
                  await hzConfirm({
                    title: "Submit this test?",
                    body: "You can't change your answers after you submit.",
                    confirmLabel: "Submit test",
                    cancelLabel: "Keep working",
                  })
                )
                  submit.mutate();
              }}
              disabled={submit.isPending || (test.requires_declaration && !declared)}
              className="btn-duo !py-2.5 disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Submit test
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
