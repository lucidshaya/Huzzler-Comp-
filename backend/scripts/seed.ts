// Seeds starter content and the admin account. Idempotent: safe to re-run.
//   npm run seed
import { db } from "../src/lib/supabase.js";
import { env } from "../src/config/env.js";
import { MCQ, SJT } from "../src/content/bank/mcq.js";
import { PRACTICAL } from "../src/content/bank/practical.js";
import { PERSONAS, FAQ, EXEMPLARS, buildProjectTemplates } from "../src/content/bank/projects.js";
import { TEST_TIME_LIMITS_MIN } from "../src/domain/constants.js";

const letters = ["a", "b", "c", "d"];

function mcqItem(questions: typeof MCQ[string], title: string) {
  const qs = questions.map((q, i) => ({ id: `q${i + 1}`, prompt: q[0], options: q[1].map((label, j) => ({ id: letters[j], label })) }));
  return {
    title,
    kind: "mcq",
    content: { instructions: "Choose the best answer for each question.", questions: qs },
    answer_key: { answers: Object.fromEntries(questions.map((q, i) => [`q${i + 1}`, letters[q[2]]])), explanations: Object.fromEntries(questions.map((q, i) => [`q${i + 1}`, q[3]])) },
  };
}

function sjtItem() {
  return {
    title: "Teamwork judgement",
    kind: "sjt",
    content: {
      instructions: "For each situation, choose what you would most likely do. There's no trick — pick what you'd actually do on a real team.",
      questions: SJT.map((s, i) => ({ id: `s${i + 1}`, prompt: s.prompt, options: s.options.map(([label], j) => ({ id: letters[j], label })) })),
    },
    answer_key: {
      scores: Object.fromEntries(SJT.map((s, i) => [`s${i + 1}`, Object.fromEntries(s.options.map(([, pts], j) => [letters[j], pts]))])),
      rationale: Object.fromEntries(SJT.map((s, i) => [`s${i + 1}`, s.rationale])),
    },
  };
}

async function seedTests() {
  const { data: roles } = await db.from("roles").select("id, name");
  if (!roles?.length) throw new Error("No roles found. Apply the migrations first (supabase/migrations).");
  for (const role of roles) {
    const p = PRACTICAL[role.id];
    const items = [
      { no: 1, ...mcqItem(MCQ[role.id], `${role.name} fundamentals`) },
      { no: 2, ...p.t2 },
      { no: 3, ...p.t3, title: p.t3.title || "Core task" },
      { no: 4, ...p.t4, title: p.t4.title || "Applied scenario" },
      { no: 5, ...sjtItem() },
    ];
    for (const it of items) {
      const row = {
        role_id: role.id, test_no: it.no, version: 1, title: it.title, kind: it.kind, content: it.content, answer_key: it.answer_key ?? null,
        rubric_id: (it as { rubric_id?: string }).rubric_id ?? null, time_limit_min: TEST_TIME_LIMITS_MIN[it.no], status: "approved", approved_at: new Date().toISOString(),
      };
      const { error } = await db.from("test_bank").upsert(row, { onConflict: "role_id,test_no,version" });
      if (error) throw error;
    }
  }
  console.log(`✓ test bank: ${roles.length} roles × 5 tests`);
}

async function seedPersonas() {
  for (const p of PERSONAS) {
    const { data } = await db.from("company_personas").select("id").eq("name", p.name).maybeSingle();
    if (data) await db.from("company_personas").update({ ...p, status: "approved" }).eq("id", data.id);
    else await db.from("company_personas").insert({ ...p, status: "approved" });
  }
  console.log(`✓ personas: ${PERSONAS.length}`);
}

async function seedProjects() {
  const templates = buildProjectTemplates();
  for (const t of templates) {
    const { error } = await db.from("project_templates").upsert({ ...t, version: 1 }, { onConflict: "archetype_id,level,version" });
    if (error) throw error;
  }
  console.log(`✓ project templates: ${templates.length}`);
}

async function seedKnowledge() {
  for (const f of FAQ) {
    const { data } = await db.from("faq").select("id").eq("question", f.question).maybeSingle();
    if (!data) await db.from("faq").insert(f);
  }
  for (const e of EXEMPLARS) {
    const { data } = await db.from("kb_documents").select("id").eq("title", e.title).maybeSingle();
    if (!data) {
      const { data: doc } = await db.from("kb_documents").insert({ kind: "exemplar", role_id: e.role_id, rubric_id: e.rubric_id, title: e.title, body: e.body, score: e.score }).select("id").single();
      await db.from("kb_chunks").insert({ document_id: doc!.id, content: e.body });
      await db.from("calibration_samples").insert({ role_id: e.role_id, rubric_id: e.rubric_id, submission: e.body, human_score: e.score });
    }
  }
  console.log(`✓ FAQ: ${FAQ.length}, exemplars: ${EXEMPLARS.length}`);
}

async function seedAdmin() {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    console.log("• skipped admin (set ADMIN_USERNAME and ADMIN_PASSWORD in .env)");
    return;
  }
  const email = env.ADMIN_EMAIL ?? `${env.ADMIN_USERNAME.toLowerCase()}@admin.huzzler.app`;
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email, password: env.ADMIN_PASSWORD, email_confirm: true, user_metadata: { full_name: "Huzzler Admin" } });
    if (error) throw error;
    user = data.user!;
  } else {
    await db.auth.admin.updateUserById(user.id, { password: env.ADMIN_PASSWORD });
  }
  const { error } = await db.from("profiles").update({ username: env.ADMIN_USERNAME.toLowerCase(), app_role: "admin", full_name: "Huzzler Admin" }).eq("id", user.id);
  if (error) throw error;
  console.log(`✓ admin: username "${env.ADMIN_USERNAME}" (sign in at /admin/login)`);
}

await seedTests();
await seedPersonas();
await seedProjects();
await seedKnowledge();
await seedAdmin();
console.log("Done.");
