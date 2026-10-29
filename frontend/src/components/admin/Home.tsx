import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, IdCard, Kanban, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { roleName } from "@/lib/journey";
import { Card, CardTitle, ErrorNote, fmtDateTime } from "@/components/app/ui";
import { TableSkeleton } from "@/components/app/Skeleton";
import { hzToast } from "@/components/app/Toast";
import { hzPrompt } from "@/components/app/Dialogs";

type Home = {
  full_name: string | null;
  staff_title: string | null;
  role: string;
  cards: Array<{ key: string; label: string; value: number; tab: string }>;
};

const ROLE_INTRO: Record<string, string> = {
  admin: "Everything that needs a decision today, across the platform.",
  moderator: "Reports to answer, onboarding answers to grade and appeals to settle.",
  content_reviewer:
    "Tests and listings waiting for approval, and questions the help bot couldn't answer.",
  partnerships: "Opportunity listings and the offers learners are deciding on.",
};

/** Each staff member's own dashboard: the queues their role is responsible for. */
export function HomeTab({ go }: { go: (tab: string) => void }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "home"],
    queryFn: () => api<Home>("/admin/home"),
    refetchInterval: 60_000,
  });
  if (isLoading) return <TableSkeleton rows={3} cols={3} />;
  if (!data) return <ErrorNote error={error} onRetry={() => refetch()} />;
  const first = data.full_name?.split(" ")[0] ?? "there";
  // "aipm:<tab>" opens the AI PM portal; "home#<id>" scrolls to a section on this page.
  const open = (tab: string) => {
    if (tab.startsWith("aipm:")) window.location.href = `/aipm?tab=${tab.slice(5)}`;
    else if (tab.startsWith("home#"))
      document.getElementById(tab.slice(5))?.scrollIntoView({ behavior: "smooth" });
    else go(tab);
  };
  const seesIds = data.role === "admin" || data.role === "moderator";
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div className="card-duo relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative">
          <div className="text-xs font-bold uppercase tracking-widest text-primary">
            {data.staff_title ?? data.role.replace("_", " ")}
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight">
            Welcome back, {first}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ROLE_INTRO[data.role] ?? ROLE_INTRO.admin}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.cards.map((c) => (
          <button
            key={c.key}
            onClick={() => open(c.tab)}
            className="card-duo group flex flex-col gap-2 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40"
          >
            <span className="font-display text-3xl font-bold tracking-tight">
              {c.value.toLocaleString()}
            </span>
            <span className="text-sm font-semibold text-muted-foreground">{c.label}</span>
            <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-primary">
              Open{" "}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>
      {seesIds && <IdChecks />}
      {data.role === "admin" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href="/aipm?tab=ai"
            className="card-duo flex items-center gap-3 p-4 hover:border-primary/40"
          >
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm">
              <b>See how the AI thinks</b>
              <span className="block text-xs text-muted-foreground">
                Squad matching, grading and briefs, step by step.
              </span>
            </span>
          </a>
          <a
            href="/aipm?tab=grading"
            className="card-duo flex items-center gap-3 p-4 hover:border-primary/40"
          >
            <Kanban className="h-5 w-5 text-primary" />
            <span className="text-sm">
              <b>Project grading</b>
              <span className="block text-xs text-muted-foreground">
                Deliverables and demo day, in the AI PM portal.
              </span>
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

type IdCheck = {
  id: string;
  user_id: string;
  name: string;
  username: string | null;
  role_id: string | null;
  submitted_at: string;
  file_url: string | null;
};

/** Uploaded IDs waiting for a decision. Approving issues the certificate if everything else is done. */
function IdChecks() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "identity-checks"],
    queryFn: () => api<IdCheck[]>("/admin/identity-checks"),
  });
  const decide = useMutation({
    mutationFn: (v: { userId: string; verified: boolean; note?: string }) =>
      api(`/admin/users/${v.userId}/verify-identity`, {
        body: { verified: v.verified, note: v.note },
      }),
    onSuccess: (_r, v) => {
      hzToast.success(v.verified ? "ID approved" : "ID rejected", "The learner has been told.");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: hzToast.fromError,
  });
  const reject = async (userId: string) => {
    const note = await hzPrompt({
      title: "Reject this ID",
      label: "What's wrong with it? (sent to the learner)",
      type: "textarea",
      minLength: 3,
      maxLength: 300,
      confirmLabel: "Reject ID",
    });
    if (note) decide.mutate({ userId, verified: false, note });
  };
  return (
    <Card>
      <div id="id-checks" className="scroll-mt-24" />
      <CardTitle icon={IdCard}>Pending ID checks</CardTitle>
      <p className="-mt-1 text-sm text-muted-foreground">
        Learners need a verified ID for their certificate. Check that the name matches their profile
        and the document is a valid government ID.
      </p>
      {isLoading ? (
        <TableSkeleton rows={2} cols={3} />
      ) : !data?.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No IDs waiting. New uploads appear here and in your notifications.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {[c.username && `@${c.username}`, c.role_id && roleName(c.role_id)]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  · uploaded {fmtDateTime(c.submitted_at)}
                </div>
              </div>
              {c.file_url ? (
                <a
                  href={c.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
                >
                  View ID <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">File missing</span>
              )}
              <button
                disabled={decide.isPending}
                onClick={() => void reject(c.user_id)}
                className="btn-duo-outline !px-3 !py-1.5 text-sm"
              >
                Reject
              </button>
              <button
                disabled={decide.isPending}
                onClick={() => decide.mutate({ userId: c.user_id, verified: true })}
                className="btn-duo !px-3 !py-1.5 text-sm"
              >
                Approve
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
