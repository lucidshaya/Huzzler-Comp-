import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  Calendar,
  CalendarCheck,
  Coins,
  ExternalLink,
  Flag,
  GitBranch,
  ListChecks,
  MessageSquare,
  Presentation,
  Send,
  Star,
  Target,
  Terminal,
  Upload,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { api, API_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { roleName, useMe } from "@/lib/journey";
import { memberName, useTeam, useWorkspace, type TeamMember } from "@/lib/team";
import { fmtTokens, useWallet } from "@/lib/tokens";
import {
  Card,
  CardTitle,
  EmptyState,
  ErrorNote,
  fmtDate,
  fmtDateTime,
  inputCls,
  Notice,
  PageHeader,
  Pill,
  Progress,
  ScoreBadge,
} from "@/components/app/ui";
import { Board } from "@/components/app/Board";
import { TeamTree } from "@/components/app/TeamTree";
import { WorkspaceSkeleton } from "@/components/app/Skeleton";
import { HustlerPanel } from "@/components/app/Hustler";
import { Workstation } from "@/components/app/Workstation";
import { Meetings } from "@/components/app/Meetings";

type Tab = "board" | "squad" | "workstation" | "deliverables";

export const Route = createFileRoute("/_app/workspace/")({
  validateSearch: z.object({
    tab: z.enum(["board", "squad", "workstation", "deliverables"]).optional(),
  }),
  head: () => ({ meta: [{ title: "Team workspace · Huzzler" }] }),
  component: Workspace,
});

type Member = TeamMember;
type Message = {
  id: string;
  user_id: string | null;
  kind: string;
  author_label: string | null;
  body: string;
  created_at: string;
};

const TABS: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: "board", label: "Board", icon: Target },
  { key: "squad", label: "Squad", icon: Users },
  { key: "workstation", label: "Workstation", icon: Terminal },
  { key: "deliverables", label: "Deliverables", icon: Upload },
];

function Workspace() {
  const { data: me } = useMe();
  const navigate = useNavigate({ from: "/workspace/" });
  const tab = Route.useSearch().tab ?? "board";
  const team = useTeam();
  const ws = useWorkspace();
  const wallet = useWallet();

  useEffect(() => {
    const id = team.data?.team?.id;
    if (!id) return;
    // Live board updates.
    const ch = supabase()
      .channel(`tasks-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_tasks" }, () =>
        ws.refetch(),
      )
      .subscribe();
    return () => void supabase().removeChannel(ch);
  }, [team.data?.team?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (team.isLoading || ws.isLoading || !me) return <WorkspaceSkeleton />;
  const placed = me.journey.status === "PLACED" || me.journey.status.startsWith("PROJECT_");
  if (!team.data?.team && placed)
    return (
      <EmptyState
        icon={Users}
        title="Setting up your squad"
        body="You're placed, and we're seating you with your teammates now. This usually takes a few seconds."
        action={
          <button
            onClick={() => {
              void team.refetch();
              void ws.refetch();
            }}
            className="btn-duo !py-2 !px-4 text-sm"
          >
            Try again
          </button>
        }
      />
    );
  if (!team.data?.team)
    return (
      <EmptyState
        icon={Users}
        title="You're not on a team yet"
        body="Accept an opportunity and we'll place you with real teammates straight away."
        action={
          <Link to="/opportunities" className="btn-duo !py-2 !px-4 text-sm">
            View opportunities
          </Link>
        }
      />
    );
  const t = team.data;
  const w = ws.data;
  const lapsed = me.journey.status === "LAPSED";

  const byMember = (memberId: string | null, userId: string | null) =>
    t.members.find((x) => x.id === memberId || (userId && x.user_id === userId));
  const tasks = (w?.tasks ?? []).map((x) => ({
    id: x.id,
    title: x.title,
    status: x.status,
    role: roleName(x.role_id).split(" ")[0],
    assignee: memberName(byMember(x.assignee_member_id, x.assignee_id)).split(" ")[0],
    isMine: x.assignee_id === me.user.id,
    isStandin: !x.assignee_id,
    due_at: x.due_at,
  }));
  const myTasks = (w?.tasks ?? []).filter((x) => x.assignee_id === me.user.id);
  const done = tasks.filter((x) => x.status === "done").length;
  const allDone = tasks.length > 0 && done === tasks.length;
  const pastDue = w?.project ? new Date(w.project.due_at) < new Date() : false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        chip={`${t.team.persona.name} · Project ${w?.project?.level ?? t.team.current_level} of 5`}
        title={w?.project?.template.title ?? t.team.name}
        body={
          w?.project
            ? `${t.team.name} · due ${fmtDate(w.project.due_at)} · ${done}/${tasks.length} tasks done`
            : t.team.name
        }
        actions={
          <Link
            to="/billing"
            hash="tokens"
            className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/15"
          >
            <Coins className="h-4 w-4" /> {fmtTokens(wallet.data?.balance ?? 0)} tokens
          </Link>
        }
      />
      {lapsed && <Notice tone="warn">Read-only: your plan has lapsed.</Notice>}
      {w?.project && <Progress value={(done / Math.max(1, tasks.length)) * 100} />}

      <div
        className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-muted/50 p-1.5"
        role="tablist"
        aria-label="Workspace"
      >
        {TABS.map((x) => {
          const Icon = x.icon;
          return (
            <button
              key={x.key}
              role="tab"
              aria-selected={tab === x.key}
              onClick={() => navigate({ search: { tab: x.key }, replace: true })}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 font-display text-sm font-bold transition-colors ${tab === x.key ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" /> {x.label}
            </button>
          );
        })}
      </div>

      {tab === "board" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card>
              <CardTitle icon={Target}>Board</CardTitle>
              {w?.project ? (
                <Board tasks={tasks} />
              ) : (
                <EmptyState icon={Target} title="Next project starting soon" />
              )}
            </Card>
            {w?.project && (
              <Card>
                <CardTitle icon={Flag}>Brief & milestones</CardTitle>
                <p className="text-sm text-muted-foreground">{w.project.template.brief}</p>
                <ol className="mt-4 flex flex-col gap-2">
                  {w.milestones.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                    >
                      <span className="font-semibold">{m.title}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {fmtDate(m.due_at)}{" "}
                        <Pill tone={m.status === "open" ? "muted" : "green"}>{m.status}</Pill>
                      </span>
                    </li>
                  ))}
                </ol>
                <CiInfo projectId={w.project.id} repoUrl={w.project.repo_url} />
              </Card>
            )}
            {w?.project && (allDone || pastDue) && !lapsed && (
              <PeerReviews
                projectId={w.project.id}
                members={t.members.filter((m) => m.user_id && m.user_id !== me.user.id)}
              />
            )}
            {w?.project?.level === 5 && !lapsed && <DemoDay projectId={w.project.id} />}
            {w && w.results.length > 0 && (
              <Card>
                <CardTitle icon={Star}>Your project results</CardTitle>
                <div className="flex flex-wrap gap-2">
                  {w.results.map((r, i) => (
                    <span key={r.project_instance_id} className="flex items-center gap-1.5 text-sm">
                      P{i + 1} <ScoreBadge score={r.total} />
                    </span>
                  ))}
                </div>
              </Card>
            )}
          </div>
          <div className="flex flex-col gap-4">
            {w?.project && !w.checkedInToday && !lapsed && <CheckIn />}
            <HustlerPanel tasks={myTasks} />
          </div>
        </div>
      )}

      {tab === "squad" && (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Current squad
                </div>
                <div className="mt-0.5 font-display text-xl font-bold">{t.team.name}</div>
                <div className="text-xs text-muted-foreground">
                  {w?.project?.template.title ?? "Project starting soon"}
                </div>
              </div>
              <Pill tone="primary">Active</Pill>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t.team.persona.mission}</p>
            <div className="mt-6">
              <TeamTree
                members={t.members.map((m) => ({
                  id: m.id,
                  name: memberName(m),
                  role: roleName(m.role_id),
                  isYou: m.user_id === me.user.id,
                  isStandin: m.is_standin,
                  owns: (w?.tasks ?? [])
                    .filter(
                      (x) =>
                        x.assignee_member_id === m.id || (m.user_id && x.assignee_id === m.user_id),
                    )
                    .map((x) => x.title)
                    .slice(0, 4),
                }))}
              />
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TeamChat
                teamId={t.team.id}
                members={t.members}
                myId={me.user.id}
                readOnly={lapsed}
              />
            </div>
            <Standups
              hasProject={Boolean(w?.project)}
              checkedIn={Boolean(w?.checkedInToday)}
              lapsed={lapsed}
            />
          </div>
          {w?.project && <Meetings readOnly={lapsed} />}
        </div>
      )}

      {tab === "workstation" &&
        (lapsed ? (
          <Notice tone="warn">
            The Workstation is paused while your plan is lapsed. Renew in Billing to keep building.
          </Notice>
        ) : (
          <Workstation />
        ))}

      {tab === "deliverables" && (
        <Card>
          <CardTitle
            icon={Upload}
            aside={
              <span className="text-xs text-muted-foreground">
                {myTasks.filter((x) => x.status === "done").length} of {myTasks.length} approved
              </span>
            }
          >
            Your deliverables
          </CardTitle>
          {myTasks.length === 0 ? (
            <EmptyState icon={ListChecks} title="No tasks assigned to you yet" />
          ) : (
            <div className="divide-y divide-border">
              {myTasks.map((x) => {
                const label =
                  x.status === "done"
                    ? "Approved"
                    : x.status === "review"
                      ? "Submitted"
                      : x.status === "blocked"
                        ? "Blocked"
                        : "In progress";
                const tone =
                  x.status === "done"
                    ? "green"
                    : x.status === "review"
                      ? "gold"
                      : x.status === "blocked"
                        ? "red"
                        : "muted";
                return (
                  <div
                    key={x.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-display text-sm font-bold">{x.title}</div>
                      <div className="text-xs text-muted-foreground">Due {fmtDate(x.due_at)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={tone}>{label}</Pill>
                      <Link
                        to="/workspace/task/$taskId"
                        params={{ taskId: x.id }}
                        className={
                          x.status === "done" || x.status === "review"
                            ? "btn-duo-outline !py-1.5 !px-3 text-xs"
                            : "btn-duo !py-1.5 !px-3 text-xs"
                        }
                      >
                        {x.status === "done" || x.status === "review" ? "View" : "Submit"}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

type Checkin = {
  id: string;
  user_id: string;
  checkin_date: string;
  yesterday: string;
  today: string;
  blockers: string | null;
  created_at: string;
  profile: { full_name: string | null } | null;
};

/** This week's stand-ups from the whole squad, with meeting shortcuts (Frontend design). */
function Standups({
  hasProject,
  checkedIn,
  lapsed,
}: {
  hasProject: boolean;
  checkedIn: boolean;
  lapsed: boolean;
}) {
  const { data } = useQuery({
    queryKey: ["team", "checkins"],
    queryFn: () => api<Checkin[]>("/team/checkins"),
  });
  return (
    <div className="flex flex-col gap-4">
      {hasProject && !checkedIn && !lapsed && <CheckIn />}
      <Card>
        <CardTitle icon={CalendarCheck}>Stand-ups this week</CardTitle>
        <div className="flex max-h-[300px] flex-col gap-3 overflow-y-auto">
          {(data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No stand-ups yet this week.</p>
          )}
          {(data ?? []).map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-[11px] font-bold text-primary ring-2 ring-primary/25">
                {new Date(c.checkin_date).toLocaleDateString("en-NG", { weekday: "short" })}
              </div>
              <div className="min-w-0 text-xs">
                <div className="font-display text-sm font-bold">
                  {(c.profile?.full_name ?? "Teammate").split(" ")[0]}
                </div>
                <div className="text-muted-foreground">
                  <b className="text-foreground">Did:</b> {c.yesterday} ·{" "}
                  <b className="text-foreground">Next:</b> {c.today}
                  {c.blockers && (
                    <>
                      {" "}
                      · <b className="text-[color:var(--fire)]">Blocked:</b> {c.blockers}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <a
            href="https://meet.google.com/new"
            target="_blank"
            rel="noreferrer"
            className="btn-duo !py-2 !px-4 text-sm"
          >
            <Video className="h-4 w-4" /> Start a Google Meet{" "}
            <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
          </a>
          <a
            href="https://calendar.google.com/calendar/u/0/r"
            target="_blank"
            rel="noreferrer"
            className="btn-duo-outline !py-2 !px-4 text-sm"
          >
            <Calendar className="h-4 w-4" /> Open Google Calendar{" "}
            <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
          </a>
        </div>
      </Card>
    </div>
  );
}

function TeamChat({
  teamId,
  members,
  myId,
  readOnly,
}: {
  teamId: string;
  members: Member[];
  myId: string;
  readOnly: boolean;
}) {
  const qc = useQueryClient();
  const { data: messages } = useQuery({
    queryKey: ["messages", teamId],
    queryFn: () => api<Message[]>("/team/messages"),
  });
  const [body, setBody] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const names = useMemo(
    () =>
      new Map(
        members
          .filter((m) => m.user_id)
          .map((m) => [m.user_id!, (m.profile?.full_name ?? "Teammate").split(" ")[0]]),
      ),
    [members],
  );

  useEffect(() => {
    const ch = supabase()
      .channel(`chat-${teamId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `team_id=eq.${teamId}` },
        (payload) => {
          qc.setQueryData<Message[]>(["messages", teamId], (old = []) =>
            old.some((m) => m.id === (payload.new as Message).id)
              ? old
              : [...old, payload.new as Message],
          );
        },
      )
      .subscribe();
    return () => void supabase().removeChannel(ch);
  }, [teamId, qc]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages?.length]);

  const send = useMutation({
    mutationFn: () => api<Message>("/team/messages", { body: { body } }),
    onSuccess: (m) => {
      setBody("");
      qc.setQueryData<Message[]>(["messages", teamId], (old = []) =>
        old.some((x) => x.id === m.id) ? old : [...old, m],
      );
    },
  });

  return (
    <div className="card-duo flex h-[460px] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 font-display text-sm font-bold">
        <MessageSquare className="h-4 w-4 text-primary" /> Team chat
      </div>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {(messages ?? []).map((m) => {
          const mine = m.user_id === myId;
          const who =
            m.kind === "user"
              ? mine
                ? "You"
                : (names.get(m.user_id ?? "") ?? "Teammate")
              : (m.author_label ?? "Huzzler");
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className="mb-0.5 text-[10px] font-semibold text-muted-foreground">
                {who} · {fmtDateTime(m.created_at)}
              </div>
              <div
                className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : m.kind === "system" ? "border border-primary/30 bg-primary/5" : m.kind === "standin" ? "border border-dashed border-border bg-muted" : "bg-muted"}`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        {(messages ?? []).length === 0 && (
          <p className="text-center text-xs text-muted-foreground">Say hello to your team 👋</p>
        )}
      </div>
      {!readOnly && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) send.mutate();
          }}
          className="flex gap-2 border-t border-border p-3"
        >
          <input
            aria-label="Message"
            className={`${inputCls} !py-2`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message your team (mention @designer, @qa… to ask a stand-in)"
            maxLength={4000}
          />
          <button
            disabled={send.isPending || !body.trim()}
            aria-label="Send"
            className="btn-duo !px-3 !py-2"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}

function CheckIn() {
  const qc = useQueryClient();
  const [f, setF] = useState({ yesterday: "", today: "", blockers: "" });
  const m = useMutation({
    mutationFn: () => api("/checkins", { body: { ...f, blockers: f.blockers || undefined } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspace"] });
      void qc.invalidateQueries({ queryKey: ["team", "checkins"] });
    },
  });
  return (
    <Card>
      <CardTitle icon={CalendarCheck}>Daily check-in</CardTitle>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="flex flex-col gap-2"
      >
        <input
          aria-label="What did you do yesterday?"
          className={`${inputCls} !py-2`}
          placeholder="What did you do yesterday?"
          value={f.yesterday}
          onChange={(e) => setF({ ...f, yesterday: e.target.value })}
          required
        />
        <input
          aria-label="What will you do today?"
          className={`${inputCls} !py-2`}
          placeholder="What will you do today?"
          value={f.today}
          onChange={(e) => setF({ ...f, today: e.target.value })}
          required
        />
        <input
          aria-label="Anything blocking you?"
          className={`${inputCls} !py-2`}
          placeholder="Anything blocking you? (optional)"
          value={f.blockers}
          onChange={(e) => setF({ ...f, blockers: e.target.value })}
        />
        <ErrorNote error={m.error} />
        <button disabled={m.isPending} className="btn-duo !py-2 text-sm">
          Post check-in
        </button>
      </form>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Check-ins are compiled into a team summary at 5pm WAT.
      </p>
    </Card>
  );
}

const DIMENSIONS = ["communication", "quality", "reliability", "collaboration"] as const;

function PeerReviews({ projectId, members }: { projectId: string; members: Member[] }) {
  const qc = useQueryClient();
  const done = useQuery({
    queryKey: ["peer", projectId],
    queryFn: () => api<string[]>(`/projects/${projectId}/peer-reviews`),
  });
  const todo = members.filter((m) => !(done.data ?? []).includes(m.user_id!));
  const [ratings, setRatings] = useState<Record<string, Record<string, number>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/peer-reviews`, {
        body: {
          reviews: todo
            .filter((x) => DIMENSIONS.every((d) => ratings[x.user_id!]?.[d]))
            .map((x) => ({
              reviewee_id: x.user_id,
              ratings: ratings[x.user_id!],
              comment: comments[x.user_id!] || undefined,
            })),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["peer", projectId] }),
  });
  if (!todo.length)
    return <Notice tone="success">Thanks — your peer reviews for this project are in.</Notice>;
  return (
    <Card>
      <CardTitle icon={Star}>Peer reviews</CardTitle>
      <p className="mb-3 text-sm text-muted-foreground">
        Rate each teammate 1–5. Reviews are private; the highest and lowest are trimmed when there
        are 4 or more.
      </p>
      <div className="flex flex-col gap-4">
        {todo.map((x) => (
          <div key={x.id} className="rounded-xl border border-border p-3">
            <div className="font-display text-sm font-bold">
              {x.profile?.full_name ?? "Teammate"}{" "}
              <span className="font-normal text-muted-foreground">· {roleName(x.role_id)}</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {DIMENSIONS.map((d) => (
                <div key={d} className="flex items-center justify-between gap-2 text-sm">
                  <span className="capitalize">{d}</span>
                  <span className="flex gap-1" role="radiogroup" aria-label={`${d} rating`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        role="radio"
                        aria-checked={ratings[x.user_id!]?.[d] === n}
                        aria-label={`${n}`}
                        type="button"
                        onClick={() =>
                          setRatings({
                            ...ratings,
                            [x.user_id!]: { ...ratings[x.user_id!], [d]: n },
                          })
                        }
                        className={`h-7 w-7 rounded-md text-xs font-bold ${(ratings[x.user_id!]?.[d] ?? 0) >= n ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                      >
                        {n}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <input
              className={`${inputCls} mt-2 !py-2 text-sm`}
              placeholder="Optional comment"
              value={comments[x.user_id!] ?? ""}
              onChange={(e) => setComments({ ...comments, [x.user_id!]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <ErrorNote error={m.error} />
      <button
        onClick={() => m.mutate()}
        disabled={
          m.isPending || !todo.some((x) => DIMENSIONS.every((d) => ratings[x.user_id!]?.[d]))
        }
        className="btn-duo mt-3 !py-2 text-sm disabled:opacity-50"
      >
        Submit reviews
      </button>
    </Card>
  );
}

function DemoDay({ projectId }: { projectId: string }) {
  const [summary, setSummary] = useState("");
  const [video, setVideo] = useState("");
  const m = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/demo`, { body: { summary, video_url: video || undefined } }),
  });
  return (
    <Card>
      <CardTitle icon={Presentation}>Demo day</CardTitle>
      {m.isSuccess ? (
        <Notice tone="success">
          Demo summary submitted. It's graded against the demo rubric and reviewed by your peers and
          a Huzzler admin.
        </Notice>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
          className="flex flex-col gap-2"
        >
          <p className="text-sm text-muted-foreground">
            Write a summary of what <b>you</b> owned and delivered in the capstone, key decisions,
            and what you learned. Add a link to your demo recording.
          </p>
          <textarea
            rows={8}
            className={inputCls}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="100+ characters"
            required
            minLength={100}
          />
          <input
            type="url"
            className={`${inputCls} !py-2`}
            value={video}
            onChange={(e) => setVideo(e.target.value)}
            placeholder="Recording link (YouTube, Loom, Drive)"
          />
          <ErrorNote error={m.error} />
          <button
            disabled={m.isPending || summary.length < 100}
            className="btn-duo self-end !py-2 text-sm disabled:opacity-50"
          >
            Submit demo
          </button>
        </form>
      )}
    </Card>
  );
}

function CiInfo({ projectId, repoUrl }: { projectId: string; repoUrl: string | null }) {
  const [show, setShow] = useState(false);
  const ci = useQuery({
    queryKey: ["ci", projectId],
    queryFn: () => api<{ endpoint: string; token: string }>(`/projects/${projectId}/ci`),
    enabled: show,
  });
  return (
    <div className="mt-4 rounded-lg border border-border p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          <GitBranch className="h-3.5 w-3.5" />{" "}
          {repoUrl ? (
            <a href={repoUrl} target="_blank" rel="noreferrer" className="text-primary underline">
              Team repository
            </a>
          ) : (
            "Team repository: add your GitHub repo link in chat"
          )}
        </span>
        <button onClick={() => setShow((v) => !v)} className="font-bold text-primary">
          {show ? "Hide" : "CI setup"}
        </button>
      </div>
      {show && ci.data && (
        <p className="mt-2 break-all text-muted-foreground">
          Post acceptance-test results from GitHub Actions to{" "}
          <code>{`${API_URL}${ci.data.endpoint}`}</code> with JSON{" "}
          <code>{`{"token":"${ci.data.token}","passed":N,"total":M}`}</code>. Keep the token in your
          repo's secrets.
        </p>
      )}
    </div>
  );
}
