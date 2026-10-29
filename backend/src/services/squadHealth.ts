import { db } from "../lib/supabase.js";
import { INACTIVITY_REMOVE_DAYS } from "../domain/constants.js";

// Squad health for staff: who's about to be removed for inactivity, which squads are mostly AI
// stand-ins, what stand-ins produced this week and which meeting proposals wait for approval.
// Shown in the AI PM portal (Squad health tab) and summarised on the admin home.

const DAY = 86_400_000;

export type SquadRow = {
  team_id: string;
  name: string;
  level: number;
  real_members: number;
  standins: number;
  due_at: string | null;
  last_activity_at: string | null;
  pending_proposals: number;
};

export async function squadHealth() {
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
  const warnWindow = new Date(Date.now() - INACTIVITY_REMOVE_DAYS * DAY).toISOString();
  const { data: teams } = await db.from("teams").select("id, name, current_level").eq("status", "active").order("created_at");
  const teamIds = (teams ?? []).map((t) => t.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const ids = teamIds.length ? teamIds : none;

  const [members, projects, messages, checkins, meetings, warned, removed, standinWork] = await Promise.all([
    db.from("team_members").select("id, team_id, user_id, role_id, is_standin, standin_name").eq("status", "active").in("team_id", ids),
    db.from("project_instances").select("id, team_id, due_at").eq("status", "active").in("team_id", ids),
    db.from("messages").select("team_id, created_at").eq("kind", "user").in("team_id", ids).gte("created_at", weekAgo).order("created_at", { ascending: false }).limit(2000),
    db.from("checkins").select("team_id, created_at").in("team_id", ids).gte("created_at", weekAgo).limit(2000),
    db.from("team_meetings").select("id, team_id, title, held_at").eq("status", "proposed").in("team_id", ids),
    db.from("notifications").select("user_id, created_at").eq("type", "team.inactive").gte("created_at", warnWindow),
    db.from("notifications").select("user_id, created_at").eq("type", "team.removed").gte("created_at", weekAgo),
    db.from("deliverables").select("id, standin_member_id").not("standin_member_id", "is", null).gte("submitted_at", weekAgo),
  ]);

  const last = new Map<string, string>();
  for (const r of [...(messages.data ?? []), ...(checkins.data ?? [])]) {
    if ((last.get(r.team_id) ?? "") < r.created_at) last.set(r.team_id, r.created_at);
  }
  const due = new Map((projects.data ?? []).map((p) => [p.team_id, p.due_at as string]));
  const proposals = new Map<string, number>();
  for (const m of meetings.data ?? []) proposals.set(m.team_id, (proposals.get(m.team_id) ?? 0) + 1);

  const rows: SquadRow[] = (teams ?? []).map((t) => {
    const ms = (members.data ?? []).filter((m) => m.team_id === t.id);
    return {
      team_id: t.id,
      name: t.name,
      level: t.current_level,
      real_members: ms.filter((m) => !m.is_standin && m.user_id).length,
      standins: ms.filter((m) => m.is_standin).length,
      due_at: due.get(t.id) ?? null,
      last_activity_at: last.get(t.id) ?? null,
      pending_proposals: proposals.get(t.id) ?? 0,
    };
  });

  // Warned people who are still in a squad: removed next if they stay quiet.
  const activeByUser = new Map((members.data ?? []).filter((m) => m.user_id).map((m) => [m.user_id as string, m]));
  const atRiskIds = [...new Set((warned.data ?? []).map((w) => w.user_id))].filter((u) => activeByUser.has(u));
  const removedIds = [...new Set((removed.data ?? []).map((r) => r.user_id))];
  const peopleIds = [...new Set([...atRiskIds, ...removedIds])];
  const { data: people } = peopleIds.length ? await db.from("profiles").select("id, full_name, role_id").in("id", peopleIds) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, p]));
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const warnedAt = new Map((warned.data ?? []).map((w) => [w.user_id, w.created_at]));
  const removedAt = new Map((removed.data ?? []).map((r) => [r.user_id, r.created_at]));

  const bucket = (n: number) => (n >= 3 ? "3+" : String(n));
  const byReal: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3+": 0 };
  for (const r of rows) byReal[bucket(r.real_members)]++;

  return {
    summary: {
      active_squads: rows.length,
      mostly_ai: rows.filter((r) => r.standins > r.real_members).length,
      at_risk: atRiskIds.length,
      removed_this_week: removedIds.length,
      standin_deliverables_this_week: (standinWork.data ?? []).length,
      pending_proposals: (meetings.data ?? []).length,
      squads_by_real_members: byReal,
    },
    squads: rows.sort((a, b) => a.real_members - b.real_members),
    at_risk: atRiskIds.map((u) => ({
      user_id: u,
      name: name.get(u)?.full_name ?? "Unknown",
      role_id: name.get(u)?.role_id ?? null,
      team: teamName.get(activeByUser.get(u)!.team_id) ?? null,
      warned_at: warnedAt.get(u)!,
    })),
    removed: removedIds.map((u) => ({ user_id: u, name: name.get(u)?.full_name ?? "Unknown", role_id: name.get(u)?.role_id ?? null, removed_at: removedAt.get(u)! })),
    proposals: (meetings.data ?? []).map((m) => ({ id: m.id, team: teamName.get(m.team_id) ?? null, title: m.title, held_at: m.held_at })),
  };
}
