import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, ChevronDown, MessageCircleQuestion } from "lucide-react";
import { Appeal } from "@/components/app/Appeal";
import { api } from "@/lib/api";
import {
  Card,
  ErrorNote,
  fmtDate,
  inputCls,
  Notice,
  PageHeader,
  Pill,
  Progress,
  ScoreBadge,
  Spinner,
} from "@/components/app/ui";
import { ListPageSkeleton } from "@/components/app/Skeleton";

export const Route = createFileRoute("/_app/results")({
  head: () => ({ meta: [{ title: "Results · Huzzler" }] }),
  component: Results,
});

type Grade = {
  id: string;
  score: number;
  criteria: Record<string, { score: number; note: string }>;
  strengths: string | null;
  gaps: string | null;
  next_steps: string[];
  feedback: string | null;
  grader: string;
  needs_review: boolean;
};
type ResultsData = {
  attempt: { attempt_no: number; status: string; weighted_score: number | null };
  result: {
    weighted_score: number;
    passed: boolean;
    summary: { failed_tests: number[]; below_floor: number[] };
  } | null;
  journey: { status: string; attempts_used: number; next_attempt_at: string | null };
  tests: Array<{
    id: string;
    test_no: number;
    status: string;
    score: number | null;
    carried_over: boolean;
    weight: number;
    test_bank: { title: string };
    grade: Grade | null;
    appeal: { status: string; response: string | null; new_score: number | null } | null;
    follow_up: { id: string; follow_up_question: string; follow_up_answer: string | null } | null;
  }>;
};

function Results() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["results"],
    queryFn: () => api<ResultsData>("/onboarding/results"),
  });
  if (isLoading) return <ListPageSkeleton rows={5} label="Loading results" />;
  if (error || !data) return <ErrorNote error={error} onRetry={() => refetch()} />;
  const r = data.result;
  const passed = r?.passed;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        chip={`Attempt ${data.attempt.attempt_no}`}
        title={
          !r
            ? "Results are on the way"
            : passed
              ? "You passed. You're verified! 🎉"
              : "Not this time — here's how to get there"
        }
      />
      {r && (
        <div
          className={`card-duo relative overflow-hidden p-6 ${passed ? "ring-2 ring-[color:var(--brand-green)]/50" : ""}`}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Weighted score
              </div>
              <div className="font-display text-5xl font-bold">{Math.round(r.weighted_score)}%</div>
              <div className="text-sm text-muted-foreground">Pass mark 70%, no test below 50%.</div>
            </div>
            {passed ? (
              <div className="flex flex-col items-start gap-2 md:items-end">
                <Pill tone="green">
                  <Award className="h-3 w-3" /> Verified
                </Pill>
                <Link to="/offers" className="btn-duo">
                  See your job offers
                </Link>
              </div>
            ) : (
              <div className="text-sm md:text-right">
                {data.journey.attempts_used < 2 ? (
                  <>
                    You can retake <b>{r.summary.failed_tests.map((t) => `T${t}`).join(", ")}</b>{" "}
                    from <b>{fmtDate(data.journey.next_attempt_at)}</b>.
                  </>
                ) : (
                  <>You've used both attempts. Use the feedback below to keep improving.</>
                )}
              </div>
            )}
          </div>
          <Progress value={r.weighted_score} className="mt-5" />
        </div>
      )}
      <div className="flex flex-col gap-3">
        {data.tests.map((t) => (
          <TestResult key={t.id} t={t} />
        ))}
      </div>
    </div>
  );
}

function TestResult({ t }: { t: ResultsData["tests"][number] }) {
  const [open, setOpen] = useState(false);
  const g = t.grade;
  return (
    <Card className="!p-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 font-display font-bold text-primary">
          T{t.test_no}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display font-bold">{t.test_bank.title}</span>
          <span className="text-xs text-muted-foreground">
            {t.weight}% {t.carried_over ? "· carried over from attempt 1" : ""}
            {g?.needs_review || t.status === "needs_review" ? " · being reviewed by a person" : ""}
          </span>
        </span>
        <ScoreBadge score={t.status === "graded" ? t.score : null} />
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-border p-4">
          {!g && (
            <p className="text-sm text-muted-foreground">
              {t.carried_over
                ? "Your passing score from attempt 1 counts here."
                : "Grading isn't finished yet."}
            </p>
          )}
          {g && (
            <>
              {g.feedback && <p className="text-sm">{g.feedback}</p>}
              {Object.keys(g.criteria ?? {}).length > 0 && (
                <div className="grid gap-2">
                  {Object.entries(g.criteria).map(([id, c]) => (
                    <div key={id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold">{id.replace(/_/g, " ")}</span>
                        <ScoreBadge score={c.score} />
                      </div>
                      {c.note && <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>}
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {g.strengths && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]">
                      Strengths
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{g.strengths}</p>
                  </div>
                )}
                {g.gaps && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-[color:var(--gold)]">
                      Gaps
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{g.gaps}</p>
                  </div>
                )}
              </div>
              {g.next_steps?.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-primary">
                    Next steps
                  </div>
                  <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                    {g.next_steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Graded by{" "}
                {g.grader === "ai"
                  ? "AI against a rubric (pass/fail applied by Huzzler)"
                  : g.grader === "human"
                    ? "a Huzzler reviewer"
                    : "automatic checks"}
              </div>
              {t.follow_up && <FollowUp f={t.follow_up} />}
              <Appeal gradeId={g.id} appeal={t.appeal} />
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function FollowUp({
  f,
}: {
  f: { id: string; follow_up_question: string; follow_up_answer: string | null };
}) {
  const qc = useQueryClient();
  const [answer, setAnswer] = useState("");
  const m = useMutation({
    mutationFn: () => api(`/onboarding/follow-up/${f.id}`, { body: { answer } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["results"] }),
  });
  return (
    <Notice tone="warn">
      <div className="flex items-center gap-2 font-semibold">
        <MessageCircleQuestion className="h-4 w-4" /> A quick follow-up question
      </div>
      <p className="mt-1">{f.follow_up_question}</p>
      {f.follow_up_answer ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Thanks — your answer was sent to a reviewer.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            rows={3}
            className={inputCls}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Answer in your own words (20+ characters)"
          />
          <ErrorNote error={m.error} />
          <button
            onClick={() => m.mutate()}
            disabled={answer.length < 20 || m.isPending}
            className="btn-duo self-end !py-2 text-sm disabled:opacity-50"
          >
            Send answer
          </button>
        </div>
      )}
    </Notice>
  );
}
