// What each onboarding test looks like, per field, for the tests start screen and test intros.
// Mirrors backend/src/content/bank (kinds per field); titles vary by version, so only the format is listed.

export type TestKind =
  | "mcq"
  | "sjt"
  | "ranking"
  | "numeric"
  | "seeded_issues"
  | "ai_rubric"
  | "code_sandbox"
  | "sql_result";

export const KIND_GUIDE: Record<TestKind, { label: string; how: string }> = {
  mcq: { label: "Multiple choice", how: "Pick one answer per question. Instant score." },
  sjt: {
    label: "Teamwork judgement",
    how: "Choose what you'd really do in each team situation. No trick answers.",
  },
  ranking: { label: "Prioritise", how: "Drag items into the order you'd tackle them." },
  numeric: { label: "Work with data", how: "Read the table and answer with numbers." },
  seeded_issues: {
    label: "Spot the issues",
    how: "Flag what's wrong and pick the type of problem. Don't flag what's fine.",
  },
  ai_rubric: {
    label: "Written task",
    how: "Write a short, structured answer. Graded against a published rubric.",
  },
  code_sandbox: {
    label: "Code",
    how: "Write JavaScript in the editor. Run it as often as you like; hidden tests check it when you submit.",
  },
  sql_result: {
    label: "SQL",
    how: "Write one SQLite query. Run it to see the rows; we check the result when you submit.",
  },
};

const T = (t2: TestKind, t3: TestKind, t4: TestKind): TestKind[] => ["mcq", t2, t3, t4, "sjt"];

export const FIELD_TESTS: Record<string, TestKind[]> = {
  product_manager: T("ranking", "ai_rubric", "ai_rubric"),
  software_engineer: T("code_sandbox", "code_sandbox", "ai_rubric"),
  uiux_designer: T("seeded_issues", "ai_rubric", "ai_rubric"),
  devops_engineer: T("seeded_issues", "ai_rubric", "ai_rubric"),
  technical_writer: T("seeded_issues", "ai_rubric", "ai_rubric"),
  data_analyst: T("sql_result", "numeric", "ai_rubric"),
  qa_engineer: T("seeded_issues", "ai_rubric", "code_sandbox"),
  growth_marketer: T("numeric", "ai_rubric", "ai_rubric"),
};

export const TEST_SLOTS = [
  { label: "Fundamentals", mins: 20 },
  { label: "Practical", mins: 45 },
  { label: "Core task", mins: 90 },
  { label: "Scenario", mins: 60 },
  { label: "Teamwork", mins: 20 },
];
