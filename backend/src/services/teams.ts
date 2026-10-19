import { db, must, ok } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { notify } from "../lib/notify.js";
import { render } from "../lib/templates.js";
import { formTeams, tzBandOf, type Candidate, type SquadTemplate } from "../domain/matching.js";
import { STANDIN_AFTER_HOURS, ARCHETYPE_IDS } from "../domain/constants.js";
import { projectStatus } from "../domain/journey.js";
import { TEAM_WELCOME, STANDIN_REPLIES } from "../content/templates.js";
import { getJourney, transition } from "./journey.js";
import { startProject } from "./projects.js";

export async function roleNames(): Promise<Map<string, string>> {
  const { data } = await db.from("roles").select("id, name");
  return new Map((data ?? []).map((r) => [r.id, r.name]));
}

export async function postSystemMessage(teamId: string, body: string, kind: "system" | "standin" = "system", authorLabel = "Huzzler") {
  await db.from("messages").insert({ team_id: teamId, kind, author_label: authorLabel, body });
}

/** Candidates: accepted an offer, still OFFER_PENDING, not on an active team. */
export async function loadPool(): Promise<Candidate[]> {
  const { data: offers } = await db.from("offers").select("user_id, archetype_id, role_id, responded_at").eq("status", "accepted");
  if (!offers?.length) return [];
  const ids = offers.map((o) => o.user_id);
  const [{ data: journeys }, { data: active }, { data: profiles }, { data: results }] = await Promise.all([
    db.from("user_journey").select("user_id, status").in("user_id", ids),
    db.from("team_members").select("user_id").in("user_id", ids).eq("status", "active"),
    db.from("profiles").select("id, hours_per_week, timezone").in("id", ids),
    db.from("test_results").select("user_id, weighted_score, passed").in("user_id", ids).eq("passed", true),
  ]);
  const pending = new Set((journeys ?? []).filter((j) => j.status === "OFFER_PENDING").map((j) => j.user_id));
  const placed = new Set((active ?? []).map((a) => a.user_id));
  const prof = new Map((profiles ?? []).map((p) => [p.id, p]));
  const score = new Map((results ?? []).map((r) => [r.user_id, Number(r.weighted_score)]));
  return offers
    .filter((o) => pending.has(o.user_id) && !placed.has(o.user_id))
    .map((o) => ({
      userId: o.user_id,
      roleId: o.role_id,
      archetypeId: o.archetype_id,
      hoursPerWeek: prof.get(o.user_id)?.hours_per_week ?? 10,
      tzBand: tzBandOf(prof.get(o.user_id)?.timezone),
      scoreBand: Math.floor((score.get(o.user_id) ?? 70) / 10),
      waitingSince: new Date(o.responded_at ?? Date.now()),
    }));
}

/** Plain SQL + code squad matching (no AI). Run on accept and on a schedule. */
export async function runMatching() {
  // First fill stand-in seats on existing teams with real people.
  await backfillStandins();

  const pool = await loadPool();
  const names = await roleNames();
  let formed = 0;
  for (const archetype of ARCHETYPE_IDS) {
    const candidates = pool.filter((c) => c.archetypeId === archetype);
    if (!candidates.length) continue;
    const { data: tpl } = await db.from("squad_templates").select("template").eq("archetype_id", archetype).eq("active", true).order("version", { ascending: false }).limit(1).single();
    const { data: compat } = await db.from("role_archetype_compatibility").select("role_id").eq("archetype_id", archetype);
    const teams = formTeams(candidates, tpl!.template as SquadTemplate, new Set((compat ?? []).map((c) => c.role_id)), {
      allowStandins: (seed) => Date.now() - seed.waitingSince.getTime() > STANDIN_AFTER_HOURS * 3_600_000,
    });
    for (const t of teams) {
      await createTeam(archetype, t.members, t.missingRoles, names);
      formed++;
    }
  }
  return formed;
}

export async function createTeam(archetypeId: string, members: Candidate[], missingRoles: string[], names: Map<string, string>) {
  const { data: offer } = await db.from("offers").select("persona_id, cohort_id").eq("user_id", members[0].userId).eq("status", "accepted").single();
  const { data: persona } = await db.from("company_personas").select("name, mission").eq("id", offer!.persona_id).single();
  const band = members.reduce((s, m) => s + m.scoreBand, 0) / members.length;
  const team = must(
    await db
      .from("teams")
      .insert({ archetype_id: archetypeId, persona_id: offer!.persona_id, cohort_id: offer!.cohort_id, name: `${persona!.name} Squad`, status: "active", score_band: Math.round(band), timezone_band: members[0].tzBand })
      .select()
      .single(),
    "team",
  );
  const rows = [
    ...members.map((m) => ({ team_id: team.id, user_id: m.userId, role_id: m.roleId })),
    ...missingRoles.map((r) => ({ team_id: team.id, user_id: null, role_id: r, is_standin: true, standin_name: `Huzzler stand-in (${names.get(r)})` })),
  ];
  ok(await db.from("team_members").insert(rows), "team members");
  for (const m of members) await transition(m.userId, "PLACED", `placed on ${team.name}`);

  const instance = await startProject(team.id, 1);
  const { data: profiles } = await db.from("profiles").select("id, full_name").in("id", members.map((m) => m.userId));
  const pname = new Map((profiles ?? []).map((p) => [p.id, (p.full_name ?? "Teammate").split(" ")[0]]));
  const roster = [
    ...members.map((m) => `${pname.get(m.userId)} (${names.get(m.roleId)})`),
    ...missingRoles.map((r) => `Huzzler stand-in (${names.get(r)})`),
  ].join(", ");
  await postSystemMessage(
    team.id,
    render(TEAM_WELCOME, { team_name: team.name, company: persona!.name, mission: persona!.mission, roster, project_title: instance.title, due_date: new Date(instance.due_at).toDateString() }),
  );
  for (const m of members) await notify(m.userId, "team.placed", "You've been placed on a team", `Welcome to ${team.name}. Project 1 has started.`);
  logger.info({ teamId: team.id, size: members.length, standins: missingRoles.length }, "team formed");
  return team as { id: string; name: string };
}

/** Replace stand-ins with real people from the same archetype and nearby score band. */
export async function backfillStandins() {
  const { data: seats } = await db.from("team_members").select("id, team_id, role_id, teams:team_id(archetype_id, score_band, current_level, status)").eq("is_standin", true).eq("status", "active");
  if (!seats?.length) return 0;
  const pool = await loadPool();
  let filled = 0;
  for (const seat of seats as any[]) {
    if (seat.teams?.status !== "active") continue;
    const band = seat.teams.score_band ?? 7;
    const cand = pool
      .filter((c) => c.roleId === seat.role_id && c.archetypeId === seat.teams.archetype_id && Math.abs(c.scoreBand - band) <= 1)
      .sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime())[0];
    if (!cand) continue;
    pool.splice(pool.indexOf(cand), 1);
    await db.from("team_members").update({ status: "replaced", left_at: new Date().toISOString() }).eq("id", seat.id);
    const member = must(await db.from("team_members").insert({ team_id: seat.team_id, user_id: cand.userId, role_id: seat.role_id }).select().single(), "member");
    // Hand over the stand-in's open tasks.
    await db.from("team_tasks").update({ assignee_id: cand.userId, assignee_member_id: member.id }).eq("assignee_member_id", seat.id).neq("status", "done");
    await transition(cand.userId, "PLACED", "backfilled stand-in seat");
    if (seat.teams.current_level >= 1) await transition(cand.userId, projectStatus(seat.teams.current_level), "joined mid-project");
    await postSystemMessage(seat.team_id, `🎉 A real teammate has joined and is taking over the stand-in's seat. Say hello!`);
    await notify(cand.userId, "team.placed", "You've been placed on a team", "You're joining a team that has already started. Check the board for your tasks.");
    filled++;
  }
  return filled;
}

/**
 * Removes a member (inactivity, lapse, failing two projects). Their seat becomes a stand-in until a
 * real person from the same score band is matched. Progress is kept.
 */
export async function removeMember(userId: string, reason: string, opts: { journeyTo?: "OFFER_PENDING" | null } = {}) {
  const { data: m } = await db.from("team_members").select("*").eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!m) return;
  const names = await roleNames();
  await db.from("team_members").update({ status: reason === "lapsed" ? "lapsed" : "removed", left_at: new Date().toISOString() }).eq("id", m.id);
  const standin = must(
    await db.from("team_members").insert({ team_id: m.team_id, user_id: null, role_id: m.role_id, is_standin: true, standin_name: `Huzzler stand-in (${names.get(m.role_id)})` }).select().single(),
    "standin",
  );
  await db.from("team_tasks").update({ assignee_id: null, assignee_member_id: standin.id }).eq("assignee_member_id", m.id).neq("status", "done");
  await postSystemMessage(m.team_id, `A teammate (${names.get(m.role_id)}) has left the team. A Huzzler stand-in covers the role until a new teammate joins.`);
  if (opts.journeyTo) {
    // Back into the pool for a new cohort: their old offer is spent.
    await db.from("offers").update({ status: "superseded" }).eq("user_id", userId).eq("status", "accepted");
    const j = await getJourney(userId);
    if (j.status !== opts.journeyTo) await transition(userId, opts.journeyTo, reason);
  }
}

export async function maybeStandinReply(teamId: string, body: string) {
  const { data: standins } = await db.from("team_members").select("standin_name").eq("team_id", teamId).eq("is_standin", true).eq("status", "active");
  if (!standins?.length) return;
  const mentioned = standins.find((s) => s.standin_name && (body.toLowerCase().includes("stand-in") || body.includes("@standin")));
  if (!mentioned) return;
  const reply = STANDIN_REPLIES[Math.floor(Math.random() * STANDIN_REPLIES.length)];
  await postSystemMessage(teamId, reply, "standin", mentioned.standin_name!);
}

export async function myTeam(userId: string) {
  const { data: m } = await db.from("team_members").select("team_id, role_id").eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!m) return null;
  const [{ data: team }, { data: members }] = await Promise.all([
    db.from("teams").select("*, persona:persona_id(name, logo_url, mission, product_brief, culture)").eq("id", m.team_id).single(),
    db.from("team_members").select("id, user_id, role_id, is_standin, standin_name, joined_at, profile:user_id(full_name, username, avatar_url)").eq("team_id", m.team_id).eq("status", "active"),
  ]);
  return { team, members: members ?? [], myRole: m.role_id };
}

export async function assertTeamMember(userId: string, teamId: string) {
  const { data } = await db.from("team_members").select("id, role_id").eq("team_id", teamId).eq("user_id", userId).eq("status", "active").maybeSingle();
  return data;
}
