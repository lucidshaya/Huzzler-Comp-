import { Link } from "@tanstack/react-router";
import { Bot, Clock } from "lucide-react";
import { fmtDate } from "./ui";

export type BoardTask = {
  id: string;
  title: string;
  status: string;
  role: string;
  assignee: string;
  isMine?: boolean;
  isStandin?: boolean;
  due_at?: string | null;
};

export const COLUMNS: Array<{ key: string; label: string }> = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "review", label: "In review" },
  { key: "done", label: "Done" },
];

export function Board({ tasks, linkable = true }: { tasks: BoardTask[]; linkable?: boolean }) {
  return (
    <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
      {COLUMNS.map((c) => {
        const list = tasks.filter((t) => t.status === c.key);
        return (
          <section
            key={c.key}
            className="w-[250px] shrink-0 snap-start rounded-xl border border-border bg-muted/30 p-2"
            aria-label={c.label}
          >
            <div className="mb-2 flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {c.label} <span className="rounded-full bg-muted px-2 py-0.5">{list.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {list.map((t) => {
                const inner = (
                  <div
                    className={`rounded-lg border bg-card p-3 text-left transition-colors ${t.isMine ? "border-primary/50" : "border-border"} ${linkable ? "hover:border-primary" : ""}`}
                  >
                    <div className="font-display text-sm font-bold leading-snug">{t.title}</div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        {t.isStandin && <Bot className="h-3 w-3 shrink-0" />}
                        {t.isMine ? "You" : t.assignee} · {t.role}
                      </span>
                      {t.due_at && (
                        <span className="flex shrink-0 items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmtDate(t.due_at)}
                        </span>
                      )}
                    </div>
                  </div>
                );
                return linkable ? (
                  <Link key={t.id} to="/workspace/task/$taskId" params={{ taskId: t.id }}>
                    {inner}
                  </Link>
                ) : (
                  <div key={t.id}>{inner}</div>
                );
              })}
              {list.length === 0 && (
                <div className="px-1 py-3 text-center text-xs text-muted-foreground">—</div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
