import { db, must, ok } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { notify } from "../lib/notify.js";
import { render } from "../lib/templates.js";
import { distance, formTeams, tzBandOf, type Candidate, type FormedTeam, type SquadTemplate } from "../domain/matching.js";
import { chooseOpenSeat, chooseSquad, type AiDecision, type PersonSummary } from "../ai/matching.js";
import { STANDIN_AFTER_HOURS, ARCHETYPE_IDS, MAX_TEAM_SIZE } from "../domain/constants.js";
import { projectStatus } from "../domain/journey.js";
import { TEAM_WELCOME, STANDIN_REPLIES } from "../content/templates.js";
import { getJourney, transition } from "./journey.js";
import { addRoleTasks, startProject } from "./projects.js";
import { recordDecision } from "../lib/decisions.js";

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

/** Names and onboarding scores for the people the AI matcher is choosing between. */
async function summaries(cands: Candidate[], seed: Candidate, names: Map<string, string>): Promise<Map<string, PersonSummary>> {
  const ids = [...new Set(cands.map((c) => c.userId))];
  const [{ data: profiles }, { data: results }] = await Promise.all([
    db.from("profiles").select("id, full_name").in("id", ids),
    db.from("test_results").select("user_id, weighted_score").in("user_id", ids).eq("passed", true),
  ]);
  const pn = new Map((profiles ?? []).map((p) => [p.id, (p.full_name ?? "Unnamed").split(" ").slice(0, 2).join(" ")]));
  const sc = new Map((results ?? []).map((r) => [r.user_id, Math.round(Number(r.weighted_score))]));
  return new Map(
    cands.map((c) => [
      c.userId,
      {
        user_id: c.userId,
        name: pn.get(c.userId) ?? "Unnamed",
        role: names.get(c.roleId) ?? c.roleId,
        onboarding_score: sc.get(c.userId) ?? null,
        timezone: c.tzBand,
        hours_per_week: c.hoursPerWeek,
        waiting_days: Math.floor((Date.now() - c.waitingSince.getTime()) / 86_400_000),
        distance: Math.round(distance(seed, c) * 10) / 10,
      },
    ]),
  );
}

/**
 * Lets the AI choose between valid alternatives for each seat of a squad the rules engine formed.
 * The seed (longest waiting) stays; each other seat may swap to one of the two next-closest people
 * for the same role who aren't placed in another squad this round. Returns the (possibly changed)
 * members and the AI's reasoning, or the original squad when there's nothing to choose or no AI.
 */
async function aiReviewSquad(archetype: string, t: FormedTeam, pool: Candidate[], taken: Set<string>, names: Map<string, string>): Promise<{ members: Candidate[]; decision?: AiDecision }> {
  const [seed, ...rest] = t.members;
  if (!rest.length) return { members: t.members };
  const seats = rest.map((m, i) => {
    const alternatives = pool
      .filter((c) => c.roleId === m.roleId && c.userId !== m.userId && !taken.has(c.userId))
      .sort((a, b) => distance(seed, a) - distance(seed, b))
      .slice(0, 2);
    return { seat: `S${i + 1}`, member: m, options: [m, ...alternatives] };
  });
  if (!seats.some((s) => s.options.length > 1)) return { members: t.members };
  const people = await summaries([seed, ...seats.flatMap((s) => s.options)], seed, names);
  const choice = await chooseSquad({
    archetype,
    seed: people.get(seed.userId)!,
    seats: seats.map((s) => ({ seat: s.seat, role: names.get(s.member.roleId) ?? s.member.roleId, options: s.options.map((o) => people.get(o.userId)!) })),
  });
  if (!choice) return { members: t.members };
  const members = [seed, ...seats.map((s) => s.options.find((o) => o.userId === choice.picks.get(s.seat)) ?? s.member)];
  for (const s of seats) {
    const picked = choice.picks.get(s.seat);
    if (picked && picked !== s.member.userId) {
      taken.delete(s.member.userId); // back in the pool for a later squad
      taken.add(picked);
    }
  }
  return { members, decision: choice.decision };
}

/** Squad matching: the rules engine forms valid squads; the AI (when the key is set) chooses between valid alternatives. Run on accept and on a schedule. */
export async function runMatching() {
  // Real people before stand-ins: seat anyone placed without a squad, merge squads that each have a
  // single real person, then fill stand-in seats with people who are waiting.
  await consolidateSquads();
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
    const taken = new Set(teams.flatMap((t) => t.members.map((m) => m.userId)));
    for (const t of teams) {
      const reviewed = await aiReviewSquad(archetype, t, candidates, taken, names);
      await createTeam(archetype, reviewed.members, t.missingRoles, names, reviewed.decision);
      formed++;
    }
  }
  return formed;
}

export async function createTeam(archetypeId: string, members: Candidate[], missingRoles: string[], names: Map<string, string>, ai?: AiDecision) {
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
    // Every row carries the same keys: a bulk insert sends null for any key missing from a row.
    ...members.map((m) => ({ team_id: team.id, user_id: m.userId, role_id: m.roleId, is_standin: false, standin_name: null })),
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
  const seed = members[0];
  await recordDecision({
    kind: "squad_matching",
    engine: ai ? "ai" : "rules",
    model: ai?.model ?? null,
    latencyMs: ai?.latencyMs ?? null,
    teamId: team.id,
    subjectType: "team",
    subjectId: team.id,
    summary: `${ai ? `${ai.summary} ` : ""}Formed ${team.name}: ${members.length} ${members.length === 1 ? "person" : "people"}${missingRoles.length ? ` + ${missingRoles.length} stand-in${missingRoles.length === 1 ? "" : "s"}` : ""} for ${persona!.name} (${archetypeId}).`,
    reasoning: [
      ...(ai?.reasoning ?? []),
      { label: "Seed", detail: `${pname.get(seed.userId)} (${names.get(seed.roleId)}) has waited longest, since ${seed.waitingSince.toISOString().slice(0, 10)}, so the squad is built around them.` },
      ...members.slice(1).map((m) => ({
        label: `${names.get(m.roleId)}`,
        detail: `${pname.get(m.userId)}: score band ${m.scoreBand * 10}s vs seed ${seed.scoreBand * 10}s, ${m.tzBand === seed.tzBand ? "same time zone" : `time zone ${m.tzBand}`}, ${m.hoursPerWeek} h/week.`,
        weight: Math.round((Math.abs(m.scoreBand - seed.scoreBand) * 3 + (m.tzBand === seed.tzBand ? 0 : 2) + Math.abs(m.hoursPerWeek - seed.hoursPerWeek) / 5) * 10) / 10,
      })),
      ...(missingRoles.length ? [{ label: "Stand-ins", detail: `No one was waiting for ${missingRoles.map((r) => names.get(r)).join(", ")}; clearly labelled stand-ins cover those seats until a real person is matched.` }] : []),
    ],
    confidence: ai?.confidence ?? Math.max(0.4, 1 - missingRoles.length * 0.12),
  });
  logger.info({ teamId: team.id, size: members.length, standins: missingRoles.length, engine: ai ? "ai" : "rules" }, "team formed");
  return team as { id: string; name: string };
}

type Seat = { id: string; team_id: string; role_id: string; teams: { archetype_id: string; score_band: number | null; current_level: number; status: string } | null };

/** Puts a waiting candidate into a stand-in's seat and hands over the stand-in's open tasks. */
async function fillSeat(seat: Seat, cand: Candidate) {
  await db.from("team_members").update({ status: "replaced", left_at: new Date().toISOString() }).eq("id", seat.id);
  const member = must(await db.from("team_members").insert({ team_id: seat.team_id, user_id: cand.userId, role_id: seat.role_id }).select().single(), "member");
  await db.from("team_tasks").update({ assignee_id: cand.userId, assignee_member_id: member.id }).eq("assignee_member_id", seat.id).neq("status", "done");
  await transition(cand.userId, "PLACED", "backfilled stand-in seat");
  if ((seat.teams?.current_level ?? 0) >= 1) await transition(cand.userId, projectStatus(seat.teams!.current_level), "joined mid-project");
  await postSystemMessage(seat.team_id, `🎉 A real teammate has joined and is taking over the stand-in's seat. Say hello!`);
  await notify(cand.userId, "team.placed", "You've been placed on a team", "You're joining a team that has already started. Check the board for your tasks.");
  await recordDecision({
    kind: "squad_matching",
    engine: "rules",
    userId: cand.userId,
    teamId: seat.team_id,
    subjectType: "team",
    subjectId: seat.team_id,
    summary: `Moved a waiting ${seat.role_id.replace(/_/g, " ")} into a stand-in seat on an active squad.`,
    reasoning: [
      { label: "Open seat", detail: `The squad had a stand-in covering ${seat.role_id.replace(/_/g, " ")}; real people always replace stand-ins, and squads with real people are filled first.` },
      {
        label: "Fit",
        detail: `${seat.teams?.archetype_id === cand.archetypeId ? "Same company type" : `Joins real teammates on a ${seat.teams?.archetype_id ?? "different"} project (accepted ${cand.archetypeId})`}; score band ${cand.scoreBand * 10}s vs squad ${(seat.teams?.score_band ?? 7) * 10}s.`,
      },
    ],
    confidence: 0.8,
  });
}

const openSeatsQuery = () =>
  db.from("team_members").select("id, team_id, role_id, teams:team_id(archetype_id, score_band, current_level, status)").eq("is_standin", true).eq("status", "active");

/**
 * Replace stand-ins with real people. Squads that already have real people come first (so real
 * people are paired with each other), then the same company type, then the closest score band.
 */
export async function backfillStandins() {
  const pool = await loadPool();
  let filled = 0;
  for (const cand of pool.sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime())) {
    const seat = await bestSeat(cand.roleId, { archetypeId: cand.archetypeId, scoreBand: cand.scoreBand });
    if (!seat) continue;
    await fillSeat(seat, cand);
    filled++;
  }
  return filled;
}

/** Active real (non-stand-in) members per active team. */
async function realCounts() {
  const { data } = await db.from("team_members").select("team_id").eq("status", "active").eq("is_standin", false);
  const counts = new Map<string, number>();
  for (const m of data ?? []) counts.set(m.team_id, (counts.get(m.team_id) ?? 0) + 1);
  return counts;
}

/**
 * The best stand-in seat for a role: on a squad with the most real people (never an all-stand-in
 * squad), preferring the same company type, the given project level, and the closest score band.
 */
async function bestSeat(roleId: string, prefer: { archetypeId?: string; level?: number; scoreBand?: number; excludeTeam?: string }) {
  const [{ data: seats }, counts] = await Promise.all([openSeatsQuery().eq("role_id", roleId), realCounts()]);
  const options = ((seats ?? []) as unknown as Seat[]).filter(
    (x) => x.teams?.status === "active" && x.team_id !== prefer.excludeTeam && (counts.get(x.team_id) ?? 0) > 0 && (prefer.level === undefined || x.teams.current_level === prefer.level),
  );
  const rank = (x: Seat) => [
    -(counts.get(x.team_id) ?? 0),
    x.teams!.archetype_id === prefer.archetypeId ? 0 : 1,
    prefer.scoreBand === undefined ? 0 : Math.abs((x.teams!.score_band ?? 7) - prefer.scoreBand),
  ];
  return options.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  })[0];
}

/** Moves an already-placed person into a stand-in seat on another squad (same project level). */
async function moveIntoSeat(seat: Seat, userId: string, fromTeam: string | null, why: string) {
  if (fromTeam) {
    await db.from("team_members").update({ status: "left", left_at: new Date().toISOString() }).eq("team_id", fromTeam).eq("user_id", userId).eq("status", "active");
  }
  await db.from("team_members").update({ status: "replaced", left_at: new Date().toISOString() }).eq("id", seat.id);
  const member = must(await db.from("team_members").insert({ team_id: seat.team_id, user_id: userId, role_id: seat.role_id }).select().single(), "member");
  await db.from("team_tasks").update({ assignee_id: userId, assignee_member_id: member.id }).eq("assignee_member_id", seat.id).neq("status", "done");
  await postSystemMessage(seat.team_id, `🎉 A real teammate has joined and is taking over the stand-in's seat. Say hello!`);
  await notify(userId, "team.placed", "You've got real teammates", "We've moved you into a squad with other real people. Your new board and team chat are in Team workspace.");
  await recordDecision({
    kind: "squad_matching",
    engine: "rules",
    userId,
    teamId: seat.team_id,
    subjectType: "team",
    subjectId: seat.team_id,
    summary: `Moved a ${seat.role_id.replace(/_/g, " ")} into a stand-in seat so real people work together.`,
    reasoning: [
      { label: "Why", detail: why },
      { label: "Rule", detail: "Real people are paired with real people first; stand-ins only cover seats nobody can fill yet." },
    ],
    confidence: 0.85,
  });
}

/** Closes a squad nobody real is left in (its stand-ins and open project go with it). */
async function disbandIfEmpty(teamId: string) {
  const counts = await realCounts();
  if ((counts.get(teamId) ?? 0) > 0) return;
  await db.from("teams").update({ status: "disbanded" }).eq("id", teamId).eq("status", "active");
  await db.from("team_members").update({ status: "left", left_at: new Date().toISOString() }).eq("team_id", teamId).eq("status", "active");
  await db.from("project_instances").update({ status: "completed" }).eq("team_id", teamId).eq("status", "active");
  logger.info({ teamId }, "squad disbanded after its real member moved");
}

const PLACED_STATES = ["PLACED", "PROJECT_1", "PROJECT_2", "PROJECT_3", "PROJECT_4", "PROJECT_5"];
const levelOf = (status: string) => (status.startsWith("PROJECT_") ? Number(status.slice(8)) : 0);

/**
 * Pairs real people together:
 * 1. Anyone placed (journey PLACED / PROJECT_n) without an active squad gets a stand-in seat for
 *    their role on a squad with real people at their project level.
 * 2. A squad with a single real person merges into another squad with real people at the same
 *    project level, if it has a stand-in seat for that role; the emptied squad is disbanded.
 */
export async function consolidateSquads() {
  let moved = 0;
  const { data: placed } = await db.from("user_journey").select("user_id, status").in("status", PLACED_STATES);
  const { data: active } = await db.from("team_members").select("user_id, team_id, role_id, joined_at").eq("status", "active").eq("is_standin", false);
  const teamOf = new Map((active ?? []).map((m) => [m.user_id, m]));

  // 1. Orphans.
  const orphans = (placed ?? []).filter((j) => !teamOf.has(j.user_id));
  if (orphans.length) {
    const { data: profs } = await db.from("profiles").select("id, role_id").in("id", orphans.map((o) => o.user_id));
    const roleOf = new Map((profs ?? []).map((p) => [p.id, p.role_id as string | null]));
    for (const o of orphans) {
      const role = roleOf.get(o.user_id);
      if (!role) continue;
      const seat = await bestSeat(role, { level: Math.max(1, levelOf(o.status)) });
      if (!seat) continue;
      await moveIntoSeat(seat, o.user_id, null, "They were placed but had no active squad.");
      moved++;
    }
  }

  // 2. Solo squads: merge the newer one into the older one.
  const { data: teams } = await db.from("teams").select("id, current_level, created_at, archetype_id").eq("status", "active").order("created_at");
  for (const t of (teams ?? []).slice().reverse()) {
    const counts = await realCounts();
    if ((counts.get(t.id) ?? 0) !== 1) continue;
    const solo = (await db.from("team_members").select("user_id, role_id").eq("team_id", t.id).eq("status", "active").eq("is_standin", false).single()).data;
    if (!solo?.user_id) continue;
    const seat = await bestSeat(solo.role_id, { level: t.current_level, archetypeId: t.archetype_id, excludeTeam: t.id });
    if (!seat || !seat.teams || seat.teams.current_level !== t.current_level) continue;
    await moveIntoSeat(seat, solo.user_id, t.id, "They were the only real person in their squad; this squad already has real people at the same project.");
    await disbandIfEmpty(t.id);
    moved++;
  }
  if (moved) logger.info({ moved }, "squads consolidated");
  return moved;
}

const activeTeamOf = async (userId: string) =>
  (await db.from("team_members").select("team_id").eq("user_id", userId).eq("status", "active").maybeSingle()).data?.team_id ?? null;

/**
 * Places someone who has just accepted an offer onto a squad straight away, so accepting takes them
 * to their team workspace: an open stand-in seat for their role first, then normal matching, then a
 * new squad that starts with stand-ins in the empty seats (replaced by real people as they arrive).
 */
export async function placeNow(userId: string): Promise<string | null> {
  const existing = await activeTeamOf(userId);
  if (existing) return existing;
  const pool = await loadPool();
  const me = pool.find((c) => c.userId === userId);
  if (!me) return null;

  // A stand-in seat on a squad that already has real people comes first, whatever the company type.
  const seat = await bestSeat(me.roleId, { archetypeId: me.archetypeId, scoreBand: me.scoreBand });
  if (seat) {
    await fillSeat(seat, me);
    return seat.team_id;
  }

  await runMatching();
  const matched = await activeTeamOf(userId);
  if (matched) return matched;

  const { data: tpl } = await db.from("squad_templates").select("template").eq("archetype_id", me.archetypeId).eq("active", true).order("version", { ascending: false }).limit(1).maybeSingle();
  if (!tpl) return null;
  const joined = await joinOpenSeat(me, tpl.template as SquadTemplate);
  if (joined) return joined;
  const { data: compat } = await db.from("role_archetype_compatibility").select("role_id").eq("archetype_id", me.archetypeId);
  const others = (await loadPool()).filter((c) => c.archetypeId === me.archetypeId && c.userId !== userId);
  const formed = formTeams([{ ...me, waitingSince: new Date(0) }, ...others], tpl.template as SquadTemplate, new Set((compat ?? []).map((c) => c.role_id)), {
    allowStandins: () => true,
    minRealMembers: 1,
  }).find((t) => t.members.some((m) => m.userId === userId));
  if (!formed) return null;
  const team = await createTeam(me.archetypeId, formed.members, formed.missingRoles, await roleNames());
  return team.id;
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

/**
 * Puts a new arrival into an early-stage squad of their company type that has room for their role
 * (an optional role nobody holds yet), so people who accept close together end up as teammates.
 */
async function joinOpenSeat(me: Candidate, template: SquadTemplate): Promise<string | null> {
  const maxSize = Math.min(template.max_size ?? MAX_TEAM_SIZE, MAX_TEAM_SIZE);
  if (!template.optional.includes(me.roleId)) return null;
  const { data: teams } = await db
    .from("teams")
    .select("id, name, score_band, current_level, members:team_members(id, user_id, role_id, is_standin, status)")
    .eq("archetype_id", me.archetypeId)
    .eq("status", "active")
    .lte("current_level", 1);
  const open = ((teams ?? []) as any[])
    .map((t) => ({ ...t, members: (t.members ?? []).filter((m: any) => m.status === "active") }))
    .filter((t) => t.members.length < maxSize && !t.members.some((m: any) => m.role_id === me.roleId))
    .sort((a, b) => Math.abs((a.score_band ?? 7) - me.scoreBand) - Math.abs((b.score_band ?? 7) - me.scoreBand) || b.members.filter((m: any) => !m.is_standin).length - a.members.filter((m: any) => !m.is_standin).length);
  if (!open[0]) return null;
  const names0 = await roleNames();
  const person = (await summaries([me], me, names0)).get(me.userId)!;
  const ai = await chooseOpenSeat(
    person,
    open.slice(0, 3).map((t: any) => ({
      id: t.id,
      name: t.name,
      description: `score band ${(t.score_band ?? 7) * 10}s, ${t.members.filter((m: any) => !m.is_standin).length} real members, ${t.members.length}/${maxSize} seats, project ${Math.max(1, t.current_level)}`,
    })),
  );
  const team = (ai && open.find((t: any) => t.id === ai.teamId)) || open[0];
  const member = must(await db.from("team_members").insert({ team_id: team.id, user_id: me.userId, role_id: me.roleId }).select().single(), "member");
  await transition(me.userId, "PLACED", `joined ${team.name}`);
  if (team.current_level >= 1) await transition(me.userId, projectStatus(team.current_level), "joined mid-project");
  const tasks = await addRoleTasks(team.id, member.id, me.userId, me.roleId);
  const names = await roleNames();
  await postSystemMessage(team.id, `🎉 A ${names.get(me.roleId) ?? "new"} has joined the squad${tasks ? ` and picked up ${tasks} task${tasks === 1 ? "" : "s"}` : ""}. Say hello!`);
  await notify(me.userId, "team.placed", "You've been placed on a team", `Welcome to ${team.name}. Your tasks are on the board.`);
  await recordDecision({
    kind: "squad_matching",
    engine: ai ? "ai" : "rules",
    model: ai?.decision.model ?? null,
    latencyMs: ai?.decision.latencyMs ?? null,
    userId: me.userId,
    teamId: team.id,
    subjectType: "team",
    subjectId: team.id,
    summary: `Added a ${names.get(me.roleId)} to ${team.name}, which had an open seat for that role.`,
    reasoning: [
      ...(ai?.decision.reasoning ?? []),
      { label: "Open seat", detail: `${names.get(me.roleId)} is an optional role for ${me.archetypeId} squads and nobody on ${team.name} holds it yet (${team.members.length}/${maxSize} seats used).` },
      { label: "Fit", detail: `Score band ${me.scoreBand * 10}s vs squad ${(team.score_band ?? 7) * 10}s; the squad is still on project ${Math.max(1, team.current_level)}.` },
    ],
    confidence: ai?.decision.confidence ?? 0.75,
  });
  return team.id;
}
