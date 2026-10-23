import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

beforeAll(() => {
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY ??= "anon_key_for_tests_0000000000";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service_key_for_tests_000000000";
  process.env.PAYSTACK_SECRET_KEY ??= "sk_test_unit";
});

// In-memory stand-in for the shared token wallet RPCs and the tables the résumé service reads.
const state = vi.hoisted(() => ({
  balance: 0,
  ledger: [] as Array<{ delta: number; kind: string; ref: string }>,
  saved: null as Record<string, unknown> | null,
  ai: "ok" as "ok" | "fails" | "off",
  saveFails: false,
}));

vi.mock("../src/lib/supabase.js", () => {
  const fixtures: Record<string, () => unknown> = {
    profiles: () => ({ id: "u1", full_name: "Ada Obi", phone: "+2348000000000", timezone: "Africa/Lagos", bio: "", username: "ada", role_id: "software_engineer" }),
    roles: () => ({ name: "Software Engineer", team_duty: "Builds features" }),
    token_prices: () => ({ action: "cv_generate", label: "AI résumé draft", tool: "Résumé Builder", cost: 50 }),
    token_wallets: () => ({ balance: state.balance }),
  };
  const chain = (table: string): any => {
    let upsert: Record<string, unknown> | null = null;
    const p: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            if (upsert && table === "cv_documents") {
              if (state.saveFails) return (res: (v: unknown) => void) => res({ data: null, error: { message: "db down" } });
              state.saved = upsert;
            }
            const data = table in fixtures ? fixtures[table]() : table === "cv_documents" ? state.saved : null;
            return (res: (v: unknown) => void) => res({ data, error: null });
          }
          if (prop === "upsert") return (row: Record<string, unknown>) => ((upsert = row), p);
          return () => p;
        },
      },
    );
    return p;
  };
  const rpc = async (fn: string, a: { p_amount: number; p_kind?: string; p_ref: string }) => {
    if (fn === "token_spend") {
      if (state.balance < a.p_amount) return { data: null, error: { message: "INSUFFICIENT_TOKENS" } };
      state.balance -= a.p_amount;
      state.ledger.push({ delta: -a.p_amount, kind: "spend", ref: a.p_ref });
    } else {
      state.balance += a.p_amount;
      state.ledger.push({ delta: a.p_amount, kind: a.p_kind ?? "credit", ref: a.p_ref });
    }
    return { data: state.balance, error: null };
  };
  const db = { from: chain, rpc, auth: { admin: { getUserById: async () => ({ data: { user: { email: "ada@example.com" } } }) } } };
  return { db, anon: db, must: (r: { data: unknown }) => r.data, ok: (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); } };
});

vi.mock("../src/ai/aiClient.js", async (orig) => {
  const real = await orig<typeof import("../src/ai/aiClient.js")>();
  return {
    ...real,
    aiConfigured: () => state.ai !== "off",
    callStructured: async () => {
      if (state.ai === "fails") throw new real.AiOutputError("bad output");
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

describe("AI résumé builder and the token wallet", () => {
  beforeEach(() => {
    state.balance = 0;
    state.ledger = [];
    state.saved = null;
    state.ai = "ok";
    state.saveFails = false;
  });

  it("refuses with 402 and charges nothing when the balance is too low", async () => {
    const { generateCv } = await import("../src/services/cv.js");
    state.balance = 49;
    await expect(generateCv("u1", { target_role: "", background: "" })).rejects.toMatchObject({ status: 402, code: "INSUFFICIENT_TOKENS" });
    expect(state.balance).toBe(49);
    expect(state.saved).toBeNull();
  });

  it("charges the price, saves the résumé and fills contact details from the profile", async () => {
    const { generateCv } = await import("../src/services/cv.js");
    state.balance = 120;
    const r = await generateCv("u1", { target_role: "Frontend Engineer", background: "" });
    expect(r).toMatchObject({ charged: 50, balance: 70, engine: "ai" });
    expect(state.balance).toBe(70);
    expect(r.cv.full_name).toBe("Ada Obi");
    expect(r.cv.contact.email).toBe("ada@example.com");
    expect(r.cv.contact.links[0]).toMatch(/\/u\/ada$/);
    expect((state.saved as any)?.generation_count).toBe(1);
  });

  it("still delivers a résumé from verified records when the AI call fails", async () => {
    const { generateCv } = await import("../src/services/cv.js");
    state.balance = 50;
    state.ai = "fails";
    const r = await generateCv("u1", { target_role: "", background: "BSc Computer Science, University of Lagos, 2022 – 2026" });
    expect(r.engine).toBe("offline");
    expect(r.cv.education[0]).toEqual({ school: "University of Lagos", qualification: "BSc Computer Science", period: "2022 – 2026" });
    expect(state.saved).not.toBeNull();
  });

  it("refunds the tokens when nothing could be saved", async () => {
    const { generateCv } = await import("../src/services/cv.js");
    state.balance = 50;
    state.saveFails = true;
    await expect(generateCv("u1", { target_role: "", background: "" })).rejects.toMatchObject({ status: 502, code: "CV_FAILED" });
    expect(state.balance).toBe(50);
    expect(state.ledger.map((l) => l.kind)).toEqual(["spend", "refund"]);
    expect(state.ledger[0].ref).toBe(state.ledger[1].ref);
  });

  it("the offline writer never invents employers or skills outside the role", async () => {
    const { offlineDraft } = await import("../src/services/cv.js");
    const d = offlineDraft(
      { name: "Ada", email: "", phone: "", location: "", bio: "", username: "", role_id: "data_analyst", role: "Data Analyst", role_duty: "", onboarding: { score: 82, summary: null }, team: null, projects: [], portfolio: [], certificate: null, strengths: [] },
      "",
      "",
    );
    expect(d.experience).toEqual([]);
    expect(d.projects).toEqual([]);
    expect(d.skills).toContain("SQL");
    expect(d.headline).toMatch(/82%/);
  });
});
