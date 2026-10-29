import { db } from "../lib/supabase.js";
import { HttpError, notFound } from "../lib/errors.js";
import { embed, toPgVector } from "../ai/embeddings.js";
import { aiConfigured, callStructured, AiBudgetError, AiOutputError, AiUnavailableError } from "../ai/aiClient.js";
import { HELP_RULES, PROMPT_VERSIONS } from "../ai/prompts.js";
import { HelpReply } from "../ai/schemas.js";
import { PLATFORM_GUIDE } from "../content/helpGuide.js";

const DAILY_LIMIT = 40;
const CONFIDENT = 0.6; // normalised lexical score above which we answer straight from the FAQ
const RELATED = 0.25;

type Doc = { id: string; kind: "faq" | "kb"; title: string; body: string; role_id: string | null; tokens: string[] };

const STOP = new Set("a an the and or but if then of to in on at for with by from is are was were be been am i me my you your we our it its this that these those do does did can could should would will how what when where why which who whom about into over can't don't i'm".split(" "));
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");
export const tokenize = (s: string) =>
  s.toLowerCase().replace(/₦/g, " naira ").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);

// Everyday phrasings → the words the FAQ uses (applied to questions, after tokenizing).
const SYNONYMS: Record<string, string[]> = {
  money: ["refund", "payment"], back: ["refund"], reimburse: ["refund"], price: ["cost"], fee: ["cost"], expensive: ["cost"],
  pay: ["payment"], paid: ["payment"], charge: ["payment"], card: ["payment"], transfer: ["payment"], ussd: ["payment"],
  login: ["sign"], signin: ["sign"], log: ["sign"], password: ["password", "reset"], verify: ["verification", "email"],
  cert: ["certificate"], certified: ["certificate"], squad: ["team"], teammate: ["team"], group: ["team"],
  exam: ["test"], quiz: ["test"], assessment: ["test"], retake: ["fail", "attempt"], retry: ["attempt"],
  job: ["offer"], internship: ["offer"], hire: ["opportunitie"], employer: ["certificate", "verify"],
  delete: ["delete", "account"], remove: ["delete"], parent: ["guardian"], mum: ["guardian"], dad: ["guardian"],
  bug: ["problem", "report"], broken: ["problem", "report"], complain: ["report"], contact: ["report"],
};
const expand = (tokens: string[]) => [...new Set(tokens.flatMap((t) => [t, ...(SYNONYMS[t] ?? []).map(stem)]))];

let aiFlag: { at: number; on: boolean } | null = null;
let corpus: { at: number; docs: Doc[]; df: Map<string, number>; avgLen: number } | null = null;

async function loadCorpus() {
  if (corpus && Date.now() - corpus.at < 5 * 60_000) return corpus;
  const [{ data: faq }, { data: kb }] = await Promise.all([
    db.from("faq").select("id, role_id, question, answer").eq("status", "approved"),
    // Never exemplars: those are graded sample answers used for calibration.
    db.from("kb_documents").select("id, role_id, title, body").eq("status", "approved").in("kind", ["faq", "reference", "style_guide", "project_doc"]),
  ]);
  const docs: Doc[] = [
    ...(faq ?? []).map((f) => ({ id: f.id, kind: "faq" as const, title: f.question, body: f.answer, role_id: f.role_id, tokens: [...tokenize(f.question), ...tokenize(f.question), ...tokenize(f.answer)] })),
    ...(kb ?? []).map((k) => ({ id: k.id, kind: "kb" as const, title: k.title, body: k.body.slice(0, 2000), role_id: k.role_id, tokens: [...tokenize(k.title), ...tokenize(k.body.slice(0, 2000))] })),
  ];
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = docs.reduce((s, d) => s + d.tokens.length, 0) / Math.max(1, docs.length);
  corpus = { at: Date.now(), docs, df, avgLen };
  return corpus;
}
export const resetHelpCorpus = () => {
  corpus = null;
  aiFlag = null;
};

/**
 * The help bot is retrieval-only by default: it answers from the FAQ and knowledge base and hands
 * anything else to a person. An LLM rewrite of the retrieved answer only runs when an admin turns on
 * feature_flags['help_bot'] with value {"ai": true}.
 */
export async function helpAiEnabled() {
  if (!aiFlag || Date.now() - aiFlag.at > 60_000) {
    const { data } = await db.from("feature_flags").select("enabled, value").eq("key", "help_bot").maybeSingle();
    aiFlag = { at: Date.now(), on: Boolean(data?.enabled && (data.value as { ai?: boolean } | null)?.ai) };
  }
  return aiFlag.on;
}

/** BM25 over FAQ questions (weighted double) and answers, normalised to 0–1 against a perfect match. */
export async function search(question: string, roleId: string | null, k = 4) {
  const c = await loadCorpus();
  const q = expand(tokenize(question));
  if (!q.length) return [];
  const N = c.docs.length;
  const idf = (t: string) => Math.log(1 + (N - (c.df.get(t) ?? 0) + 0.5) / ((c.df.get(t) ?? 0) + 0.5));
  const bm25 = (d: Doc) => {
    let s = 0;
    for (const t of q) {
      const tf = d.tokens.filter((x) => x === t).length;
      if (!tf) continue;
      s += idf(t) * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.tokens.length / c.avgLen))));
    }
    return s;
  };
  const best = q.reduce((s, t) => s + idf(t) * 1.6, 0) || 1;
  let ranked = c.docs
    .filter((d) => !d.role_id || !roleId || d.role_id === roleId)
    .map((d) => ({ doc: d, score: Math.min(1, bm25(d) / best) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // With embeddings switched on, blend in semantic similarity from pgvector.
  const vec = await embed(question);
  if (vec) {
    const { data } = await db.rpc("match_faq", { query_embedding: toPgVector(vec), filter_role: roleId, match_count: 5 });
    const sim = new Map<string, number>((data ?? []).map((r: { id: string; similarity: number }) => [r.id, r.similarity]));
    ranked = ranked.map((r) => ({ ...r, score: Math.max(r.score, sim.get(r.doc.id) ?? 0) })).sort((a, b) => b.score - a.score);
  }
  return ranked.slice(0, k);
}

const WINDOW_MS = 30 * 60_000;
// Someone asking about something broken or account-specific usually needs a person, not the FAQ.
const PROBLEM = /\b(won'?t|can'?t|cannot|isn'?t|doesn'?t|didn'?t|not working|not showing|error|bug|broken|stuck|missing|failed|charged|wrong|still)\b/i;

type PriorQuery = { question: string; answered: boolean; helpful: boolean | null; top_faq_id: string | null };
export type HelpTurn = { from: "user" | "bot"; text: string };

const overlap = (a: string, b: string) => {
  const x = new Set(tokenize(a));
  const y = new Set(tokenize(b));
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  return both / new Set([...x, ...y]).size;
};

/**
 * Has this person hit a dead end with the bot? Looks at their questions from the last 30 minutes.
 * `stuck` means more AI won't help: skip the model and point them to a person.
 */
export function deadEnd(prior: PriorQuery[], question: string) {
  const repeat = prior.some((p) => overlap(p.question, question) >= 0.6);
  const unanswered = prior.filter((p) => !p.answered).length;
  const unhelpful = prior.some((p) => p.helpful === false);
  const stuck = unanswered >= 3 || prior.length >= 10 || (repeat && (unhelpful || unanswered >= 1));
  const reason = stuck
    ? "It looks like I'm not getting you an answer. A person from the Huzzler team can sort this out."
    : repeat
      ? "You've asked about this already, so a person may get you there faster."
      : unanswered >= 2 || unhelpful
        ? "If these answers aren't helping, a person from the Huzzler team can take a look."
        : prior.length + 1 >= 6
          ? "Still looking? A person from the Huzzler team can help directly."
          : null;
  return { stuck, reason };
}

export async function askHelp(userId: string, question: string, history: HelpTurn[] = []) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [{ count }, { data: recent }, { data: profile }, { data: journey }] = await Promise.all([
    db.from("help_queries").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", start.toISOString()),
    db.from("help_queries").select("question, answered, helpful, top_faq_id").eq("user_id", userId).gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString()).order("created_at", { ascending: false }).limit(20),
    db.from("profiles").select("role_id").eq("id", userId).single(),
    db.from("user_journey").select("status").eq("user_id", userId).maybeSingle(),
  ]);
  if ((count ?? 0) >= DAILY_LIMIT) throw new HttpError(429, "You've asked a lot of questions today. Report an issue and a person will help.", "HELP_LIMIT");

  const prior = (Array.isArray(recent) ? recent : []) as PriorQuery[];
  const end = deadEnd(prior, question);
  const hits = await search(question, profile?.role_id ?? null);
  const top = hits[0];
  const related = hits
    .filter((h) => h.doc.kind === "faq" && h !== top && h.score >= RELATED)
    .slice(0, 3)
    .map((h) => h.doc.title);

  let answer: string | null = null;
  let source: "faq" | "ai" | "none" = "none";
  let needsPerson = false;

  if (top && top.doc.kind === "faq" && top.score >= CONFIDENT) {
    answer = top.doc.body;
    source = "faq";
  } else if (!end.stuck && aiConfigured() && (await helpAiEnabled())) {
    // The platform guide is always in the reference, so greetings and "how do I start" questions
    // get answered even when no FAQ matches.
    const turns = history.slice(-6).map((t) => `${t.from === "user" ? "User" : "Huzzler help"}: ${t.text.slice(0, 600)}`).join("\n");
    try {
      const { data } = await callStructured({
        feature: "help_bot",
        userId,
        roleId: profile?.role_id ?? null,
        promptVersion: PROMPT_VERSIONS.help,
        cachedSystem: [HELP_RULES, `<guide>\n${PLATFORM_GUIDE}\n</guide>`],
        schema: HelpReply,
        userContent: [
          {
            type: "text",
            text: [
              `<user>\nJourney stage: ${journey?.status ?? "unknown"}\n</user>`,
              hits.length ? `<reference>\n${hits.map((h) => `## ${h.doc.title}\n${h.doc.body}`).join("\n\n")}\n</reference>` : "",
              turns ? `<conversation>\n${turns}\n</conversation>` : "",
              `<question>\n${question}\n</question>`,
            ].filter(Boolean).join("\n\n"),
          },
        ],
      });
      if (data.answered_from_reference) {
        answer = data.answer;
        source = "ai";
      }
      needsPerson = data.needs_person;
    } catch (err) {
      if (!(err instanceof AiUnavailableError || err instanceof AiBudgetError || err instanceof AiOutputError)) throw err;
    }
  }
  if (!answer && top && top.doc.kind === "faq" && top.score >= 0.3) {
    answer = top.doc.body;
    source = "faq";
  }
  if (!answer || source === "faq") needsPerson ||= PROBLEM.test(question);

  const { data: logged } = await db
    .from("help_queries")
    .insert({ user_id: userId, question, answered: Boolean(answer), source, top_faq_id: top?.doc.kind === "faq" ? top.doc.id : null, score: top?.score ?? 0 })
    .select("id")
    .single();

  const handoff =
    end.reason ??
    (needsPerson
      ? "This sounds like something a person should look at. Send it to the Huzzler team and they'll reply here."
      : !answer
        ? "I don't have an answer for that. A person from the Huzzler team can help."
        : null);

  return {
    id: logged?.id ?? null,
    answer: answer ?? (end.stuck ? "Let's get you to a person instead of going round in circles." : "I'm not sure about that one."),
    source,
    related: end.stuck ? [] : related,
    handoff,
  };
}

export async function helpFeedback(userId: string, queryId: string, helpful: boolean) {
  const { data } = await db.from("help_queries").update({ helpful }).eq("id", queryId).eq("user_id", userId).select("id");
  if (!data?.length) throw notFound();
  return { ok: true };
}

export async function suggestedQuestions(roleId: string | null) {
  const { data } = await db.from("faq").select("question, role_id").eq("status", "approved").limit(60);
  const general = (data ?? []).filter((f) => !f.role_id);
  const mine = (data ?? []).filter((f) => f.role_id === roleId);
  return [...mine.slice(0, 1), ...general.slice(0, 4)].map((f) => f.question);
}
