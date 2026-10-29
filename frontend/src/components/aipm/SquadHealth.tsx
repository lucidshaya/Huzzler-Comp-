import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, CalendarClock, HeartPulse, UserMinus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { roleName } from "@/lib/journey";
import { Card, CardTitle, ErrorNote, fmtDate, fmtDateTime, Pill } from "@/components/app/ui";
import { TableSkeleton } from "@/components/app/Skeleton";

type Health = {
  summary: {
    active_squads: number;
    mostly_ai: number;
    at_risk: number;
    removed_this_week: number;
    standin_deliverables_this_week: number;
    pending_proposals: number;
    squads_by_real_members: Record<"0" | "1" | "2" | "3+", number>;
  };
  squads: Array<{
    team_id: string;
    name: string;
    level: number;
    real_members: number;
    standins: number;
    due_at: string | null;
    last_activity_at: string | null;
    pending_proposals: number;
  }>;
  at_risk: Array<{
    user_id: string;
    name: string;
    role_id: string | null;
    team: string | null;
    warned_at: string;
  }>;
  removed: Array<{ user_id: string; name: string; role_id: string | null; removed_at: string }>;
  proposals: Array<{ id: string; team: string | null; title: string; held_at: string }>;
};

/** Who's about to be removed, which squads lean on AI stand-ins, and what's waiting for approval. */
export function SquadHealthView() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["aipm", "squad-health"],
    queryFn: () => api<Health>("/aipm/squad-health"),
    refetchInterval: 60_000,
  });
  if (isLoading) return <TableSkeleton rows={4} cols={4} />;
  if (!data) return <ErrorNote error={error} onRetry={() => refetch()} />;
  const s = data.summary;
  const stats = [
    { label: "Active squads", value: s.active_squads, icon: Users },
    { label: "Mostly AI stand-ins", value: s.mostly_ai, icon: Bot, warn: s.mostly_ai > 0 },
    { label: "Warned for inactivity", value: s.at_risk, icon: AlertTriangle, warn: s.at_risk > 0 },
    { label: "Removed this week", value: s.removed_this_week, icon: UserMinus },
    { label: "Stand-in deliverables (7 days)", value: s.standin_deliverables_this_week, icon: Bot },
    { label: "Meeting proposals waiting", value: s.pending_proposals, icon: CalendarClock },
  ];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          <HeartPulse className="h-6 w-6 text-primary" /> Squad health
        </h1>
        <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          Members get a warning after 2 quiet days and lose their seat to an AI stand-in after 3.
          Squads with fewer than 3 real people can't collect all their peer reviews, so their AI PM
          team review stands in.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((x) => (
          <div
            key={x.label}
            className={`card-duo flex flex-col gap-1 p-4 ${x.warn ? "border-amber-400/60" : ""}`}
          >
            <x.icon className={`h-4 w-4 ${x.warn ? "text-amber-500" : "text-primary"}`} />
            <span className="font-display text-2xl font-bold">{x.value}</span>
            <span className="text-xs font-semibold text-muted-foreground">{x.label}</span>
          </div>
        ))}
      </div>

      <Card>
        <CardTitle icon={AlertTriangle}>Warned for inactivity</CardTitle>
        {data.at_risk.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is close to being removed.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.at_risk.map((p) => (
              <li
                key={p.user_id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <span>
                  <b>{p.name}</b>
                  <span className="text-sm text-muted-foreground">
                    {" "}
                    · {roleName(p.role_id)} · {p.team ?? "No squad"}
                  </span>
                </span>
                <Pill tone="gold">Warned {fmtDateTime(p.warned_at)}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={Users}>Squads</CardTitle>
        <p className="-mt-1 mb-3 text-sm text-muted-foreground">
          Real members per squad: 0: {s.squads_by_real_members["0"]} · 1:{" "}
          {s.squads_by_real_members["1"]} · 2: {s.squads_by_real_members["2"]} · 3 or more:{" "}
          {s.squads_by_real_members["3+"]}
        </p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                {[
                  "Squad",
                  "Project",
                  "Real",
                  "AI stand-ins",
                  "Last activity",
                  "Due",
                  "Proposals",
                ].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.squads.map((t) => (
                <tr key={t.team_id} className="border-t border-border">
                  <td className="px-3 py-2 font-semibold">{t.name}</td>
                  <td className="px-3 py-2">{t.level || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={t.real_members < 3 ? "font-bold text-amber-600" : ""}>
                      {t.real_members}
                    </span>
                  </td>
                  <td className="px-3 py-2">{t.standins}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {t.last_activity_at ? fmtDateTime(t.last_activity_at) : "None this week"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(t.due_at)}</td>
                  <td className="px-3 py-2">{t.pending_proposals || "—"}</td>
                </tr>
              ))}
              {!data.squads.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    No active squads yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle icon={UserMinus}>Removed this week</CardTitle>
          {data.removed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No removals in the last 7 days.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.removed.map((p) => (
                <li key={p.user_id} className="flex justify-between gap-2 py-2">
                  <span>
                    <b>{p.name}</b> · {roleName(p.role_id)}
                  </span>
                  <span className="text-muted-foreground">{fmtDateTime(p.removed_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle icon={CalendarClock}>Meeting proposals waiting</CardTitle>
          {data.proposals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No meeting-note proposals are waiting for the squad to approve.
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.proposals.map((m) => (
                <li key={m.id} className="flex justify-between gap-2 py-2">
                  <span>
                    <b>{m.title}</b> · {m.team}
                  </span>
                  <span className="text-muted-foreground">{fmtDate(m.held_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
