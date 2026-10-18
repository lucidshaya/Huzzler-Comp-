import { round2 } from "./grading.js";

// Mechanical graders. No AI. Each returns a 0-100 score plus a per-item breakdown that the
// results page can show.

export type AutoResult = { score: number; criteria: Record<string, { score: number; note: string }>; feedback: string };

export function gradeMcq(answers: Record<string, string>, key: { answers: Record<string, string>; explanations?: Record<string, string> }): AutoResult {
  const ids = Object.keys(key.answers);
  const criteria: AutoResult["criteria"] = {};
  let correct = 0;
  for (const id of ids) {
    const ok = answers[id] === key.answers[id];
    if (ok) correct++;
    criteria[id] = { score: ok ? 100 : 0, note: ok ? "Correct" : key.explanations?.[id] ?? "Incorrect" };
  }
  const score = ids.length ? round2((correct / ids.length) * 100) : 0;
  return { score, criteria, feedback: `${correct} of ${ids.length} correct.` };
}

/** Situational judgement: each option carries 0-3 points. */
export function gradeSjt(answers: Record<string, string>, key: { scores: Record<string, Record<string, number>>; rationale?: Record<string, string> }): AutoResult {
  const criteria: AutoResult["criteria"] = {};
  let got = 0;
  let max = 0;
  for (const [qid, opts] of Object.entries(key.scores)) {
    const best = Math.max(...Object.values(opts));
    const pts = opts[answers[qid]] ?? 0;
    got += pts;
    max += best;
    criteria[qid] = { score: best ? round2((pts / best) * 100) : 0, note: key.rationale?.[qid] ?? "" };
  }
  return { score: max ? round2((got / max) * 100) : 0, criteria, feedback: "Scored against how experienced teammates handle these situations." };
}

/** Ranking vs reference using normalised Spearman footrule distance. */
export function gradeRanking(order: string[], key: { order: string[]; rationale?: string }): AutoResult {
  const n = key.order.length;
  const pos = new Map(order.map((id, i) => [id, i]));
  let dist = 0;
  key.order.forEach((id, i) => {
    dist += Math.abs((pos.get(id) ?? n) - i);
  });
  const maxDist = Math.floor((n * n) / 2);
  const score = round2(Math.max(0, 1 - dist / maxDist) * 100);
  const criteria: AutoResult["criteria"] = {};
  key.order.slice(0, 3).forEach((id, i) => {
    const p = pos.get(id);
    criteria[`top_${i + 1}`] = { score: p === i ? 100 : p !== undefined && Math.abs(p - i) <= 1 ? 50 : 0, note: `Reference position ${i + 1}: ${id}` };
  });
  return { score, criteria, feedback: key.rationale ?? "Compared with the reference ranking." };
}

/**
 * Seeded issues: the candidate flags targets (line numbers, element ids, bug ids) with a category.
 * F1 over targets, with half credit for the right target but the wrong category.
 */
export function gradeSeededIssues(
  found: Array<{ target: string; category: string }>,
  key: { issues: Array<{ target: string; category: string; description?: string }> },
): AutoResult {
  const expected = new Map(key.issues.map((i) => [i.target, i]));
  const seen = new Set<string>();
  let credit = 0;
  for (const f of found) {
    if (seen.has(f.target)) continue;
    seen.add(f.target);
    const e = expected.get(f.target);
    if (e) credit += e.category === f.category ? 1 : 0.5;
  }
  const precision = seen.size ? credit / seen.size : 0;
  const recall = key.issues.length ? credit / key.issues.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const criteria: AutoResult["criteria"] = {
    recall: { score: round2(recall * 100), note: `Found ${round2(credit)} of ${key.issues.length} seeded issues` },
    precision: { score: round2(precision * 100), note: `${seen.size} flagged in total` },
  };
  return { score: round2(f1 * 100), criteria, feedback: "Matched against the issues seeded into the material." };
}

export function gradeNumeric(answers: Record<string, string | number>, key: { answers: Record<string, { value: number; tolerance?: number; explanation?: string }> }): AutoResult {
  const criteria: AutoResult["criteria"] = {};
  let ok = 0;
  const ids = Object.keys(key.answers);
  for (const id of ids) {
    const k = key.answers[id];
    const raw = answers[id];
    const v = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[,%₦\s]/g, ""));
    const tol = k.tolerance ?? Math.max(0.01, Math.abs(k.value) * 0.01);
    const good = Number.isFinite(v) && Math.abs(v - k.value) <= tol;
    if (good) ok++;
    criteria[id] = { score: good ? 100 : 0, note: good ? "Within tolerance" : k.explanation ?? `Expected about ${k.value}` };
  }
  return { score: ids.length ? round2((ok / ids.length) * 100) : 0, criteria, feedback: `${ok} of ${ids.length} answers within tolerance.` };
}

/** Result-set comparison for SQL tasks (order-insensitive unless the key says otherwise). */
export function compareResultSets(actual: string[][], expected: string[][], ordered = false): boolean {
  const norm = (rows: string[][]) => rows.map((r) => r.map((c) => String(c).trim()).join("\u0001"));
  const a = norm(actual);
  const e = norm(expected);
  if (a.length !== e.length) return false;
  if (!ordered) {
    a.sort();
    e.sort();
  }
  return a.every((row, i) => row === e[i]);
}
