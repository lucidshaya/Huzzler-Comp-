import crypto from "node:crypto";
import { z } from "zod";
import { db, must, ok } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { notify } from "../lib/notify.js";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../lib/errors.js";
import { env } from "../config/env.js";
import { MAX_ATTEMPTS, PASS_MARK, RETAKE_WAIT_DAYS, TEST_WEIGHTS } from "../domain/constants.js";
import { onboardingOutcome } from "../domain/grading.js";
import { gradeMcq, gradeNumeric, gradeRanking, gradeSeededIssues, gradeSjt, compareResultSets, type AutoResult } from "../domain/autograde.js";
import { getJourney, transition } from "./journey.js";
import { getProfile } from "./profile.js";
import { enqueue } from "../jobs/queue.js";
import { gradeSubjectWithAi } from "./aiGrading.js";
import { LANG as LANG_IDS, runHiddenTests, runInSandbox, runJsLocally, runSql, sandboxConfigured, SandboxUnavailableError } from "./sandbox.js";
import { checkSimilarity } from "./integrity.js";

const DAY = 86_400_000;
const LATE_GRACE_MS = 2 * 60_000;
const TEST_NOS = [1, 2, 3, 4, 5];

// Answer shapes per test kind (validated on submit).
const AnswerSchemas = {
  mcq: z.object({ answers: z.record(z.string(), z.string()) }),
  sjt: z.object({ answers: z.record(z.string(), z.string()) }),
  ranking: z.object({ order: z.array(z.string()).max(50) }),
  seeded_issues: z.object({ found: z.array(z.object({ target: z.string(), category: z.string() })).max(100) }),
  numeric: z.object({ answers: z.record(z.string(), z.union([z.string(), z.number()])), notes: z.string().max(5000).optional() }),
  sql_result: z.object({ sql: z.string().min(1).max(10_000) }),
  code_sandbox: z.object({ code: z.string().min(1).max(50_000), notes: z.string().max(5000).optional() }),
  ai_rubric: z.object({ text: z.string().max(30_000), image_path: z.string().optional(), links: z.array(z.string().url()).max(5).optional() }),
} as const;
type Kind = keyof typeof AnswerSchemas;

/** Picks an approved version, rotating so a retake gets a different but equivalent test. */
async function pickTestVersion(roleId: string, testNo: number, userId: string, avoidIds: string[]) {
  const { data } = await db.from("test_bank").select("id, version").eq("role_id", roleId).eq("test_no", testNo).eq("status", "approved").order("version");
  if (!data?.length) throw new Error(`No approved test ${testNo} for ${roleId}`);
  const fresh = data.filter((t) => !avoidIds.includes(t.id));
  const pool = fresh.length ? fresh : data;
  const idx = parseInt(crypto.createHash("sha256").update(`${userId}:${testNo}:${avoidIds.length}`).digest("hex").slice(0, 8), 16) % pool.length;
  return pool[idx].id as string;
}

export async function currentAttempt(userId: string) {
  const { data } = await db.from("test_attempts").select("*").eq("user_id", userId).order("attempt_no", { ascending: false }).limit(1).maybeSingle();
  return data;
}

/**
 * Repairs attempt states left by older versions or admin overrides, so nobody is stuck:
 * - an attempt with no tests (its creation failed half-way) is removed;
 * - an attempt whose tests are all graded (e.g. every test carried over) is finalised;
 * - a journey that says "testing" while the latest attempt already finished is brought in line.
 */
export async function reconcileAttempts(userId: string) {
  try {
    return await reconcile(userId);
  } catch (err) {
    logger.error({ err: String(err), userId }, "attempt reconcile failed");
    return currentAttempt(userId);
  }
}

async function reconcile(userId: string) {
  let attempt = await currentAttempt(userId);
  if (!attempt) return null;
  if (attempt.status === "in_progress") {
    const { count } = await db.from("test_submissions").select("id", { count: "exact", head: true }).eq("attempt_id", attempt.id);
    if (!count) {
      await db.from("test_attempts").delete().eq("id", attempt.id);
      logger.warn({ userId, attemptId: attempt.id }, "removed an attempt with no tests");
      attempt = await currentAttempt(userId);
      if (!attempt) return null;
    }
  }
  if (attempt.status === "in_progress" || attempt.status === "grading") {
    await maybeFinalizeAttempt(attempt.id);
    attempt = await currentAttempt(userId);
  }
  const j = await getJourney(userId);
  if (attempt && j.status === "TESTING" && (attempt.status === "passed" || attempt.status === "failed")) {
    if (attempt.status === "passed") {
      await transition(userId, "TESTS_PASSED", "repaired: latest attempt passed", { extra: { attempts_used: Math.max(1, j.attempts_used) } });
      await enqueue("generate_offers", { userId });
    } else {
      await transition(userId, "TESTS_FAILED", "repaired: latest attempt failed", { extra: { attempts_used: Math.max(1, j.attempts_used) } });
    }
  }
  return attempt;
}

export async function startAttempt(userId: string) {
  await reconcileAttempts(userId);
  const j = await getJourney(userId);
  const profile = await getProfile(userId);
  if (!profile.role_id) throw badRequest("Choose a field first.");
  const prev = await currentAttempt(userId);

  // A retake that was created but never switched the journey to testing: carry on with it.
  if (prev?.status === "in_progress" && (j.status === "PAID" || j.status === "TESTS_FAILED")) {
    if (j.status === "TESTS_FAILED") await transition(userId, "TESTING", `attempt ${prev.attempt_no} resumed`);
    return prev;
  }

  if (j.status === "PAID") {
    if (prev) return prev;
  } else if (j.status === "TESTS_FAILED") {
    if (j.attempts_used >= MAX_ATTEMPTS) throw forbidden("You've used all the attempts included in your plan.", "NO_ATTEMPTS_LEFT");
    if (j.next_attempt_at && new Date(j.next_attempt_at) > new Date()) throw forbidden(`Your retake opens on ${new Date(j.next_attempt_at).toDateString()}.`, "RETAKE_WAIT");
  } else if (j.status === "TESTING" && prev?.status === "in_progress") {
    return prev;
  } else {
    throw conflict("Onboarding tests aren't available right now.", "NOT_ELIGIBLE");
  }

  const attemptNo = (prev?.attempt_no ?? 0) + 1;
  const inserted = await db.from("test_attempts").insert({ user_id: userId, role_id: profile.role_id, attempt_no: attemptNo }).select().single();
  // 23514: the database still has the old two-attempt rule (migration 20261029000003 not applied yet).
  if (inserted.error?.code === "23514") {
    logger.error({ userId, attemptNo }, "test_attempts attempt_no check rejected a retake");
    throw conflict("We couldn't open this retake. Our team has been told; please report it from Help & support so we can open it for you.", "ATTEMPT_BLOCKED");
  }
  const attempt = must(inserted, "attempt");

  // Attempt 2 retakes only tests below 70; passing scores carry over (if the field didn't change).
  const carried = new Map<number, { score: number; test_bank_id: string }>();
  const prevBankIds: string[] = [];
  if (prev) {
    const { data: prevSubs } = await db.from("test_submissions").select("test_no, score, test_bank_id").eq("attempt_id", prev.id);
    for (const s of prevSubs ?? []) {
      prevBankIds.push(s.test_bank_id);
      if (prev.role_id === profile.role_id && s.score !== null && Number(s.score) >= PASS_MARK) carried.set(s.test_no, { score: Number(s.score), test_bank_id: s.test_bank_id });
    }
  }

  try {
    const rows = [];
    for (const testNo of TEST_NOS) {
      const c = carried.get(testNo);
      rows.push(
        c
          ? { attempt_id: attempt.id, user_id: userId, test_no: testNo, test_bank_id: c.test_bank_id, carried_over: true, score: c.score, status: "graded" }
          : { attempt_id: attempt.id, user_id: userId, test_no: testNo, test_bank_id: await pickTestVersion(profile.role_id, testNo, userId, prevBankIds), carried_over: false, score: null, status: "not_started" },
      );
    }
    ok(await db.from("test_submissions").insert(rows), "submissions");
  } catch (err) {
    // Never leave an empty attempt behind: it would block the next retake.
    await db.from("test_attempts").delete().eq("id", attempt.id);
    throw err;
  }
  await transition(userId, "TESTING", `attempt ${attemptNo} started`);
  // Everything carried over (e.g. scores raised on appeal): nothing left to take, so finish now.
  if (carried.size === TEST_NOS.length) await maybeFinalizeAttempt(attempt.id);
  return (await currentAttempt(userId)) ?? attempt;
}

export async function attemptOverview(userId: string) {
  const attempt = await reconcileAttempts(userId);
  if (!attempt) return null;
  const { data: subs } = await db
    .from("test_submissions")
    .select("id, test_no, status, score, carried_over, started_at, deadline_at, submitted_at, test_bank:test_bank_id(title, kind, time_limit_min)")
    .eq("attempt_id", attempt.id)
    .order("test_no");
  return { attempt, tests: (subs ?? []).map((s) => ({ ...s, weight: TEST_WEIGHTS[s.test_no] })) };
}

/** The submission for this test in the user's latest attempt (one round trip via a join). */
async function getSubmission(userId: string, testNo: number) {
  const { data } = await db
    .from("test_submissions")
    .select("*, attempt:attempt_id!inner(id, attempt_no, status, user_id, role_id)")
    .eq("user_id", userId)
    .eq("test_no", testNo)
    .order("attempt_no", { referencedTable: "attempt", ascending: false })
    .limit(5);
  const rows = (data ?? []) as Array<Record<string, any> & { attempt: { id: string; attempt_no: number; status: string } }>;
  const latest = rows.sort((a, b) => b.attempt.attempt_no - a.attempt.attempt_no)[0];
  if (!latest || latest.attempt.status !== "in_progress") throw conflict("No attempt in progress.");
  const { attempt, ...sub } = latest;
  return { attempt, sub: sub as Record<string, any> };
}

/** Tests are taken in order: every earlier test must be submitted (or carried over). */
async function assertInOrder(attemptId: string, testNo: number) {
  const { data } = await db.from("test_submissions").select("test_no, status").eq("attempt_id", attemptId).lt("test_no", testNo);
  const blocked = (data ?? []).find((s) => s.status === "not_started" || s.status === "in_progress");
  if (blocked) throw forbidden(`Finish test ${blocked.test_no} first.`, "OUT_OF_ORDER");
}

export async function getTest(userId: string, testNo: number) {
  const { attempt, sub } = await getSubmission(userId, testNo);
  // answer_key is never selected.
  const [, bankRes] = await Promise.all([
    assertInOrder(attempt.id, testNo),
    db.from("test_bank").select("id, title, kind, content, time_limit_min, test_no").eq("id", sub.test_bank_id).single(),
  ]);
  const bank = must(bankRes, "test");
  return {
    submission: { id: sub.id, status: sub.status, draft: sub.draft, started_at: sub.started_at, deadline_at: sub.deadline_at, carried_over: sub.carried_over, score: sub.score },
    test: { ...bank, weight: TEST_WEIGHTS[testNo], requires_declaration: testNo === 3 || testNo === 4 },
  };
}

export async function startTest(userId: string, testNo: number) {
  const { attempt, sub } = await getSubmission(userId, testNo);
  await assertInOrder(attempt.id, testNo);
  if (sub.status !== "not_started") return getTest(userId, testNo);
  const bank = must(await db.from("test_bank").select("time_limit_min").eq("id", sub.test_bank_id).single(), "test");
  const now = new Date();
  await db
    .from("test_submissions")
    .update({ status: "in_progress", started_at: now.toISOString(), deadline_at: new Date(now.getTime() + bank.time_limit_min * 60_000).toISOString() })
    .eq("id", sub.id)
    .eq("status", "not_started");
  return getTest(userId, testNo);
}

export async function saveDraft(userId: string, testNo: number, draft: unknown) {
  const { sub } = await getSubmission(userId, testNo);
  if (sub.status !== "in_progress") throw conflict("This test isn't in progress.");
  if (sub.deadline_at && Date.now() > new Date(sub.deadline_at).getTime() + LATE_GRACE_MS) throw conflict("Time is up.", "DEADLINE_PASSED");
  if (JSON.stringify(draft).length > 60_000) throw badRequest("Draft too large");
  await db.from("test_submissions").update({ draft }).eq("id", sub.id);
  return { saved: true, at: new Date().toISOString() };
}

// "Run" while a code or SQL test is open: shows the learner's own output (console.log, errors, or the
// rows their query returns). Hidden tests and the expected result are never run or revealed here.
const runs = new Map<string, number[]>();
export async function runCode(userId: string, testNo: number, source: string) {
  const now = Date.now();
  const recent = (runs.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 15) throw new HttpError(429, "That's a lot of runs in a minute. Wait a few seconds and try again.", "RUN_LIMIT");
  runs.set(userId, [...recent, now]);

  const { sub } = await getSubmission(userId, testNo);
  if (sub.status !== "in_progress") throw conflict("This test isn't in progress.");
  const bank = must(await db.from("test_bank").select("kind, content, answer_key").eq("id", sub.test_bank_id).single(), "test");
  if (bank.kind === "sql_result") {
    const r = await runSql(bank.answer_key?.setup_sql ?? "", source);
    return r.ok ? { kind: "sql" as const, ok: true, rows: r.rows.slice(0, 50), total_rows: r.rows.length } : { kind: "sql" as const, ok: false, error: r.error };
  }
  if (bank.kind !== "code_sandbox") throw badRequest("This test has no code to run.");
  const lang = bank.content?.language === "typescript" ? LANG_IDS.typescript : LANG_IDS.javascript;
  const r = env.JUDGE0_URL ? await runInSandbox(lang, source) : await runJsLocally(source);
  return { kind: "code" as const, ok: !r.stderr, stdout: r.stdout.slice(0, 5000), error: r.stderr.slice(0, 2000) || null, status: r.status };
}

export async function submitTest(userId: string, testNo: number, body: { answers: unknown; ai_declaration?: boolean }) {
  const { sub } = await getSubmission(userId, testNo);
  if (sub.status !== "in_progress") throw conflict("This test isn't in progress.");
  const bank = must(await db.from("test_bank").select("kind").eq("id", sub.test_bank_id).single(), "test");
  const kind = bank.kind as Kind;

  // After the deadline (plus a small grace for slow networks) the last saved draft is submitted.
  const late = sub.deadline_at && Date.now() > new Date(sub.deadline_at).getTime() + LATE_GRACE_MS;
  const raw = late ? (sub.draft ?? {}) : body.answers;
  const parsed = AnswerSchemas[kind].safeParse(raw);
  if (!parsed.success) {
    if (!late) throw badRequest("Your answer is incomplete or in the wrong format.");
  }
  if ((testNo === 3 || testNo === 4) && !late && !body.ai_declaration) throw badRequest("Please confirm the work is your own.", "DECLARATION_REQUIRED");

  const { data: updated } = await db
    .from("test_submissions")
    .update({ answers: parsed.success ? parsed.data : raw, ai_declaration: Boolean(body.ai_declaration), status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", sub.id)
    .eq("status", "in_progress")
    .select("id");
  if (!updated?.length) throw conflict("Already submitted.");

  if (kind === "ai_rubric" || kind === "code_sandbox" || kind === "sql_result") {
    await db.from("test_submissions").update({ status: "grading" }).eq("id", sub.id);
    await enqueue("grade_test_submission", { submissionId: sub.id }, { jobId: `grade-sub-${sub.id}` });
  } else {
    await gradeTestSubmission(sub.id);
  }
  return { submitted: true, late: Boolean(late) };
}

/** Grades one submission (mechanical inline, sandbox/AI from the queue) then finalises the attempt if complete. */
export async function gradeTestSubmission(submissionId: string) {
  const sub = must(await db.from("test_submissions").select("*").eq("id", submissionId).single(), "submission");
  if (sub.status === "graded" || sub.status === "needs_review") return;
  const bank = must(await db.from("test_bank").select("*").eq("id", sub.test_bank_id).single(), "test");
  const answers = (sub.answers ?? {}) as any;
  const key = (bank.answer_key ?? {}) as any;

  const saveAuto = async (r: AutoResult, extra: { feedback?: string; needsReview?: boolean } = {}) => {
    await db.from("grades").insert({
      subject_type: "test_submission", subject_id: sub.id, user_id: sub.user_id, grader: "auto", score: r.score, criteria: r.criteria,
      feedback: extra.feedback ?? r.feedback, strengths: r.score >= PASS_MARK ? "Strong result on this test." : null,
      gaps: r.score < PASS_MARK ? "Review the items marked incorrect." : null, next_steps: [], needs_review: Boolean(extra.needsReview), rubric_version: `${bank.id}@v${bank.version}`,
    });
    await db.from("test_submissions").update({ score: r.score, status: extra.needsReview ? "needs_review" : "graded" }).eq("id", sub.id);
  };

  try {
    switch (bank.kind as Kind) {
      case "mcq":
        await saveAuto(gradeMcq(answers.answers ?? {}, key));
        break;
      case "sjt":
        await saveAuto(gradeSjt(answers.answers ?? {}, key));
        break;
      case "ranking":
        await saveAuto(gradeRanking(answers.order ?? [], key));
        break;
      case "seeded_issues":
        await saveAuto(gradeSeededIssues(answers.found ?? [], key));
        break;
      case "numeric":
        await saveAuto(gradeNumeric(answers.answers ?? {}, key));
        break;
      case "sql_result": {
        if (!sandboxConfigured()) throw new SandboxUnavailableError();
        const r = await runSql(key.setup_sql, answers.sql ?? "");
        const ok = r.ok && compareResultSets(r.rows, key.expected_rows, key.ordered);
        await saveAuto({ score: ok ? 100 : 0, criteria: { result: { score: ok ? 100 : 0, note: r.ok ? (ok ? "Result set matches" : "Result set differs from expected") : `SQL error: ${r.error}` } }, feedback: ok ? "Your query returns the right result." : "Your query's result doesn't match the expected result set." });
        break;
      }
      case "code_sandbox": {
        if (!sandboxConfigured()) throw new SandboxUnavailableError();
        const t = await runHiddenTests(key.language_id, answers.code ?? "", key.hidden_tests);
        const testScore = t.total ? (t.passed / t.total) * 100 : 0;
        if (bank.rubric_id) {
          // T3 for engineers: sandbox correctness + AI code review.
          const automated = `Hidden tests: ${t.passed}/${t.total} passed.\n${(t.failures ?? []).slice(0, 10).join("\n")}`;
          await gradeAi(sub, bank, `${answers.code}\n\nNotes:\n${answers.notes ?? ""}`, automated);
        } else {
          await saveAuto({ score: Math.round(testScore * 100) / 100, criteria: { hidden_tests: { score: testScore, note: `${t.passed}/${t.total} hidden tests passed` } }, feedback: (t.failures ?? []).slice(0, 5).join("\n") || "All hidden tests passed." });
        }
        break;
      }
      case "ai_rubric": {
        const automated = runTextChecks(answers.text ?? "", key.checks ?? {});
        await gradeAi(sub, bank, answers.text ?? "", automated, answers.links, await loadImage(sub.user_id, answers.image_path));
        break;
      }
    }
  } catch (err) {
    if (err instanceof SandboxUnavailableError) {
      await db.from("test_submissions").update({ status: "needs_review" }).eq("id", sub.id);
      logger.warn({ submissionId }, "sandbox not configured; submission sent to human review");
    } else {
      throw err;
    }
  }
  await maybeFinalizeAttempt(sub.attempt_id);
}

/** Cheap automated checks passed to the AI grader as ground truth (word count, required sections). */
function runTextChecks(text: string, checks: { min_words?: number; max_words?: number; required_sections?: string[] }) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const lines = [`Word count: ${words}`];
  if (checks.min_words && words < checks.min_words) lines.push(`Below the minimum of ${checks.min_words} words.`);
  if (checks.max_words && words > checks.max_words) lines.push(`Above the limit of ${checks.max_words} words.`);
  for (const s of checks.required_sections ?? []) lines.push(`Section "${s}": ${new RegExp(s, "i").test(text) ? "present" : "missing"}`);
  return lines.join("\n");
}

/** Loads the candidate's uploaded design (UI/UX T3) for multimodal review. Only their own files. */
async function loadImage(userId: string, path?: string) {
  if (!path || !path.startsWith(`${userId}/`)) return undefined;
  const { data } = await db.storage.from("submissions").download(path);
  if (!data || data.size > 5 * 1024 * 1024) return undefined;
  const ext = path.split(".").pop()?.toLowerCase();
  const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return [{ mediaType: mediaType as "image/png" | "image/jpeg" | "image/webp", base64: Buffer.from(await data.arrayBuffer()).toString("base64") }];
}

async function gradeAi(sub: any, bank: any, submission: string, automated: string, links?: string[], images?: Array<{ mediaType: "image/png" | "image/jpeg" | "image/webp"; base64: string }>) {
  const content = bank.content as { brief?: string; instructions?: string };
  const res = await gradeSubjectWithAi(
    { subjectType: "test_submission", subjectId: sub.id },
    {
      feature: "onboarding_grading",
      userId: sub.user_id,
      roleId: bank.role_id,
      rubricId: bank.rubric_id,
      taskPrompt: [content.instructions, content.brief].filter(Boolean).join("\n\n"),
      submission: links?.length ? `${submission}\n\nLinks: ${links.join(", ")}` : submission,
      automatedResults: images ? `${automated}\nA design image is attached.` : automated,
      images,
    },
  );
  if (res.state === "awaiting_ai") {
    await db.from("test_submissions").update({ status: "awaiting_ai" }).eq("id", sub.id);
    return;
  }
  await db.from("test_submissions").update({ score: res.score, status: res.state === "graded" ? "graded" : "needs_review" }).eq("id", sub.id);
  await checkSimilarity("test_submission", sub.id, sub.user_id, bank.id, submission).catch(() => {});
}

/** When all five tests have final scores, apply the pass rule and move the journey. */
export async function maybeFinalizeAttempt(attemptId: string) {
  const attempt = must(await db.from("test_attempts").select("*").eq("id", attemptId).single(), "attempt");
  if (attempt.status !== "in_progress" && attempt.status !== "grading") return;
  const { data: subs } = await db.from("test_submissions").select("test_no, status, score").eq("attempt_id", attemptId);
  if (!subs || subs.length < 5) return;
  if (subs.some((s) => s.status === "not_started" || s.status === "in_progress")) return;
  if (subs.some((s) => s.status !== "graded")) {
    if (attempt.status === "in_progress") await db.from("test_attempts").update({ status: "grading" }).eq("id", attemptId);
    return; // waiting on AI or human review
  }

  const scores = Object.fromEntries(subs.map((s) => [s.test_no, Number(s.score)]));
  const outcome = onboardingOutcome(scores);
  const { data: claimed } = await db
    .from("test_attempts")
    .update({ status: outcome.passed ? "passed" : "failed", weighted_score: outcome.weighted, completed_at: new Date().toISOString() })
    .eq("id", attemptId)
    .in("status", ["in_progress", "grading"])
    .select("id");
  if (!claimed?.length) return;

  const { data: grades } = await db.from("grades").select("subject_id, strengths, gaps, next_steps").eq("user_id", attempt.user_id).eq("is_final", true).eq("subject_type", "test_submission");
  await db.from("test_results").upsert(
    {
      attempt_id: attemptId, user_id: attempt.user_id, scores, weighted_score: outcome.weighted, passed: outcome.passed,
      summary: { failed_tests: outcome.failedTests, below_floor: outcome.belowFloor, next_steps: (grades ?? []).flatMap((g) => g.next_steps ?? []).slice(0, 8) },
    },
    { onConflict: "attempt_id" },
  );

  const j = await getJourney(attempt.user_id);
  // Counted from the journey (an admin can reset it), not from attempt_no, which only ever grows.
  // Re-finalising after an appeal doesn't use up another attempt.
  const refinalised = Boolean(attempt.completed_at);
  const attemptsUsed = refinalised ? Math.max(1, j.attempts_used) : j.attempts_used + 1;
  if (outcome.passed) {
    await transition(attempt.user_id, "TESTS_PASSED", `passed with ${outcome.weighted}`, { extra: { attempts_used: attemptsUsed } });
    await notify(attempt.user_id, "onboarding.passed", "You're verified!", `You passed onboarding with ${outcome.weighted}%. Your job offers are on the way.`);
    await enqueue("generate_offers", { userId: attempt.user_id });
  } else {
    const canRetake = attemptsUsed < MAX_ATTEMPTS;
    // The first failure gets an immediate retry; later ones wait.
    const waitDays = attemptsUsed === 1 ? 0 : RETAKE_WAIT_DAYS;
    const nextAt = refinalised ? j.next_attempt_at : canRetake && waitDays ? new Date(Date.now() + waitDays * DAY).toISOString() : null;
    await transition(attempt.user_id, "TESTS_FAILED", `scored ${outcome.weighted}`, {
      extra: { attempts_used: attemptsUsed, next_attempt_at: nextAt },
    });
    await notify(
      attempt.user_id,
      "onboarding.failed",
      "Your results are ready",
      canRetake ? `You scored ${outcome.weighted}%. You can retake the tests below 70% ${waitDays ? `in ${waitDays} days` : "right away"}.` : `You scored ${outcome.weighted}%. See your feedback for what to work on next.`,
    );
  }
}

export async function attemptResults(userId: string, attemptId?: string) {
  const attempt = attemptId
    ? must(await db.from("test_attempts").select("*").eq("id", attemptId).eq("user_id", userId).single(), "attempt")
    : await currentAttempt(userId);
  if (!attempt) throw notFound("No attempt yet");
  const { data: subs } = await db
    .from("test_submissions")
    .select("id, test_no, status, score, carried_over, test_bank:test_bank_id(title, kind)")
    .eq("attempt_id", attempt.id)
    .order("test_no");
  const ids = (subs ?? []).map((s) => s.id);
  const { data: grades } = await db
    .from("grades")
    .select("id, subject_id, score, criteria, strengths, gaps, next_steps, feedback, grader, needs_review, created_at")
    .in("subject_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
    .eq("is_final", true)
    .order("created_at", { ascending: false });
  const { data: appeals } = await db.from("appeals").select("grade_id, status, response, new_score").eq("user_id", userId);
  const { data: flags } = await db.from("integrity_flags").select("id, subject_id, follow_up_question, follow_up_answer").eq("user_id", userId).eq("reason", "possible_ai_generated").in("subject_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data: result } = await db.from("test_results").select("*").eq("attempt_id", attempt.id).maybeSingle();
  const j = await getJourney(userId);
  return {
    attempt,
    result,
    journey: { status: j.status, attempts_used: j.attempts_used, next_attempt_at: j.next_attempt_at },
    tests: (subs ?? []).map((s) => {
      const grade = (grades ?? []).find((g) => g.subject_id === s.id) ?? null;
      return {
        ...s,
        weight: TEST_WEIGHTS[s.test_no],
        grade,
        appeal: grade ? (appeals ?? []).find((a) => a.grade_id === grade.id) ?? null : null,
        follow_up: (flags ?? []).find((f) => f.subject_id === s.id) ?? null,
      };
    }),
  };
}

export async function answerFollowUp(userId: string, flagId: string, answer: string) {
  const { data } = await db.from("integrity_flags").update({ follow_up_answer: answer }).eq("id", flagId).eq("user_id", userId).is("follow_up_answer", null).select("id");
  if (!data?.length) throw notFound();
  return { ok: true };
}

/** One appeal per graded item, answered by a human within 72 hours. */
export async function fileAppeal(userId: string, gradeId: string, reason: string) {
  const { data: grade } = await db.from("grades").select("id, user_id").eq("id", gradeId).single();
  if (!grade || grade.user_id !== userId) throw notFound();
  const { error } = await db.from("appeals").insert({ grade_id: gradeId, user_id: userId, reason });
  if (error?.code === "23505") throw conflict("You've already appealed this grade.");
  if (error) throw error;
  return { ok: true };
}
