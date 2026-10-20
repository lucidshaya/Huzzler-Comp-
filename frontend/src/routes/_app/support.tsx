import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LifeBuoy, Plus } from "lucide-react";
import { z } from "zod";
import { api } from "@/lib/api";
import { Card, EmptyState, ErrorNote, fmtDateTime, PageHeader, Pill } from "@/components/app/ui";
import { ListPageSkeleton } from "@/components/app/Skeleton";
import {
  ReportForm,
  STATUS_LABEL,
  STATUS_TONE,
  TicketThread,
  type Ticket,
} from "@/components/app/Support";

export const Route = createFileRoute("/_app/support")({
  validateSearch: z.object({ ticket: z.string().uuid().optional(), new: z.boolean().optional() }),
  head: () => ({ meta: [{ title: "Help & support · Huzzler" }] }),
  component: SupportPage,
});

function SupportPage() {
  const { ticket, new: isNew } = Route.useSearch();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(Boolean(isNew));
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["support", "list"],
    queryFn: () => api<Ticket[]>("/support/tickets"),
    refetchInterval: 30_000,
  });
  if (isLoading) return <ListPageSkeleton rows={4} label="Loading your reports" />;

  const showDetail = Boolean(ticket) || creating;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        chip="Help & support"
        title="Talk to the Huzzler team"
        body="Report a problem, attach a screenshot and chat with us here. For quick answers, tap the help bubble in the corner."
        actions={
          <button
            onClick={() => {
              setCreating(true);
              navigate({ to: "/support", search: {} });
            }}
            className="btn-duo !py-2 !px-4 text-sm"
          >
            <Plus className="h-4 w-4" /> New report
          </button>
        }
      />
      <ErrorNote error={error} onRetry={() => refetch()} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className={`flex flex-col gap-2 ${showDetail ? "hidden lg:flex" : ""}`}>
          {(data ?? []).length === 0 && !creating && (
            <EmptyState
              icon={LifeBuoy}
              title="No reports yet"
              body="If something isn't working, open a new report and we'll help."
            />
          )}
          {(data ?? []).map((t) => (
            <Link
              key={t.id}
              to="/support"
              search={{ ticket: t.id }}
              onClick={() => setCreating(false)}
              className={`rounded-xl border p-3 transition-colors ${ticket === t.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"}`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                {t.unread_by_user && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--fire)]"
                    aria-label="New reply"
                  />
                )}
                <span className="truncate">{t.subject}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{fmtDateTime(t.last_message_at)}</span>
                <Pill tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Pill>
              </div>
            </Link>
          ))}
        </div>
        <Card className={`${showDetail ? "" : "hidden lg:block"} min-h-[420px]`}>
          {showDetail && (
            <button
              onClick={() => {
                setCreating(false);
                navigate({ to: "/support", search: {} });
              }}
              className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-primary lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" /> All reports
            </button>
          )}
          {creating ? (
            <>
              <h2 className="mb-4 font-display text-lg font-bold">New report</h2>
              <ReportForm
                onDone={(id) => {
                  setCreating(false);
                  navigate({ to: "/support", search: { ticket: id } });
                }}
              />
            </>
          ) : ticket ? (
            <TicketThread ticketId={ticket} />
          ) : (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              Pick a report to see the conversation.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
