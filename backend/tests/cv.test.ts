import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

beforeAll(() => {
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY ??= "anon_key_for_tests_0000000000";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service_key_for_tests_000000000";
  process.env.PAYSTACK_SECRET_KEY ??= "sk_test_unit";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
});

// In-memory stand-in for the wallet RPCs and the handful of tables the CV service reads.
const state = vi.hoisted(() => ({
  balance: 0,
  ledger: [] as Array<{ delta: number; reason: string; ref: string }>,
  saved: null as Record<string, unknown> | null,
  aiFails: false,
}));

vi.mock("../src/lib/supabase.js", () => {
  const fixtures: Record<string, unknown> = {
    profiles: { id: "u1", full_name: "Ada Obi", phone: "+2348000000000", timezone: "Africa/Lagos", bio: "", username: "ada", role_id: "software_engineer" },
    roles: { name: "Software Engineer", team_duty: "Builds features" },
    feature_flags: { enabled: true, value: { cost: 50, welcome: 0 } },
  };
  const chain = (table: string): any => {
    let upsert: Record<string, unknown> | null = null;
    const p: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            if (upsert && table === "cv_documents") state.saved = upsert;
            const data = table in fixtures ? fixtures[table] : table === "cv_documents" ? state.saved : null;
            return (res: (v: unknown) => void) => res({ data, error: null });
          }
          if (prop === "upsert") return (row: Record<string, unknown>) => ((upsert = row), p);
          return () => p;
        },
      },
    );
    return p;
  };
  const rpc = async (fn: string, a: { p_amount: number; p_reason: string; p_ref: string }) => {
    if (fn === "spend_tokens") {
      if (state.balance < a.p_amount) return { data: null, error: { message: "INSUFFICIENT_TOKENS" } };
      state.balance -= a.p_amount;
    } else {
      if (state.ledger.some((l) => l.reason === a.p_reason && l.ref === a.p_ref)) return { data: state.balance, error: null };
      state.balance += a.p_amount;
    }
    state.ledger.push({ delta: fn === "spend_tokens" ? -a.p_amount : a.p_amount, reason: a.p_reason, ref: a.p_ref });
    return { data: state.balance, error: null };
  };
  const db = { from: chain, rpc, auth: { admin: { getUserById: async () => ({ data: { user: { email: "ada@example.com" } } }) } } };
  return { db, anon: db, must: (r: { data: unknown }) => r.data, ok: () => {} };
});

vi.mock("../src/ai/aiClient.js", async (orig) => {
  const real = await orig<typeof import("../src/ai/aiClient.js")>();
  return {
    ...real,
    aiConfigured: () => true,
    callStructured: async () => {
      if (state.aiFails) throw new real.AiOutputError("bad output");
      return {
        model: "claude-haiku-5-5",
        data: {
          headline: "Software Engineer",
          summary: "Ships features with a team.",
          skills: ["TypeScript", "React"],
          experience: [{ title: "Software Engineer (simulated internship)", organisation: "Huzzler", period: "2026", bullets: ["Built search"] }],
          projects: [],
          education: [],
        },
      };
    },
  };
});

describe("CV generation and tokens", () => {
  beforeEach(() => {
    state.balance = 0;
    state.ledger = [];
    state.saved = null;
    state.aiFails = false;
  });

  it("refuses with 402 and charges nothing when the balance is too low", async () => {
    const { generateCv } = await import("../src/services/cv.js");
    state.balance = 49;
    await expect(generateCv("u1", { target_role: "", background: "" })).rejects.toMatchObject({ status: 402, code: "INSUFFICIENT_TOKENS" });
    expect(state.balance).toBe(49);
    expect(state.saved).toBeNull();
  });

  it("charges the cost, saves the CV and fills contact details from the profile", async () => {
    const { generateCv } = await import("../src/services/cv.js");
    state.balance = 120;
    const r = await generateCv("u1", { target_role: "Frontend Engineer", background: "" });
    expect(r.charged).toBe(50);
    expect(r.balance).toBe(70);
    expect(state.balance).toBe(70);
    expect(r.cv.full_name).toBe("Ada Obi");
    expect(r.cv.contact.email).toBe("ada@example.com");
    expect(r.cv.contact.links[0]).toMatch(/\/u\/ada$/);
    expect((state.saved as any)?.generation_count).toBe(1);
  });

  it("refunds the tokens when the AI call fails", async () => {
    const { generateCv } = await import("../src/services/cv.js");
    state.balance = 50;
    state.aiFails = true;
    await expect(generateCv("u1", { target_role: "", background: "" })).rejects.toMatchObject({ status: 503, code: "AI_FAILED" });
    expect(state.balance).toBe(50);
    expect(state.ledger.map((l) => l.reason)).toEqual(["cv_generate", "refund"]);
    expect(state.ledger[0].ref).toBe(state.ledger[1].ref);
  });
});
