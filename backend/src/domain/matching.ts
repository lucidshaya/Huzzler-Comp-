import { MAX_TEAM_SIZE } from "./constants.js";

export type Candidate = {
  userId: string;
  roleId: string;
  archetypeId: string;
  hoursPerWeek: number;
  tzBand: string;      // e.g. "UTC+1"
  scoreBand: number;   // onboarding weighted score / 10, floored
  waitingSince: Date;
};

export type SquadTemplate = { required: Record<string, number>; optional: string[]; max_size?: number };

export type FormedTeam = { archetypeId: string; members: Candidate[]; missingRoles: string[] };

/** Distance between two candidates: keep skill levels, time zones and availability close. */
export function distance(a: Candidate, b: Candidate): number {
  return Math.abs(a.scoreBand - b.scoreBand) * 3 + (a.tzBand === b.tzBand ? 0 : 2) + Math.abs(a.hoursPerWeek - b.hoursPerWeek) / 5;
}

/**
 * Greedy squad formation for one archetype. Seeds each team with the longest-waiting candidate,
 * fills required slots with the closest compatible candidates, then one of each optional role.
 * When `allowStandins` is set (someone has waited past the stand-in threshold) a team may start
 * with gaps, which the caller fills with scripted stand-ins.
 */
export function formTeams(
  pool: Candidate[],
  template: SquadTemplate,
  compatible: Set<string>,
  opts: { allowStandins?: (seed: Candidate) => boolean; minRealMembers?: number } = {},
): FormedTeam[] {
  const maxSize = Math.min(template.max_size ?? MAX_TEAM_SIZE, MAX_TEAM_SIZE);
  const remaining = pool
    .filter((c) => compatible.has(c.roleId))
    .sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime());
  const teams: FormedTeam[] = [];

  let seedIdx = 0;
  while (seedIdx < remaining.length) {
    const seed = remaining[seedIdx];
    const members: Candidate[] = [seed];
    const taken = new Set([seed.userId]);
    const need = { ...template.required };
    if (need[seed.roleId]) need[seed.roleId]--;

    const pick = (role: string) => {
      const best = remaining
        .filter((c) => !taken.has(c.userId) && c.roleId === role)
        .sort((a, b) => distance(seed, a) - distance(seed, b))[0];
      if (best) {
        members.push(best);
        taken.add(best.userId);
      }
      return best;
    };

    const missing: string[] = [];
    for (const [role, count] of Object.entries(need)) {
      for (let i = 0; i < count; i++) if (!pick(role)) missing.push(role);
    }

    const isOptionalSeed = !(seed.roleId in template.required);
    const usedOptional = new Set(isOptionalSeed ? [seed.roleId] : []);
    for (const role of template.optional) {
      if (members.length + missing.length >= maxSize) break;
      if (usedOptional.has(role)) continue;
      if (pick(role)) usedOptional.add(role);
    }

    const minReal = opts.minRealMembers ?? 2;
    const canStart = missing.length === 0 || (opts.allowStandins?.(seed) && members.length >= minReal);
    if (canStart) {
      teams.push({ archetypeId: seed.archetypeId, members, missingRoles: missing });
      for (const m of members) remaining.splice(remaining.findIndex((c) => c.userId === m.userId), 1);
      seedIdx = 0;
    } else {
      // This seed can't start a team yet; try the next-longest-waiting candidate as a seed.
      seedIdx++;
    }
  }
  return teams;
}

export const tzBandOf = (timezone: string | null | undefined, now = new Date()): string => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone ?? "Africa/Lagos", timeZoneName: "shortOffset" }).formatToParts(now);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  } catch {
    return "GMT+1";
  }
};
