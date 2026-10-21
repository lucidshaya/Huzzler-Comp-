import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { CalendarClock, LifeBuoy, ListChecks, Send, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { WorkspaceTask } from "@/lib/team";
import { AgentMark } from "./AgentMark";
import { ButtonSpinner } from "./Loader";
import { fmtDate } from "./ui";

/** "Huzzler, your AI internship manager" (Frontend design), on live tasks and the help bot. */
export function HustlerPanel({ tasks }: { tasks: WorkspaceTask[] }) {
  const [q, setQ] = useState("");
  const ask = useMutation({
    mutationFn: (question: string) =>
      api<{ answer: string; source: string }>("/help/ask", { body: { question } }),
  });
  const open = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => (a.due_at ?? "9").localeCompare(b.due_at ?? "9"));
  const soon = open.filter((t) => t.due_at).slice(0, 3);
  const submit = () => {
    const t = q.trim();
    if (t.length < 2 || ask.isPending) return;
    ask.mutate(t);
    setQ("");
  };
  return (
    <div className="card-duo flex h-fit flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <AgentMark size={48} />
        <div>
          <div className="font-display text-base font-bold">Huzzler</div>
          <div className="text-xs text-muted-foreground">Your AI internship manager</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Tracks your deadlines and unblocks you in the moment.
      </p>
      <Block icon={ListChecks} title="Tasks this week">
        {open.length === 0 && <Empty>Nothing open. Nice.</Empty>}
        {open.slice(0, 4).map((t, i) => (
          <Link
            key={t.id}
            to="/workspace/task/$taskId"
            params={{ taskId: t.id }}
            className="flex items-center justify-between gap-2 rounded-lg bg-background/60 px-2.5 py-1.5 text-sm hover:text-primary"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${i === 0 ? "bg-[color:var(--gold)]" : "bg-muted-foreground/40"}`}
              />
              <span className="truncate">{t.title}</span>
            </span>
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t.status.replace("_", " ")}
            </span>
          </Link>
        ))}
      </Block>
      <Block icon={CalendarClock} title="Upcoming deadlines">
        {soon.length === 0 && <Empty>No dates yet.</Empty>}
        {soon.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-2 rounded-lg bg-background/60 px-2.5 py-1.5 text-sm"
          >
            <span className="truncate">{t.title}</span>
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
              {fmtDate(t.due_at)}
            </span>
          </div>
        ))}
      </Block>
      <Block icon={LifeBuoy} title="Ask Huzzler">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 p-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={500}
            aria-label="Ask Huzzler"
            className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="How do peer reviews work?"
          />
          <button
            type="submit"
            aria-label="Ask"
            disabled={ask.isPending || q.trim().length < 2}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {ask.isPending ? <ButtonSpinner /> : <Send className="h-4 w-4" />}
          </button>
        </form>
        {ask.data && (
          <div className="mt-2 whitespace-pre-wrap rounded-lg border border-primary/30 bg-primary/10 p-2.5 text-xs text-foreground">
            {ask.data.answer}
          </div>
        )}
        {ask.error && (
          <div className="mt-2 rounded-lg bg-red-500/10 p-2.5 text-xs text-red-500">
            {(ask.error as Error).message}
          </div>
        )}
        {open[0] && (
          <Link
            to="/workspace/task/$taskId"
            params={{ taskId: open[0].id }}
            className="mt-2 block text-xs font-bold text-primary hover:underline"
          >
            Stuck on "{open[0].title}"? Use its hints and mentor →
          </Link>
        )}
      </Block>
    </div>
  );
}

function Block({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <div className="font-display text-sm font-bold">{title}</div>
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="px-1 text-xs text-muted-foreground">{children}</p>
);
