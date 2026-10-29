import { db } from "../lib/supabase.js";
import { embed, toPgVector } from "./embeddings.js";

export type Exemplar = { title: string; body: string; score: number };

/**
 * Two calibration exemplars for a rubric: the closest graded sample at or above 70 and the
 * closest below 70. With embeddings, "closest" means most similar to the submission;
 * without, it means nearest to 80 and 55 respectively.
 */
export async function exemplarsFor(rubricId: string, submission: string): Promise<Exemplar[]> {
  const { data: docs } = await db
    .from("kb_documents")
    .select("id, title, body, score")
    .eq("kind", "exemplar")
    .eq("rubric_id", rubricId)
    .eq("status", "approved");
  if (!docs?.length) return [];

  let ranked = docs;
  const vec = await embed(submission);
  if (vec) {
    const { data: matches } = await db.rpc("match_kb_chunks", { query_embedding: toPgVector(vec), filter_role: null, filter_kinds: ["exemplar"], match_count: 20 });
    const order = new Map<string, number>((matches ?? []).map((m: { document_id: string; similarity: number }) => [m.document_id, m.similarity]));
    ranked = [...docs].sort((a, b) => (order.get(b.id) ?? -1) - (order.get(a.id) ?? -1));
  }
  const above = vec ? ranked.find((d) => Number(d.score) >= 70) : [...docs].filter((d) => Number(d.score) >= 70).sort((a, b) => Math.abs(Number(a.score) - 80) - Math.abs(Number(b.score) - 80))[0];
  const below = vec ? ranked.find((d) => Number(d.score) < 70) : [...docs].filter((d) => Number(d.score) < 70).sort((a, b) => Math.abs(Number(a.score) - 55) - Math.abs(Number(b.score) - 55))[0];
  return [above, below].filter(Boolean).map((d) => ({ title: d!.title, body: d!.body.slice(0, 6000), score: Number(d!.score) }));
}

export type Retrieved = { title: string; content: string; similarity: number };

export async function retrieveForMentor(roleId: string, query: string, k = 4): Promise<Retrieved[]> {
  const vec = await embed(query);
  if (!vec) return keywordRetrieve(roleId, query, k);
  const { data } = await db.rpc("match_kb_chunks", {
    query_embedding: toPgVector(vec), filter_role: roleId, filter_kinds: ["reference", "style_guide", "project_doc", "hint"], match_count: k,
  });
  return (data ?? []).map((d: { title: string; content: string; similarity: number }) => ({ title: d.title, content: d.content, similarity: d.similarity }));
}

/** Without embeddings: the role's guides and references, ranked by shared words with the question. */
async function keywordRetrieve(roleId: string, query: string, k: number): Promise<Retrieved[]> {
  const { data } = await db
    .from("kb_documents")
    .select("title, body, role_id")
    .eq("status", "approved")
    .in("kind", ["reference", "style_guide", "project_doc", "hint"])
    .or(`role_id.eq.${roleId},role_id.is.null`)
    .limit(100);
  const words = new Set(query.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  return (data ?? [])
    .map((d) => {
      const text = `${d.title} ${d.body}`.toLowerCase();
      const hits = [...words].filter((w) => text.includes(w)).length;
      // The role's own guide is always worth including, even with no word overlap.
      const similarity = hits / Math.max(1, words.size) + (d.role_id === roleId ? 0.25 : 0);
      return { title: d.title, content: d.body, similarity };
    })
    .filter((d) => d.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.min(k, 2));
}

/** Stored FAQ answer when the question is close enough (no LLM call). */
export async function faqLookup(roleId: string, question: string, threshold: number): Promise<{ answer: string; similarity: number } | null> {
  const vec = await embed(question);
  if (vec) {
    const { data } = await db.rpc("match_faq", { query_embedding: toPgVector(vec), filter_role: roleId, match_count: 1 });
    const top = data?.[0] as { answer: string; similarity: number } | undefined;
    return top && top.similarity >= threshold ? top : null;
  }
  // No embeddings: exact-ish keyword match on the question text.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const { data } = await db.from("faq").select("question, answer, role_id").eq("status", "approved");
  const hit = (data ?? []).find((f) => (!f.role_id || f.role_id === roleId) && norm(f.question) === norm(question));
  return hit ? { answer: hit.answer, similarity: 1 } : null;
}
