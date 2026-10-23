import crypto from "node:crypto";
import { db, ok } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { forbidden, HttpError } from "../lib/errors.js";
import { PROJECT_LEVELS } from "../domain/constants.js";
import { callStructured, aiConfigured, AiUnavailableError, AiBudgetError, AiOutputError } from "../ai/aiClient.js";
import { CvDraft, CvContent } from "../ai/schemas.js";
import { CV_RULES, PROMPT_VERSIONS } from "../ai/prompts.js";
import { getProfile } from "./profile.js";
import { cvSettings, creditTokens, ensureWallet, getBalance, spendTokens } from "./tokens.js";

type Facts = Awaited<ReturnType<typeof gatherFacts>>;

const monthYear = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "";

/** Everything the platform has verified about the user. The CV is written only from this plus their own notes. */
async function gatherFacts(userId: string) {
  const profile = await getProfile(userId);
  const [{ data: auth }, { data: role }, { data: tests }, { data: results }, { data: portfolio }, { data: cert }, { data: grades }, { data: membership }] =
    await Promise.all([
      db.auth.admin.getUserById(userId),
      profile.role_id ? db.from("roles").select("name, team_duty").eq("id", profile.role_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from("test_results").select("weighted_score, passed, summary, created_at").eq("user_id", userId).eq("passed", true).order("created_at", { ascending: false }).limit(1),
      db
        .from("project_results")
        .select("total, passed, project_instance_id, project:project_instance_id(level, started_at, completed_at, repo_url, template:template_id(title, brief), team:team_id(name, persona:persona_id(name, mission)))")
        .eq("user_id", userId),
      db.from("portfolio_items").select("title, summary, links").eq("user_id", userId).eq("visible", true).order("created_at"),
      db.from("certifications").select("cert_code, issued_at").eq("user_id", userId).eq("status", "valid").maybeSingle(),
      db.from("grades").select("strengths, score").eq("user_id", userId).eq("subject_type", "deliverable").eq("is_final", true).not("strengths", "is", null).order("score", { ascending: false }).limit(6),
      db.from("team_members").select("joined_at, team:team_id(name, persona:persona_id(name, mission))").eq("user_id", userId).order("joined_at", { ascending: true }).limit(1).maybeSingle(),
    ]);

  const projects = ((results ?? []) as any[])
    .filter((r) => r.project)
    .sort((a, b) => a.project.level - b.project.level)
    .map((r) => ({
      level: r.project.level as number,
      stage: PROJECT_LEVELS.find((l) => l.level === r.project.level)?.name ?? `Project ${r.project.level}`,
      title: r.project.template?.title as string,
      brief: String(r.project.template?.brief ?? "").slice(0, 400),
      score: Math.round(Number(r.total)),
      passed: Boolean(r.passed),
      repo_url: (r.project.repo_url as string | null) ?? "",
      started_at: r.project.started_at as string,
      completed_at: (r.project.completed_at as string | null) ?? null,
    }));

  const m = membership as any;
  const team = m?.team ? { name: m.team.name ?? "", company: m.team.persona?.name ?? "", mission: m.team.persona?.mission ?? "" } : null;
  const ended = projects.map((p) => p.completed_at).filter(Boolean).sort().pop() ?? null;

  return {
    name: profile.full_name ?? "",
    email: auth.user?.email ?? "",
    phone: profile.phone ?? "",
    location: (profile.timezone ?? "").split("/").pop()?.replace(/_/g, " ") ?? "",
    bio: profile.bio ?? "",
    username: profile.username ?? "",
    role: role?.name ?? "",
    role_duty: role?.team_duty ?? "",
    onboarding: tests?.[0] ? { score: Math.round(Number(tests[0].weighted_score)), summary: tests[0].summary } : null,
    team: team && (team.name || team.company) ? { ...team, joined: m?.joined_at ?? null, ended } : null,
    projects,
    portfolio: (portfolio ?? []).map((p) => ({ title: p.title, summary: p.summary, links: (p.links as string[]) ?? [] })),
    certificate: cert ? { code: cert.cert_code, issued_at: cert.issued_at } : null,
    strengths: (grades ?? []).map((g) => String(g.strengths).slice(0, 300)),
  };
}

const sourceCounts = (f: Facts) => ({
  onboarding_passed: Boolean(f.onboarding),
  projects: f.projects.length,
  portfolio_items: f.portfolio.length,
  certified: Boolean(f.certificate),
});

/** Parts of the CV that come straight from verified records, never from the model. */
function verifiedParts(f: Facts, existing: CvContent | null) {
  const links = existing?.contact.links.length ? existing.contact.links : f.username ? [`${env.APP_URL}/u/${f.username}`] : [];
  return {
    full_name: existing?.full_name || f.name,
    contact: {
      email: existing?.contact.email || f.email,
      phone: existing?.contact.phone || f.phone,
      location: existing?.contact.location || f.location,
      links,
    },
    certifications: f.certificate
      ? [{ name: `Certificate of Experience — ${f.role}`, issuer: "Huzzler", code: f.certificate.code, url: `${env.APP_URL}/verify/${f.certificate.code}` }]
      : (existing?.certifications ?? []),
  };
}

function factsPrompt(f: Facts): string {
  return JSON.stringify(
    {
      name: f.name,
      track: f.role,
      track_duties: f.role_duty,
      bio: f.bio,
      onboarding_assessment: f.onboarding,
      simulated_internship: f.team,
      projects: f.projects.map(({ started_at, completed_at, ...p }) => ({ ...p, period: [monthYear(started_at), monthYear(completed_at)].filter(Boolean).join(" – ") })),
      portfolio: f.portfolio,
      certificate: f.certificate,
      reviewer_noted_strengths: f.strengths,
    },
    null,
    2,
  );
}

const stripTags = (s: string) => s.replace(/<\/?(background|target_role|facts)[^>]*>/gi, "");

async function draftWithAi(userId: string, f: Facts, targetRole: string, background: string): Promise<CvDraft> {
  if (!env.ANTHROPIC_API_KEY && env.AI_MOCK && env.NODE_ENV !== "production") return mockDraft(f, targetRole);
  const { data } = await callStructured({
    feature: "cv_builder",
    userId,
    promptVersion: PROMPT_VERSIONS.cv,
    cachedSystem: [CV_RULES],
    schema: CvDraft,
    userContent: [
      {
        type: "text",
        text: [
          `<facts>\n${factsPrompt(f)}\n</facts>`,
          targetRole ? `<target_role>\n${stripTags(targetRole)}\n</target_role>` : "",
          background ? `<background>\n${stripTags(background)}\n</background>` : "",
          "Write the CV.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });
  return data;
}

/** Deterministic draft for local testing without an API key (AI_MOCK=true, never in production). */
function mockDraft(f: Facts, targetRole: string): CvDraft {
  return {
    headline: `${targetRole || f.role || "Early-career builder"}${f.projects.length ? ` · ${f.projects.length} shipped team projects` : ""}`,
    summary: `${f.role || "Builder"} trained on Huzzler's simulated internship. ${f.bio}`.trim(),
    skills: ["Teamwork", "Written communication", f.role].filter(Boolean),
    experience: f.team
      ? [{ title: `${f.role} (simulated internship)`, organisation: "Huzzler", period: [monthYear(f.team.joined), monthYear(f.team.ended) || "Present"].join(" – "), bullets: f.projects.map((p) => `Delivered ${p.title} (${p.score}%)`) }]
      : [],
    projects: f.projects.map((p) => ({ name: p.title, context: p.stage, bullets: [`Scored ${p.score}% on the team deliverable`], link: p.repo_url })),
    education: [],
  };
}

export async function getCv(userId: string) {
  await ensureWallet(userId);
  const [{ data: doc }, facts, settings, balance] = await Promise.all([
    db.from("cv_documents").select("content, target_role, generated_at, generation_count, updated_at").eq("user_id", userId).maybeSingle(),
    gatherFacts(userId),
    cvSettings(),
    getBalance(userId),
  ]);
  return {
    cv: (doc?.content as CvContent | undefined) ?? null,
    target_role: doc?.target_role ?? null,
    generated_at: doc?.generated_at ?? null,
    updated_at: doc?.updated_at ?? null,
    sources: sourceCounts(facts),
    cost: settings.cost,
    balance,
    enabled: settings.enabled,
    ai_ready: aiConfigured() || (env.AI_MOCK && env.NODE_ENV !== "production"),
  };
}

export async function saveCv(userId: string, content: CvContent) {
  ok(await db.from("cv_documents").upsert({ user_id: userId, content }, { onConflict: "user_id" }), "cv save");
  return { cv: content };
}

/**
 * Charges the generation cost up front (atomic, can't overdraw), drafts with the model, and
 * refunds the charge if anything after the debit fails.
 */
export async function generateCv(userId: string, input: { target_role: string; background: string }) {
  const settings = await cvSettings();
  if (!settings.enabled) throw forbidden("The CV builder is turned off right now.", "CV_DISABLED");
  if (!aiConfigured() && !(env.AI_MOCK && env.NODE_ENV !== "production")) {
    throw new HttpError(503, "AI CV writing isn't switched on yet. You can still write and export your CV by hand.", "AI_UNAVAILABLE");
  }
  await ensureWallet(userId);

  const spendRef = crypto.randomUUID();
  const balanceAfterSpend = await spendTokens(userId, settings.cost, "cv_generate", spendRef, { target_role: input.target_role.slice(0, 120) });

  try {
    const [facts, { data: existingDoc }] = await Promise.all([
      gatherFacts(userId),
      db.from("cv_documents").select("content, generation_count").eq("user_id", userId).maybeSingle(),
    ]);
    const existing = existingDoc?.content ? CvContent.safeParse(existingDoc.content).data ?? null : null;
    const draft = await draftWithAi(userId, facts, input.target_role, input.background);

    // Re-validate against the stored schema (trims to limits) and keep user-entered education if the model had none.
    const content = CvContent.parse({
      ...verifiedParts(facts, existing),
      headline: draft.headline.slice(0, 160),
      summary: draft.summary.slice(0, 1200),
      skills: draft.skills.slice(0, 30).map((s) => s.slice(0, 60)),
      experience: draft.experience.slice(0, 10).map((e) => ({ ...e, title: e.title.slice(0, 120), organisation: e.organisation.slice(0, 120), period: e.period.slice(0, 60), bullets: e.bullets.slice(0, 10).map((b) => b.slice(0, 300)) })),
      projects: draft.projects.slice(0, 12).map((p) => ({ name: p.name.slice(0, 120), context: p.context.slice(0, 200), link: p.link.slice(0, 200), bullets: p.bullets.slice(0, 10).map((b) => b.slice(0, 300)) })),
      education: (draft.education.length ? draft.education : (existing?.education ?? [])).slice(0, 6).map((e) => ({ school: e.school.slice(0, 120), qualification: e.qualification.slice(0, 120), period: e.period.slice(0, 60) })),
    });

    ok(
      await db.from("cv_documents").upsert(
        { user_id: userId, content, target_role: input.target_role || null, generated_at: new Date().toISOString(), generation_count: (existingDoc?.generation_count ?? 0) + 1 },
        { onConflict: "user_id" },
      ),
      "cv save",
    );
    return { cv: content, balance: balanceAfterSpend, charged: settings.cost };
  } catch (err) {
    await creditTokens(userId, settings.cost, "refund", spendRef, { for: "cv_generate" }).catch((e) => logger.error({ err: e, userId, spendRef }, "cv refund failed"));
    if (err instanceof AiUnavailableError || err instanceof AiBudgetError || err instanceof AiOutputError) {
      throw new HttpError(503, "We couldn't write your CV right now. Your tokens have been refunded — please try again shortly.", "AI_FAILED");
    }
    logger.error({ err, userId }, "cv generation failed");
    throw new HttpError(502, "Something went wrong writing your CV. Your tokens have been refunded.", "CV_FAILED");
  }
}
