import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

beforeAll(() => {
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY ??= "anon_key_for_tests_0000000000";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service_key_for_tests_000000000";
  process.env.PAYSTACK_SECRET_KEY ??= "sk_test_unit";
});

const state = vi.hoisted(() => ({
  ai: true,
  calls: 0,
  reply: null as unknown,
  helpFlag: { enabled: false, value: { ai: false } } as { enabled: boolean; value: { ai: boolean } },
}));

vi.mock("../src/lib/supabase.js", () => {
  const fixtures: Record<string, () => unknown> = {
    faq: () => [{ id: "f1", role_id: null, question: "How do I pay for my plan?", answer: "Go to Billing and pay with Paystack." }],
    kb_documents: () => [],
    feature_flags: () => state.helpFlag,
    profiles: () => ({ role_id: "software_engineer" }),
    help_queries: () => ({ id: "h1" }),
  };
  const chain = (table: string): any => {
    const p: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (res: (v: unknown) => void) => res({ data: fixtures[table]?.() ?? null, error: null, count: 0 });
          return () => p;
        },
      },
    );
    return p;
  };
  const db = { from: chain, rpc: async () => ({ data: null, error: null }) };
  return { db, anon: db, must: (r: { data: unknown }) => r.data, ok: () => undefined };
});

vi.mock("../src/ai/aiClient.js", async (orig) => {
  const real = await orig<typeof import("../src/ai/aiClient.js")>();
  return {
    ...real,
    aiConfigured: () => state.ai,
    callStructured: async () => {
      state.calls++;
      return { model: "claude-haiku-5-5", data: state.reply };
    },
  };
});

beforeEach(() => {
  state.ai = true;
  state.calls = 0;
  state.reply = null;
  state.helpFlag = { enabled: false, value: { ai: false } };
});
beforeEach(async () => (await import("../src/services/help.js")).resetHelpCorpus());

describe("help bot is retrieval-only by default", () => {
  it("never calls the model while the help_bot AI flag is off", async () => {
    const { askHelp } = await import("../src/services/help.js");
    const r = await askHelp("u1", "pay plan billing question about something else entirely");
    expect(state.calls).toBe(0);
    expect(["faq", "none"]).toContain(r.source);
  });
});

describe("help bot with AI on", () => {
  it("answers greetings and off-FAQ questions from the platform guide", async () => {
    const { askHelp } = await import("../src/services/help.js");
    state.helpFlag = { enabled: true, value: { ai: true } };
    state.reply = { answer: "Hi! What can I help you with?", answered_from_reference: true, needs_person: false };
    const r = await askHelp("u2", "hello there");
    expect(state.calls).toBe(1);
    expect(r).toMatchObject({ source: "ai", answer: "Hi! What can I help you with?", handoff: null });
  });

  it("offers a person when the model says the problem needs one", async () => {
    const { askHelp } = await import("../src/services/help.js");
    state.helpFlag = { enabled: true, value: { ai: true } };
    state.reply = { answer: "Try refreshing first.", answered_from_reference: true, needs_person: true };
    const r = await askHelp("u3", "my grade disappeared from the results page");
    expect(r.handoff).toMatch(/person/);
  });
});

describe("help bot dead ends", () => {
  const q = (question: string, answered = true, helpful: boolean | null = null) => ({ question, answered, helpful, top_faq_id: null });

  it("lets a fresh question through", async () => {
    const { deadEnd } = await import("../src/services/help.js");
    expect(deadEnd([], "How do I pay?")).toEqual({ stuck: false, reason: null });
  });

  it("suggests a person when the same question comes back", async () => {
    const { deadEnd } = await import("../src/services/help.js");
    const r = deadEnd([q("my test won't submit")], "my test won't submit");
    expect(r.stuck).toBe(false);
    expect(r.reason).toMatch(/already/);
  });

  it("stops the model after repeated misses", async () => {
    const { deadEnd } = await import("../src/services/help.js");
    expect(deadEnd([q("my test won't submit", false)], "test won't submit still").stuck).toBe(true);
    expect(deadEnd([q("a", false), q("b", false), q("c", false)], "something new").stuck).toBe(true);
    expect(deadEnd([q("refund please", true, false)], "refund please").stuck).toBe(true);
  });
});

const person = (id: string, distance = 0) => ({ user_id: id, name: id, role: "Software Engineer", onboarding_score: 80, timezone: "Africa/Lagos", hours_per_week: 15, waiting_days: 3, distance });

describe("AI squad matching stays inside the rules", () => {
  it("makes no call when there's nothing to choose", async () => {
    const { chooseSquad } = await import("../src/ai/matching.js");
    const r = await chooseSquad({ archetype: "fintech", seed: person("seed"), seats: [{ seat: "s1", role: "QA", options: [person("a")] }] });
    expect(r).toBeNull();
    expect(state.calls).toBe(0);
  });

  it("keeps the rules engine's squad without an API key", async () => {
    const { chooseSquad } = await import("../src/ai/matching.js");
    state.ai = false;
    const r = await chooseSquad({ archetype: "fintech", seed: person("seed"), seats: [{ seat: "s1", role: "QA", options: [person("a"), person("b")] }] });
    expect(r).toBeNull();
    expect(state.calls).toBe(0);
  });

  it("ignores picks that weren't offered and falls back to the rules pick", async () => {
    const { chooseSquad } = await import("../src/ai/matching.js");
    state.reply = { picks: [{ seat: "s1", user_id: "intruder", reason: "x" }, { seat: "s2", user_id: "d", reason: "closer time zone" }], summary: "ok", confidence: 0.8 };
    const r = await chooseSquad({
      archetype: "fintech",
      seed: person("seed"),
      seats: [
        { seat: "s1", role: "QA", options: [person("a"), person("b")] },
        { seat: "s2", role: "Designer", options: [person("c"), person("d")] },
      ],
    });
    expect(r?.picks.get("s1")).toBe("a");
    expect(r?.picks.get("s2")).toBe("d");
  });
});

describe("test pool drafts are checked before they're saved", () => {
  const base = { kind: "mcq", title: "Base", content: {}, answer_key: null, rubric_id: null };

  it("converts a valid multiple-choice draft to the grader's shape", async () => {
    const { toBankRow } = await import("../src/services/testPool.js");
    const questions = Array.from({ length: 6 }, (_, i) => ({ prompt: `Q${i}`, options: ["w", "x", "y", "z"], correct_index: i % 4, explanation: "because" }));
    const row = toBankRow("mcq", { title: "New", instructions: "Pick one", questions }, base);
    expect((row.content as any).questions[0].options[0]).toEqual({ id: "a", label: "w" });
    expect((row.answer_key as any).answers.q2).toBe("b");
  });

  it("rejects a ranking whose order misses an item", async () => {
    const { toBankRow } = await import("../src/services/testPool.js");
    const items = ["a", "b", "c", "d"].map((id) => ({ id, label: id, detail: "" }));
    expect(() => toBankRow("ranking", { title: "R", instructions: "", context: "", items, correct_order: ["a", "b", "c"], rationale: "" }, { ...base, kind: "ranking" })).toThrow();
  });

  it("rejects spot-the-issue categories outside the allowed list", async () => {
    const { toBankRow } = await import("../src/services/testPool.js");
    const items = Array.from({ length: 8 }, (_, i) => ({ id: `E${i + 1}`, text: "el", issue_category: i < 3 ? (i === 0 ? "vibes" : "contrast") : null }));
    expect(() => toBankRow("seeded_issues", { title: "S", instructions: "", items }, { ...base, kind: "seeded_issues", content: { categories: ["contrast"] } })).toThrow();
  });

  it("rejects a numeric table with ragged rows", async () => {
    const { toBankRow } = await import("../src/services/testPool.js");
    const d = { title: "N", instructions: "", columns: ["a", "b"], rows: [["1", "2"], ["3"]], questions: [{ id: "x", prompt: "", unit: "", value: 1, tolerance: 0, explanation: "" }, { id: "y", prompt: "", unit: "", value: 2, tolerance: 0, explanation: "" }] };
    expect(() => toBankRow("numeric", d, { ...base, kind: "numeric" })).toThrow();
  });

  it("keeps the slot's rubric and image upload for written tasks", async () => {
    const { toBankRow } = await import("../src/services/testPool.js");
    const row = toBankRow("ai_rubric", { title: "W", instructions: "Write", brief: "A long enough brief about a Lagos fintech launching savings.", min_words: 100, max_words: 600, required_sections: [] }, { ...base, kind: "ai_rubric", rubric_id: "uiux_designer.t3", content: { allow_image: true } });
    expect(row.rubric_id).toBe("uiux_designer.t3");
    expect((row.content as any).allow_image).toBe(true);
    expect((row.answer_key as any).checks).toEqual({ min_words: 100, max_words: 600 });
  });

  it("asks for the AI key instead of generating without one", async () => {
    const { generateTests } = await import("../src/services/testPool.js");
    state.ai = false;
    await expect(generateTests("u1", { role_id: "software_engineer", test_no: 1, brief: "assess async JS", count: 1, difficulty: "standard" })).rejects.toMatchObject({ status: 503 });
  });
});

describe("DeepSeek cost accounting", () => {
  it("doubles the price during DeepSeek peak hours only", async () => {
    const { costUsd, deepseekPeak } = await import("../src/ai/features.js");
    const u = { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 };
    const offPeak = new Date("2026-10-28T12:00:00Z"); // Wednesday midday
    const peak = new Date("2026-10-28T07:00:00Z"); // Wednesday 07:00 UTC (08:00 Lagos)
    const weekend = new Date("2026-10-31T07:00:00Z"); // Saturday
    expect(deepseekPeak(peak)).toBe(true);
    expect(deepseekPeak(weekend)).toBe(false);
    expect(costUsd("deepseek-flash", u, false, offPeak)).toBeCloseTo(0.75);
    expect(costUsd("deepseek-flash", u, false, peak)).toBeCloseTo(1.5);
    expect(costUsd("claude-haiku-5-5", u, false, peak)).toBeCloseTo(0.6);
  });
});
