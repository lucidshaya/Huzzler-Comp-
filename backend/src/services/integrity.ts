import { db } from "../lib/supabase.js";
import { embed, toPgVector } from "../ai/embeddings.js";

const SIMILARITY_THRESHOLD = 0.93;

const FOLLOW_UPS = [
  "Walk us through one decision in your submission you considered doing differently, and why you chose this way.",
  "Which part of this work was hardest for you, and how did you get past it?",
  "If you had one more hour, what would you change in your submission and why?",
  "Explain, in your own words, the most important point of your submission to a teammate who hasn't read it.",
];

/** Embeds a submission and flags near-duplicates of other users' work on the same task. */
export async function checkSimilarity(subjectType: string, subjectId: string, userId: string, scope: string, text: string) {
  const vec = await embed(text);
  if (!vec) return;
  await db.from("submission_embeddings").upsert({ subject_type: subjectType, subject_id: subjectId, user_id: userId, scope, embedding: toPgVector(vec) }, { onConflict: "subject_type,subject_id" });
  const { data: matches } = await db.rpc("match_similar_submissions", { query_embedding: toPgVector(vec), filter_scope: scope, exclude_user: userId, min_similarity: SIMILARITY_THRESHOLD, match_count: 3 });
  for (const m of (matches ?? []) as Array<{ subject_id: string; similarity: number }>) {
    await db.from("integrity_flags").insert({ user_id: userId, subject_type: subjectType, subject_id: subjectId, other_subject_id: m.subject_id, similarity: m.similarity, reason: "high similarity to another user's submission" });
  }
}

/** Possible AI-generated work: ask a follow-up question from the pre-written bank. */
export async function flagPossibleAi(subjectType: string, subjectId: string, userId: string) {
  const { data: existing } = await db.from("integrity_flags").select("id").eq("subject_id", subjectId).eq("reason", "possible_ai_generated").maybeSingle();
  if (existing) return;
  const q = FOLLOW_UPS[Math.floor(Math.random() * FOLLOW_UPS.length)];
  await db.from("integrity_flags").insert({ user_id: userId, subject_type: subjectType, subject_id: subjectId, reason: "possible_ai_generated", follow_up_question: q });
}
