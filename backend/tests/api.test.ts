import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";

// Env for module load (no network calls are made by these tests).
beforeAll(() => {
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY ??= "anon_key_for_tests_0000000000";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service_key_for_tests_000000000";
  process.env.PAYSTACK_SECRET_KEY ??= "sk_test_unit";
});

describe("Paystack webhook signature", () => {
  it("accepts a correct HMAC-SHA512 signature and rejects tampering", async () => {
    const { verifySignature } = await import("../src/services/paystack.js");
    const { env } = await import("../src/config/env.js");
    const body = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "hz_o_abc" } }));
    const sig = crypto.createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
    expect(verifySignature(body, sig)).toBe(true);
    expect(verifySignature(Buffer.from(body.toString().replace("abc", "xyz")), sig)).toBe(false);
    expect(verifySignature(body, undefined)).toBe(false);
    expect(verifySignature(body, "deadbeef")).toBe(false);
  });
});

describe("HTTP layer", () => {
  it("rejects unsigned webhooks, protects private routes and serves health", async () => {
    const request = (await import("supertest")).default;
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    expect((await request(app).get("/health")).body).toEqual({ ok: true });
    expect((await request(app).post("/api/webhooks/paystack").send({ event: "charge.success", data: {} })).status).toBe(401);
    expect((await request(app).post("/api/webhooks/paystack").set("x-paystack-signature", "bad").send({ event: "x" })).status).toBe(401);
    expect((await request(app).get("/api/me")).status).toBe(401);
    expect((await request(app).get("/api/admin/overview")).status).toBe(401);
    expect((await request(app).post("/api/admin/auth/login").send({ username: "a" })).status).toBe(400);
  });
});

describe("templates", () => {
  it("fills variables and leaves unknown ones visible", async () => {
    const { render } = await import("../src/lib/templates.js");
    expect(render("Hi {{name}}, {{missing}}", { name: "Ada" })).toBe("Hi Ada, {{missing}}");
  });
});

describe("rubrics", () => {
  it("every role has t3, t4 and project rubrics whose weights sum to 100", async () => {
    const { getRubric } = await import("../src/ai/rubrics.js");
    const roles = ["software_engineer", "product_manager", "uiux_designer", "devops_engineer", "technical_writer", "data_analyst", "qa_engineer", "growth_marketer"];
    for (const r of roles) for (const k of ["t3", "t4", "project"]) {
      const rub = getRubric(`${r}.${k}`);
      expect(rub.criteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
    }
    expect(getRubric("common.demo").criteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });
});

describe("content bank", () => {
  it("has 5 tests per role with answer keys for every auto-graded kind", async () => {
    const { MCQ, SJT } = await import("../src/content/bank/mcq.js");
    const { PRACTICAL } = await import("../src/content/bank/practical.js");
    for (const [role, qs] of Object.entries(MCQ)) {
      expect(qs.length).toBeGreaterThanOrEqual(8);
      for (const q of qs) expect(q[2]).toBeLessThan(4);
      const p = PRACTICAL[role];
      for (const t of [p.t2, p.t3, p.t4]) {
        if (t.kind !== "ai_rubric") expect(t.answer_key).toBeTruthy();
        if (t.kind === "ai_rubric") expect(t.rubric_id).toMatch(new RegExp(`^${role}\\.`));
      }
    }
    expect(SJT.length).toBe(8);
  });
  it("builds 20 project templates whose task dependencies all exist", async () => {
    const { buildProjectTemplates } = await import("../src/content/bank/projects.js");
    const ts = buildProjectTemplates();
    expect(ts).toHaveLength(20);
    for (const t of ts) {
      const keys = new Set(t.role_tasks.map((x) => x.key));
      for (const task of t.role_tasks) {
        for (const d of task.depends_on ?? []) expect(keys.has(d)).toBe(true);
        expect(task.hints).toHaveLength(3);
        expect(t.milestones.some((m) => m.key === task.milestone_key)).toBe(true);
      }
    }
  });
});

describe("route wrapper", () => {
  it("sends an explicit null as null (e.g. 'no attempt yet') and undefined as {ok:true}", async () => {
    const request = (await import("supertest")).default;
    const express = (await import("express")).default;
    const { h } = await import("../src/routes/util.js");
    const app = express();
    app.get("/null", h(async () => null));
    app.get("/void", h(async () => undefined));
    expect((await request(app).get("/null")).body).toBeNull();
    expect((await request(app).get("/void")).body).toEqual({ ok: true });
  });
});
