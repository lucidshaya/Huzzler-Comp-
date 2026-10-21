import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Kanban, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorNote } from "@/components/app/ui";
import { TableSkeleton } from "@/components/app/Skeleton";

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
            onClick={() => go(c.tab)}
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
