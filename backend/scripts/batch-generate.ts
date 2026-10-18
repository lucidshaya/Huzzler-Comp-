// Bulk content generation with the Message Batches API (50% price). Results are stored as
// DRAFT rows; a content reviewer approves them in the admin dashboard before anyone sees them.
//   npm run batch:generate -- submit mcq <role_id> <versions>
//   npm run batch:generate -- collect <batch_id>
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../src/lib/supabase.js";
import { env } from "../src/config/env.js";
import { featureConfig, costUsd } from "../src/ai/features.js";

if (!env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY first.");
  process.exit(1);
}
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const [cmd, ...args] = process.argv.slice(2);

const MCQ_PROMPT = (role: string, version: number) => `Write 8 multiple-choice questions testing fundamentals for a junior ${role.replace(/_/g, " ")} (version ${version} of an equivalent test bank: same difficulty, different questions).
Rules: 4 options each, exactly one correct, plausible distractors, no trick questions, African/Nigerian product context where natural.
Return ONLY JSON: {"questions":[{"prompt":"...","options":["a","b","c","d"],"correct":0,"explanation":"..."}]}`;

if (cmd === "submit") {
  const [kind, role, versionsArg] = args;
  if (kind !== "mcq" || !role) throw new Error("usage: submit mcq <role_id> <versions>");
  const cfg = await featureConfig("content_batch");
  const versions = Number(versionsArg ?? 3);
  const batch = await client.messages.batches.create({
    requests: Array.from({ length: versions }, (_, i) => ({
      custom_id: `mcq:${role}:${i + 2}`,
      params: { model: cfg.model, max_tokens: cfg.maxTokens, messages: [{ role: "user" as const, content: MCQ_PROMPT(role, i + 2) }] },
    })),
  });
  console.log(`Submitted batch ${batch.id}. Collect with: npm run batch:generate -- collect ${batch.id}`);
} else if (cmd === "collect") {
  const id = args[0];
  const b = await client.messages.batches.retrieve(id);
  if (b.processing_status !== "ended") {
    console.log(`Still ${b.processing_status}`);
    process.exit(0);
  }
  for await (const r of await client.messages.batches.results(id)) {
    if (r.result.type !== "succeeded") {
      console.warn(`${r.custom_id}: ${r.result.type}`);
      continue;
    }
    const msg = r.result.message;
    const u = msg.usage;
    await db.from("ai_calls").insert({ feature: "content_batch", model: msg.model, input_tokens: u.input_tokens, output_tokens: u.output_tokens, cost_usd: costUsd(msg.model, { input: u.input_tokens, output: u.output_tokens, cacheRead: 0, cacheWrite: 0 }, true), success: true, prompt_version: "batch-mcq@1" });
    const text = msg.content.find((c) => c.type === "text")?.text ?? "";
    const [, role, version] = r.custom_id.split(":");
    try {
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { questions: Array<{ prompt: string; options: string[]; correct: number; explanation: string }> };
      const L = ["a", "b", "c", "d"];
      await db.from("test_bank").upsert(
        {
          role_id: role, test_no: 1, version: Number(version), title: "Fundamentals", kind: "mcq", time_limit_min: 20, status: "draft",
          content: { instructions: "Choose the best answer for each question.", questions: json.questions.map((q, i) => ({ id: `q${i + 1}`, prompt: q.prompt, options: q.options.map((label, j) => ({ id: L[j], label })) })) },
          answer_key: { answers: Object.fromEntries(json.questions.map((q, i) => [`q${i + 1}`, L[q.correct]])), explanations: Object.fromEntries(json.questions.map((q, i) => [`q${i + 1}`, q.explanation])) },
        },
        { onConflict: "role_id,test_no,version" },
      );
      console.log(`✓ ${r.custom_id} saved as draft`);
    } catch (err) {
      console.warn(`${r.custom_id}: could not parse output`, err);
    }
  }
} else {
  console.log("usage: submit mcq <role_id> <versions> | collect <batch_id>");
}
