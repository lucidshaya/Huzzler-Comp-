import { describe, it, expect, beforeAll } from "vitest";

// Env for module load (no network calls are made by these tests).
beforeAll(() => {
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY ??= "anon_key_for_tests_0000000000";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service_key_for_tests_000000000";
  process.env.PAYSTACK_SECRET_KEY ??= "sk_test_unit";
});

const ctx = { teamId: null, project: "Amala Marketplace search", brief: "", tasks: ["Build the filter chips"], roleId: "software_engineer" };

describe("Workstation offline generator (used until the AI key is added)", () => {
  it("splits a spoken stand-up into shipped / next / blockers", async () => {
    const { mockOutput } = await import("../src/services/workstation.js");
    const out = mockOutput({ action: "voice_summary", transcript: "Yesterday I finished the filter hook. Today I will wire it into the grid. I'm waiting on the API contract." }, ctx);
    expect(out.shipped).toMatch(/finished the filter hook/);
    expect(out.today).toMatch(/wire it into the grid/);
    expect(out.blockers).toMatch(/waiting on the API contract/);
  });

  it("says None when there are no blockers", async () => {
    const { mockOutput } = await import("../src/services/workstation.js");
    const out = mockOutput({ action: "voice_summary", transcript: "Yesterday I shipped the page. Today I'll test it. No blockers." }, ctx);
    expect(out.blockers).toBe("None.");
  });

  it("classifies flowchart steps by what they describe", async () => {
    const { mockOutput } = await import("../src/services/workstation.js");
    const kind = (prompt: string) => (mockOutput({ action: "logic_canvas", prompt }, ctx).node as { kind: string }).kind;
    expect(kind("If the webhook times out after 5s")).toBe("decision");
    expect(kind("Save the order to the database")).toBe("database");
    expect(kind("Send the receipt email")).toBe("output");
    expect(kind("User taps checkout")).toBe("trigger");
  });

  it("writes SQL and a chart for a data question, deterministically", async () => {
    const { mockOutput } = await import("../src/services/workstation.js");
    const q = { action: "data_forge" as const, question: "Compare weekly conversion across cohorts" };
    const a = mockOutput(q, ctx);
    expect(String(a.sql)).toMatch(/SELECT/);
    expect((a.chart as unknown[]).length).toBeGreaterThanOrEqual(2);
    expect(mockOutput(q, ctx)).toEqual(a);
  });

  it("knows common African payment APIs", async () => {
    const { mockOutput } = await import("../src/services/workstation.js");
    const out = mockOutput({ action: "docs_extract", url: "https://paystack.com/docs/api/transaction/" }, ctx);
    expect((out.endpoints as unknown[]).length).toBeGreaterThan(0);
    expect(String(out.summary)).toMatch(/x-paystack-signature/);
  });
});

describe("Identity streaks and token references", () => {
  it("counts the longest run of consecutive stand-up days", async () => {
    const { longestStreak } = await import("../src/services/identity.js");
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06"])).toBe(3);
    expect(longestStreak(["2026-10-02", "2026-10-01", "2026-10-01"])).toBe(2);
  });

  it("routes token top-ups by their reference prefix", async () => {
    const { isTokenReference } = await import("../src/services/tokens.js");
    expect(isTokenReference("hz_t_abc123")).toBe(true);
    expect(isTokenReference("hz_o_abc123")).toBe(false);
    expect(isTokenReference("T1234567890")).toBe(false);
  });
});
