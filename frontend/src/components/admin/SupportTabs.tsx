import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Inbox, MessageSquarePlus, Send } from "lucide-react";
import { api } from "@/lib/api";
import { ROLES, roleName } from "@/lib/journey";
import {
  Card,
  CardTitle,
  EmptyState,
  ErrorNote,
  fmtDateTime,
  inputCls,
  Pill,
} from "@/components/app/ui";
import { ButtonSpinner } from "@/components/app/Loader";
import { TableSkeleton } from "@/components/app/Skeleton";
import { CATEGORIES } from "@/components/app/Support";

type StaffTicket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  unread_by_staff: boolean;
  last_message_at: string;
  profile: { full_name: string | null; username: string | null } | null;
};
type StaffThread = {
  ticket: StaffTicket & { page_url: string | null; user_agent: string | null; created_at: string };
  user: {
    full_name: string | null;
    username: string | null;
    role_id: string | null;
    journey: { status: string; plan_id: string | null } | null;
  };
  messages: Array<{
    id: string;
    is_staff: boolean;
    body: string;
    attachment_url: string | null;
    created_at: string;
  }>;
};

const STATUS = ["open", "awaiting_user", "resolved", "closed"] as const;
const STATUS_TEXT: Record<string, string> = {
  open: "Needs reply",
  awaiting_user: "Waiting on user",
  resolved: "Resolved",
  closed: "Closed",
};
const TONE: Record<string, "gold" | "primary" | "green" | "muted" | "red"> = {
  open: "gold",
  awaiting_user: "primary",
  resolved: "green",
  closed: "muted",
  urgent: "red",
  high: "gold",
};
const catLabel = (c: string) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

export function SupportTab() {
  const [status, setStatus] = useState<string>("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "support", status],
    queryFn: () => api<StaffTicket[]>(`/admin/support?status=${status}`),
    refetchInterval: 20_000,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className={`flex flex-col gap-3 ${openId ? "hidden lg:flex" : ""}`}>
        <div className="flex flex-wrap gap-1.5">
          {[...STATUS, "all"].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${status === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {s === "all" ? "All" : STATUS_TEXT[s]}
            </button>
          ))}
        </div>
        <ErrorNote error={error} onRetry={() => refetch()} />
        {isLoading ? (
          <TableSkeleton rows={5} cols={2} />
        ) : (data ?? []).length === 0 ? (
          <EmptyState icon={Inbox} title="Inbox zero" body="No reports in this view." />
        ) : (
          <ul className="flex flex-col gap-2">
            {(data ?? []).map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setOpenId(t.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${openId === t.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"}`}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    {t.unread_by_staff && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--fire)]"
                        aria-label="Unread"
                      />
                    )}
                    <span className="truncate">{t.subject}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{t.profile?.full_name ?? "User"}</span>·
                    <span>{catLabel(t.category)}</span>·
                    <span>{fmtDateTime(t.last_message_at)}</span>
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    <Pill tone={TONE[t.status]}>{STATUS_TEXT[t.status]}</Pill>
                    {t.priority !== "normal" && (
                      <Pill tone={TONE[t.priority] ?? "muted"}>{t.priority}</Pill>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Card className={`${openId ? "" : "hidden lg:block"} min-h-[480px]`}>
        {openId ? (
          <StaffThreadView id={openId} onBack={() => setOpenId(null)} />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Pick a report to read and reply.
          </div>
        )}
      </Card>
    </div>
  );
}

function StaffThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data, error, refetch } = useQuery({
    queryKey: ["admin", "support", "ticket", id],
    queryFn: () => api<StaffThread>(`/admin/support/${id}`),
    refetchInterval: 10_000,
  });
  const [reply, setReply] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [data?.messages.length]);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "support"] });
  const send = useMutation({
    mutationFn: () => api(`/admin/support/${id}/messages`, { body: { body: reply } }),
    onSuccess: () => {
      setReply("");
      invalidate();
    },
  });
  const patch = useMutation({
    mutationFn: (b: Record<string, string>) =>
      api(`/admin/support/${id}`, { method: "PATCH", body: b }),
    onSuccess: invalidate,
  });
  if (error) return <ErrorNote error={error} onRetry={() => refetch()} />;
  if (!data)
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-16" />
        ))}
      </div>
    );
  const t = data.ticket;
  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 self-start text-sm font-semibold text-muted-foreground hover:text-primary lg:hidden"
      >
        <ArrowLeft className="h-4 w-4" /> Inbox
      </button>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="font-display text-lg font-bold">{t.subject}</div>
          <div className="text-xs text-muted-foreground">
            {data.user.full_name} (@{data.user.username}) · {roleName(data.user.role_id)} ·{" "}
            {data.user.journey?.status} · {catLabel(t.category)}
          </div>
          {t.page_url && (
            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              Page: {t.page_url}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Status"
            value={t.status}
            onChange={(e) => patch.mutate({ status: e.target.value })}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-semibold"
          >
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {STATUS_TEXT[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="Priority"
            value={t.priority}
            onChange={(e) => patch.mutate({ priority: e.target.value })}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-semibold"
          >
            {["low", "normal", "high", "urgent"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ErrorNote error={patch.error} />
      <ol className="flex max-h-[52vh] flex-col gap-3 overflow-y-auto pr-1">
        {data.messages.map((m) => (
          <li key={m.id} className={`flex flex-col ${m.is_staff ? "items-end" : "items-start"}`}>
            <span className="mb-1 text-[11px] font-semibold text-muted-foreground">
              {m.is_staff ? "Huzzler support" : data.user.full_name} · {fmtDateTime(m.created_at)}
            </span>
            <div
              className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.is_staff ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              {m.body}
              {m.attachment_url && (
                <a
                  href={m.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block overflow-hidden rounded-lg border border-border/50"
                >
                  <img
                    src={m.attachment_url}
                    alt="User screenshot"
                    className="max-h-72 w-full object-contain"
                  />
                </a>
              )}
            </div>
          </li>
        ))}
        <div ref={endRef} />
      </ol>
      {t.status !== "closed" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reply.trim()) send.mutate();
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            aria-label="Reply"
            rows={3}
            className={inputCls}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={5000}
            placeholder="Reply to the user — they'll get it in the app and by email"
          />
          <ErrorNote error={send.error} onRetry={() => send.mutate()} />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => patch.mutate({ status: "resolved" })}
              className="btn-duo-outline !py-2 !px-4 text-sm"
            >
              Mark resolved
            </button>
            <button
              disabled={send.isPending || !reply.trim()}
              className="btn-duo !py-2 !px-4 text-sm disabled:opacity-50"
            >
              {send.isPending ? <ButtonSpinner /> : <Send className="h-4 w-4" />} Send reply
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => patch.mutate({ status: "open" })}
          className="btn-duo-outline self-end !py-2 !px-4 text-sm"
        >
          Reopen
        </button>
      )}
    </div>
  );
}

type HelpQuery = {
  id: string;
  question: string;
  answered: boolean;
  source: string | null;
  score: number | null;
  helpful: boolean | null;
  created_at: string;
};

export function HelpBotTab() {
  const qc = useQueryClient();
  const [all, setAll] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "help", all],
    queryFn: () => api<HelpQuery[]>(`/admin/help/queries?unanswered=${!all}`),
  });
  const [draft, setDraft] = useState<{ question: string; answer: string; role_id: string } | null>(
    null,
  );
  const save = useMutation({
    mutationFn: () =>
      api("/admin/faq", {
        body: { question: draft!.question, answer: draft!.answer, role_id: draft!.role_id || null },
      }),
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin", "help"] });
    },
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      <Card>
        <CardTitle
          aside={
            <label className="flex items-center gap-1.5 text-xs font-semibold">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />{" "}
              Show all
            </label>
          }
        >
          {all ? "All questions" : "Questions the bot couldn't answer well"}
        </CardTitle>
        <p className="mb-3 text-xs text-muted-foreground">
          Turn common questions into FAQ entries — the help bot answers from the FAQ instantly, and
          the AI uses it as its source once the API key is added.
        </p>
        <ErrorNote error={error} onRetry={() => refetch()} />
        {isLoading ? (
          <TableSkeleton rows={6} cols={3} />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            icon={MessageSquarePlus}
            title="Nothing to review"
            body="Every recent question was answered."
          />
        ) : (
          <ul className="divide-y divide-border">
            {(data ?? []).map((q) => (
              <li
                key={q.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block">{q.question}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDateTime(q.created_at)} ·{" "}
                    {q.answered ? `answered (${q.source})` : "not answered"}
                    {q.helpful === false ? " · marked unhelpful" : ""}
                  </span>
                </span>
                <button
                  onClick={() => setDraft({ question: q.question, answer: "", role_id: "" })}
                  className="rounded-lg px-2.5 py-1 text-xs font-bold text-primary ring-1 ring-primary/30 hover:bg-primary/10"
                >
                  Add to FAQ
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardTitle icon={MessageSquarePlus}>New FAQ entry</CardTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <input
            className={`${inputCls} !py-2.5`}
            placeholder="Question"
            value={draft?.question ?? ""}
            onChange={(e) =>
              setDraft({
                question: e.target.value,
                answer: draft?.answer ?? "",
                role_id: draft?.role_id ?? "",
              })
            }
            minLength={5}
            maxLength={300}
            required
          />
          <textarea
            className={inputCls}
            rows={6}
            placeholder="Answer (plain, accurate, no promises you can't keep)"
            value={draft?.answer ?? ""}
            onChange={(e) =>
              setDraft({
                question: draft?.question ?? "",
                answer: e.target.value,
                role_id: draft?.role_id ?? "",
              })
            }
            minLength={10}
            maxLength={3000}
            required
          />
          <select
            className={`${inputCls} !py-2.5`}
            value={draft?.role_id ?? ""}
            onChange={(e) =>
              setDraft({
                question: draft?.question ?? "",
                answer: draft?.answer ?? "",
                role_id: e.target.value,
              })
            }
          >
            <option value="">Everyone</option>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} only
              </option>
            ))}
          </select>
          <ErrorNote error={save.error} />
          {save.isSuccess && !draft && (
            <p className="text-sm font-semibold text-[color:var(--brand-green)]">
              Saved — the bot can use it right away.
            </p>
          )}
          <button
            disabled={save.isPending || !draft?.question || !draft?.answer}
            className="btn-duo !py-2.5 disabled:opacity-50"
          >
            {save.isPending ? <ButtonSpinner /> : null} Save FAQ
          </button>
        </form>
      </Card>
    </div>
  );
}
