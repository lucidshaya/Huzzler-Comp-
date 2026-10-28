import { describe, it, expect, beforeAll, vi } from "vitest";

beforeAll(() => {
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY ??= "anon_key_for_tests_0000000000";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service_key_for_tests_000000000";
  process.env.PAYSTACK_SECRET_KEY ??= "sk_test_unit";
});

vi.mock("../src/lib/supabase.js", () => ({ db: {}, anon: {}, must: (r: { data: unknown }) => r.data, ok: () => undefined }));

const { validateChanges } = await import("../src/services/meetings.js");

const now = new Date("2026-10-28T12:00:00Z");
const projectDue = new Date("2026-11-10T00:00:00Z");
const tasks = [
  { id: "t1", title: "Design the onboarding flow", description: "Wireframes", role_id: "uiux_designer", status: "todo", due_at: "2026-11-03T00:00:00Z" },
  { id: "t2", title: "Ship the API", description: "Endpoints", role_id: "software_engineer", status: "done", due_at: "2026-11-01T00:00:00Z" },
];
const ctx = { tasks, roles: new Set(["uiux_designer", "software_engineer", "product_manager"]), projectDue, now };
const base = { task_ref: null, role_id: null, title: null, description: null, hints: null, due_in_days: null, reason: "Agreed in the meeting" };

describe("meeting proposals", () => {
  it("keeps a new task for a role on the squad, capped at the project deadline", () => {
    const [c] = validateChanges([{ ...base, kind: "add_task", role_id: "software_engineer", title: "Add Paystack checkout", description: "Use the test keys.", due_in_days: 30 }], ctx);
    expect(c).toMatchObject({ kind: "add_task", role_id: "software_engineer", title: "Add Paystack checkout", due_at: projectDue.toISOString() });
    expect((c as { hints: string[] }).hints).toHaveLength(3);
  });

  it("drops new tasks for roles the squad doesn't have, or with no title", () => {
    expect(validateChanges([{ ...base, kind: "add_task", role_id: "growth_marketer", title: "Launch ads", description: "Run a campaign." }], ctx)).toEqual([]);
    expect(validateChanges([{ ...base, kind: "add_task", role_id: "software_engineer", title: " ", description: "x" }], ctx)).toEqual([]);
  });

  it("updates open tasks by ref and records what they were", () => {
    const [c] = validateChanges([{ ...base, kind: "update_task", task_ref: "t1", title: "Design the onboarding flow (mobile first)", due_in_days: 2 }], ctx);
    expect(c).toMatchObject({ kind: "update_task", task_id: "t1", title: "Design the onboarding flow (mobile first)", due_at: "2026-10-30T12:00:00.000Z", before: { title: "Design the onboarding flow" } });
  });

  it("ignores done tasks, unknown refs, no-op updates and repeats", () => {
    expect(
      validateChanges(
        [
          { ...base, kind: "update_task", task_ref: "T2", title: "Ship the API v2" },
          { ...base, kind: "update_task", task_ref: "T9", title: "Nope" },
          { ...base, kind: "update_task", task_ref: "T1", title: "Design the onboarding flow" },
        ],
        ctx,
      ),
    ).toEqual([]);
    expect(validateChanges([{ ...base, kind: "update_task", task_ref: "T1", description: "A" }, { ...base, kind: "update_task", task_ref: "T1", description: "B" }], ctx)).toHaveLength(1);
  });
});
