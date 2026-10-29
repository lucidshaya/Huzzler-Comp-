import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY ??= "anon_key_for_tests_0000000000";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service_key_for_tests_000000000";
  process.env.PAYSTACK_SECRET_KEY ??= "sk_test_unit";
});

const task = { id: "t1", project_instance_id: "p1", role_id: "product_manager", title: "Write the one-page spec", description: "Write a spec.", depends_on: [], assignee_id: "u1" };

describe("task checklists without AI", () => {
  it("starts from upstream work and numbers steps uniquely", async () => {
    const { libraryChecklist } = await import("../src/services/checklists.js");
    const steps = libraryChecklist(task, [{ title: "Design the feature screen" }]);
    expect(steps[0].text).toContain("Design the feature screen");
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
  });

  it("ends with a hand-off naming who needs the work, then submit", async () => {
    const { closingSteps } = await import("../src/services/checklists.js");
    const names = new Map([["software_engineer", "Software Engineer"], ["uiux_designer", "UI/UX Designer"]]);
    const steps = closingSteps([{ title: "Build the feature", role_id: "software_engineer" }, { title: "Design the feature screen", role_id: "uiux_designer" }], names);
    expect(steps.map((s) => s.id)).toEqual(["share", "submit"]);
    expect(steps[0].text).toContain("Software Engineer, UI/UX Designer");
  });
});
