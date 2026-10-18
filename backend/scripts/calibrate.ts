// Runs the AI grader over human-graded calibration samples and reports agreement.
// Ship a prompt/model change only if most grades land within 10 points of the human grade.
//   npm run calibrate [-- rubric_id]
import { db } from "../src/lib/supabase.js";
import { gradeWithRubric } from "../src/ai/grader.js";
import { getRubric } from "../src/ai/rubrics.js";
import { PROMPT_VERSIONS } from "../src/ai/prompts.js";

const only = process.argv[2];
let q = db.from("calibration_samples").select("*");
if (only) q = q.eq("rubric_id", only);
const { data: samples } = await q;
if (!samples?.length) {
  console.log("No calibration samples.");
  process.exit(0);
}
const byRubric: Record<string, { n: number; within: number; diffs: number[] }> = {};
for (const s of samples) {
  const r = getRubric(s.rubric_id);
  const g = await gradeWithRubric({ feature: "onboarding_grading", userId: "00000000-0000-0000-0000-000000000000", roleId: s.role_id, rubricId: s.rubric_id, taskPrompt: r.title, submission: s.submission });
  const diff = Math.abs(g.score - Number(s.human_score));
  await db.from("calibration_samples").update({ last_ai_score: g.score, last_run_at: new Date().toISOString(), last_prompt_version: PROMPT_VERSIONS.grading }).eq("id", s.id);
  byRubric[s.rubric_id] ??= { n: 0, within: 0, diffs: [] };
  byRubric[s.rubric_id].n++;
  byRubric[s.rubric_id].diffs.push(diff);
  if (diff <= 10) byRubric[s.rubric_id].within++;
  console.log(`${s.rubric_id}: human ${s.human_score} vs AI ${g.score} (Δ${diff.toFixed(1)})`);
}
for (const [k, v] of Object.entries(byRubric)) {
  const pct = Math.round((v.within / v.n) * 100);
  console.log(`${pct >= 80 ? "PASS" : "FAIL"} ${k}: ${v.within}/${v.n} within 10 points (${pct}%), mean Δ ${(v.diffs.reduce((a, b) => a + b, 0) / v.n).toFixed(1)}`);
}
