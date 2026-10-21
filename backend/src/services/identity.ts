import { db } from "../lib/supabase.js";

// Identity portfolio (Frontend design: trophy room + contribution heatmap), built from what the
// person actually did on Huzzler. Nothing here can be unlocked by clicking a button.

export type Badge = {
  id: string;
  title: string;
  category: "Verified role" | "Project milestone" | "Streak" | "Workstation" | "Team";
  description: string;
  rarity: "Common" | "Rare" | "Epic";
  xp: number;
  unlocked: boolean;
  unlocked_at: string | null;
  progress?: { value: number; target: number };
};

export type HeatDay = { count: number; tasks: number; standups: number; chat: number; workstation: number; tests: number };

const WEEKS = 26;
const day = (iso: string) => iso.slice(0, 10);

export function longestStreak(dates: string[]) {
  const days = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of days) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = prev !== null && t - prev === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

export async function identity(userId: string) {
  const since = new Date(Date.now() - WEEKS * 7 * 86_400_000).toISOString();
  const [results, checkins, projects, runs, reviews, cert, deliverables, messages, tests, roles] = await Promise.all([
    db.from("test_results").select("passed, weighted_score, created_at, attempt:attempt_id(role_id)").eq("user_id", userId).eq("passed", true),
    db.from("checkins").select("checkin_date, created_at").eq("user_id", userId),
    db.from("project_results").select("passed, total, created_at").eq("user_id", userId).order("created_at"),
    db.from("workstation_runs").select("created_at").eq("user_id", userId),
    db.from("peer_reviews").select("created_at").eq("reviewer_id", userId),
    db.from("certifications").select("issued_at").eq("user_id", userId).eq("status", "valid").maybeSingle(),
    db.from("deliverables").select("submitted_at, score").eq("user_id", userId),
    db.from("messages").select("created_at").eq("user_id", userId).gte("created_at", since).limit(2000),
    db.from("test_submissions").select("submitted_at").eq("user_id", userId).not("submitted_at", "is", null),
    db.from("roles").select("id, name"),
  ]);
  const roleName = new Map((roles.data ?? []).map((r) => [r.id, r.name]));

  const badges: Badge[] = [];
  const verified = (results.data ?? []) as any[];
  const verifiedRoles = [...new Set(verified.map((r) => r.attempt?.role_id).filter(Boolean))];
  for (const roleId of verifiedRoles.length ? verifiedRoles : [null]) {
    const r = verified.find((x) => x.attempt?.role_id === roleId);
    badges.push({
      id: `verified-${roleId ?? "role"}`,
      title: `Verified ${roleId ? roleName.get(roleId) : "Builder"}`,
      category: "Verified role",
      description: "Passed all five onboarding tests with a weighted score of 70% or more.",
      rarity: "Epic",
      xp: 250,
      unlocked: Boolean(r),
      unlocked_at: r?.created_at ?? null,
    });
  }

  const checkinDays = (checkins.data ?? []).map((c) => c.checkin_date as string);
  const streak = longestStreak(checkinDays);
  badges.push(
    { id: "streak-3", title: "3-Day Stand-up Streak", category: "Streak", description: "Posted your stand-up three days in a row.", rarity: "Common", xp: 50, unlocked: streak >= 3, unlocked_at: null, progress: { value: Math.min(streak, 3), target: 3 } },
    { id: "streak-7", title: "7-Day Shipping Flame", category: "Streak", description: "Posted your stand-up seven days in a row.", rarity: "Rare", xp: 150, unlocked: streak >= 7, unlocked_at: null, progress: { value: Math.min(streak, 7), target: 7 } },
  );

  const passed = (projects.data ?? []).filter((p) => p.passed);
  const milestone = (n: number, id: string, title: string, rarity: Badge["rarity"], xp: number, description: string): Badge => ({
    id, title, category: "Project milestone", description, rarity, xp, unlocked: passed.length >= n, unlocked_at: passed[n - 1]?.created_at ?? null, progress: { value: Math.min(passed.length, n), target: n },
  });
  badges.push(
    milestone(1, "project-1", "First Squad Project", "Rare", 300, "Passed your first squad project."),
    milestone(3, "project-3", "Halfway There", "Rare", 300, "Passed three squad projects."),
    milestone(5, "project-5", "Capstone Shipped", "Epic", 500, "Passed all five projects, including the capstone."),
  );

  const topScore = Math.max(0, ...(deliverables.data ?? []).map((d) => Number(d.score ?? 0)));
  badges.push(
    { id: "high-bar", title: "High Bar", category: "Project milestone", description: "A deliverable graded 85 or higher.", rarity: "Rare", xp: 150, unlocked: topScore >= 85, unlocked_at: null },
    { id: "workstation", title: "Workstation Power User", category: "Workstation", description: "Ran 10 or more Workstation AI tools.", rarity: "Common", xp: 100, unlocked: (runs.data ?? []).length >= 10, unlocked_at: null, progress: { value: Math.min((runs.data ?? []).length, 10), target: 10 } },
    { id: "team-player", title: "Team Player", category: "Team", description: "Wrote four or more peer reviews for teammates.", rarity: "Common", xp: 100, unlocked: (reviews.data ?? []).length >= 4, unlocked_at: null, progress: { value: Math.min((reviews.data ?? []).length, 4), target: 4 } },
    { id: "certified", title: "Huzzler Certified", category: "Project milestone", description: "Earned the verifiable Huzzler certificate.", rarity: "Epic", xp: 500, unlocked: Boolean(cert.data), unlocked_at: cert.data?.issued_at ?? null },
  );

  const heat: Record<string, HeatDay> = {};
  const bump = (iso: string | null | undefined, key: keyof Omit<HeatDay, "count">) => {
    if (!iso || iso < since) return;
    const d = day(iso);
    heat[d] ??= { count: 0, tasks: 0, standups: 0, chat: 0, workstation: 0, tests: 0 };
    heat[d][key]++;
    heat[d].count++;
  };
  for (const d of deliverables.data ?? []) bump(d.submitted_at, "tasks");
  for (const c of checkins.data ?? []) bump(c.created_at, "standups");
  for (const m of messages.data ?? []) bump(m.created_at, "chat");
  for (const r of runs.data ?? []) bump(r.created_at, "workstation");
  for (const t of tests.data ?? []) bump(t.submitted_at, "tests");

  return {
    badges,
    xp: badges.filter((b) => b.unlocked).reduce((s, b) => s + b.xp, 0),
    streak,
    weeks: WEEKS,
    heatmap: heat,
  };
}
