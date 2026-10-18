import {
  TEST_WEIGHTS, PASS_MARK, MIN_SINGLE_TEST, BORDERLINE_BAND, REVIEW_DISAGREEMENT,
  PROJECT_WEIGHTS, PROJECT_PASS_MARK,
} from "./constants.js";

export const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Rubric criteria weights -> overall score. The model scores criteria; the server totals them. */
export function weightedRubricScore(
  criteria: Record<string, { score: number }>,
  weights: Record<string, number>,
): number {
  let total = 0;
  let wsum = 0;
  for (const [id, w] of Object.entries(weights)) {
    const c = criteria[id];
    if (!c) continue;
    total += clamp(c.score) * w;
    wsum += w;
  }
  return wsum === 0 ? 0 : round2(total / wsum);
}

export type OnboardingOutcome = {
  weighted: number;
  passed: boolean;
  failedTests: number[];   // tests below PASS_MARK: retaken on attempt 2
  belowFloor: number[];    // tests below MIN_SINGLE_TEST
};

export function onboardingOutcome(scores: Record<number, number>): OnboardingOutcome {
  let weighted = 0;
  for (const [t, w] of Object.entries(TEST_WEIGHTS)) weighted += clamp(scores[Number(t)] ?? 0) * (w / 100);
  weighted = round2(weighted);
  const tests = Object.keys(TEST_WEIGHTS).map(Number);
  const belowFloor = tests.filter((t) => (scores[t] ?? 0) < MIN_SINGLE_TEST);
  const failedTests = tests.filter((t) => (scores[t] ?? 0) < PASS_MARK);
  return { weighted, passed: weighted >= PASS_MARK && belowFloor.length === 0, failedTests, belowFloor };
}

export const isBorderline = (score: number) => Math.abs(score - PASS_MARK) <= BORDERLINE_BAND;
export const gradingsDisagree = (a: number, b: number) => Math.abs(a - b) > REVIEW_DISAGREEMENT;

/** Peer ratings (1-5 per dimension) -> 0-100, trimming the highest and lowest reviewer when there are 4+. */
export function peerScore(reviews: Array<Record<string, number>>): number {
  if (reviews.length === 0) return 0;
  const perReviewer = reviews
    .map((r) => {
      const vals = Object.values(r).filter((v) => typeof v === "number");
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    })
    .sort((a, b) => a - b);
  const trimmed = perReviewer.length >= 4 ? perReviewer.slice(1, -1) : perReviewer;
  const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  return round2(clamp(((avg - 1) / 4) * 100));
}

export function reliabilityScore(input: { tasksDue: number; tasksOnTime: number; checkinDays: number; checkinsDone: number }): number {
  const onTime = input.tasksDue === 0 ? 1 : input.tasksOnTime / input.tasksDue;
  const checkins = input.checkinDays === 0 ? 1 : Math.min(1, input.checkinsDone / input.checkinDays);
  return round2(clamp((onTime * 0.6 + checkins * 0.4) * 100));
}

export function projectTotal(p: { deliverables: number; team: number; peer: number; reliability: number }) {
  const total = round2(
    (clamp(p.deliverables) * PROJECT_WEIGHTS.deliverables +
      clamp(p.team) * PROJECT_WEIGHTS.team +
      clamp(p.peer) * PROJECT_WEIGHTS.peer +
      clamp(p.reliability) * PROJECT_WEIGHTS.reliability) / 100,
  );
  return { total, passed: total >= PROJECT_PASS_MARK };
}
