import { describe, it, expect } from "vitest";
import { checkAge } from "../src/domain/age.js";
import { canTransition } from "../src/domain/journey.js";
import { onboardingOutcome, peerScore, projectTotal, weightedRubricScore, isBorderline, reliabilityScore } from "../src/domain/grading.js";
import { gradeMcq, gradeRanking, gradeSeededIssues, gradeNumeric, gradeSjt, compareResultSets } from "../src/domain/autograde.js";
import { formTeams, type Candidate } from "../src/domain/matching.js";

describe("age", () => {
  const today = new Date("2026-10-18T00:00:00Z");
  it("blocks under 17", () => expect(checkAge(new Date("2010-01-01"), today).allowed).toBe(false));
  it("flags 17-year-olds for guardian consent", () => expect(checkAge(new Date("2009-06-01"), today)).toMatchObject({ allowed: true, needsGuardian: true }));
  it("allows adults without guardian", () => expect(checkAge(new Date("2000-06-01"), today)).toMatchObject({ allowed: true, needsGuardian: false }));
  it("handles birthday not yet reached this year", () => expect(checkAge(new Date("2009-10-19"), today).allowed).toBe(false));
});

describe("journey state machine", () => {
  it("follows the main path", () => {
    expect(canTransition("REGISTERED", "FIELD_CHOSEN")).toBe(true);
    expect(canTransition("PAYMENT_PENDING", "PAID")).toBe(true);
    expect(canTransition("PROJECT_5", "CERTIFIED")).toBe(true);
  });
  it("rejects skipping payment", () => expect(canTransition("ONBOARDING_STARTED", "PAID")).toBe(false));
  it("rejects skipping guardian consent into tests", () => expect(canTransition("GUARDIAN_PENDING", "TESTING")).toBe(false));
  it("lapses only paid statuses and resumes to the saved status", () => {
    expect(canTransition("PREVIEW", "LAPSED")).toBe(false);
    expect(canTransition("PROJECT_2", "LAPSED")).toBe(true);
    expect(canTransition("LAPSED", "PROJECT_2", "PROJECT_2")).toBe(true);
    expect(canTransition("LAPSED", "PROJECT_3", "PROJECT_2")).toBe(false);
  });
  it("never leaves WITHDRAWN", () => expect(canTransition("WITHDRAWN", "REGISTERED")).toBe(false));
});

describe("onboarding pass rules", () => {
  it("passes at 70 weighted with no test under 50", () => {
    expect(onboardingOutcome({ 1: 70, 2: 70, 3: 70, 4: 70, 5: 70 }).passed).toBe(true);
  });
  it("fails when one test is below 50 even with a high average", () => {
    const o = onboardingOutcome({ 1: 100, 2: 100, 3: 100, 4: 45, 5: 100 });
    expect(o.weighted).toBeGreaterThan(70);
    expect(o.passed).toBe(false);
    expect(o.belowFloor).toEqual([4]);
  });
  it("weights tests 10/20/25/25/20", () => {
    expect(onboardingOutcome({ 1: 100, 2: 0, 3: 0, 4: 0, 5: 0 }).weighted).toBe(10);
    expect(onboardingOutcome({ 1: 0, 2: 0, 3: 100, 4: 0, 5: 0 }).weighted).toBe(25);
  });
  it("lists tests under 70 for the retake", () => {
    expect(onboardingOutcome({ 1: 90, 2: 60, 3: 80, 4: 69, 5: 75 }).failedTests).toEqual([2, 4]);
  });
  it("detects borderline scores", () => {
    expect(isBorderline(66)).toBe(true);
    expect(isBorderline(76)).toBe(false);
  });
});

describe("rubric totals are computed by the server", () => {
  it("weights criteria", () => {
    expect(weightedRubricScore({ a: { score: 100 }, b: { score: 50 } }, { a: 3, b: 1 })).toBe(87.5);
  });
  it("ignores criteria the rubric does not define", () => {
    expect(weightedRubricScore({ a: { score: 80 }, injected: { score: 100 } }, { a: 1 })).toBe(80);
  });
});

describe("auto-graders", () => {
  it("mcq", () => expect(gradeMcq({ q1: "a", q2: "b" }, { answers: { q1: "a", q2: "c" } }).score).toBe(50));
  it("sjt", () => expect(gradeSjt({ s1: "x" }, { scores: { s1: { x: 2, y: 3 } } }).score).toBeCloseTo(66.67));
  it("ranking: perfect and reversed", () => {
    expect(gradeRanking(["a", "b", "c", "d"], { order: ["a", "b", "c", "d"] }).score).toBe(100);
    expect(gradeRanking(["d", "c", "b", "a"], { order: ["a", "b", "c", "d"] }).score).toBe(0);
  });
  it("seeded issues gives half credit for wrong category", () => {
    const r = gradeSeededIssues([{ target: "L3", category: "grammar" }, { target: "L9", category: "clarity" }], {
      issues: [{ target: "L3", category: "grammar" }, { target: "L9", category: "accuracy" }],
    });
    expect(r.score).toBe(75);
  });
  it("numeric tolerates formatting", () => expect(gradeNumeric({ a: "₦12,500" }, { answers: { a: { value: 12500 } } }).score).toBe(100));
  it("result sets compare order-insensitively", () => expect(compareResultSets([["2"], ["1"]], [["1"], ["2"]])).toBe(true));
});

describe("project scoring", () => {
  it("peer score trims outliers with 4+ reviewers", () => {
    const r = (v: number) => ({ communication: v, quality: v, reliability: v, collaboration: v });
    expect(peerScore([r(1), r(4), r(4), r(5)])).toBe(75);
  });
  it("totals 50/25/15/10 and passes at 70", () => {
    expect(projectTotal({ deliverables: 70, team: 70, peer: 70, reliability: 70 })).toEqual({ total: 70, passed: true });
    expect(projectTotal({ deliverables: 60, team: 80, peer: 70, reliability: 70 }).passed).toBe(false);
  });
  it("reliability", () => expect(reliabilityScore({ tasksDue: 4, tasksOnTime: 2, checkinDays: 5, checkinsDone: 5 })).toBe(70));
});

describe("squad matching", () => {
  const c = (userId: string, roleId: string, extra: Partial<Candidate> = {}): Candidate => ({
    userId, roleId, archetypeId: "saas_mobile", hoursPerWeek: 10, tzBand: "GMT+1", scoreBand: 7, waitingSince: new Date(2026, 0, Number(userId.slice(1)) || 1), ...extra,
  });
  const template = { required: { product_manager: 1, software_engineer: 2, uiux_designer: 1, qa_engineer: 1 }, optional: ["devops_engineer", "technical_writer"], max_size: 7 };
  const compat = new Set(["product_manager", "software_engineer", "uiux_designer", "qa_engineer", "devops_engineer", "technical_writer"]);

  it("forms a full team when all required roles exist", () => {
    const pool = [c("u1", "product_manager"), c("u2", "software_engineer"), c("u3", "software_engineer"), c("u4", "uiux_designer"), c("u5", "qa_engineer"), c("u6", "technical_writer")];
    const teams = formTeams(pool, template, compat);
    expect(teams).toHaveLength(1);
    expect(teams[0].members).toHaveLength(6);
    expect(teams[0].missingRoles).toEqual([]);
  });
  it("waits when a required role is missing and stand-ins are not allowed", () => {
    expect(formTeams([c("u1", "product_manager"), c("u2", "software_engineer")], template, compat)).toHaveLength(0);
  });
  it("starts with gaps when stand-ins are allowed", () => {
    const teams = formTeams([c("u1", "product_manager"), c("u2", "software_engineer")], template, compat, { allowStandins: () => true });
    expect(teams[0].missingRoles.sort()).toEqual(["qa_engineer", "software_engineer", "uiux_designer"]);
  });
  it("excludes incompatible roles", () => {
    const teams = formTeams([c("u1", "data_analyst")], template, compat, { allowStandins: () => true });
    expect(teams).toHaveLength(0);
  });
  it("prefers candidates in the same score band", () => {
    const pool = [c("u1", "product_manager"), c("u2", "software_engineer", { scoreBand: 9 }), c("u3", "software_engineer"), c("u4", "software_engineer"), c("u5", "uiux_designer"), c("u6", "qa_engineer")];
    const ids = formTeams(pool, template, compat)[0].members.map((m) => m.userId);
    expect(ids).not.toContain("u2");
  });
});
