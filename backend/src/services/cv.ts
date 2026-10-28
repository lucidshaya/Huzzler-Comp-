import crypto from "node:crypto";
import { db, ok } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { HttpError } from "../lib/errors.js";
import { PROJECT_LEVELS } from "../domain/constants.js";
import { callStructured, aiConfigured, AiUnavailableError, AiBudgetError, AiOutputError } from "../ai/aiClient.js";
import { CvDraft, CvContent } from "../ai/schemas.js";
import { CV_RULES, PROMPT_VERSIONS } from "../ai/prompts.js";
import { getProfile } from "./profile.js";
import { balanceOf, creditTokens, priceOf, spendTokens } from "./tokens.js";

// AI résumé builder (Profile → AI résumé). Each AI draft is paid from the user's token wallet at the
// `cv_generate` price; editing, saving and the PDF are free. With an AI key the model writes the
// draft; until then a deterministic writer builds it from the same verified records.

export const CV_ACTION = "cv_generate";

type Facts = Awaited<ReturnType<typeof gatherFacts>>;

const monthYear = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "");

/** Everything the platform has verified about the user. The résumé is written only from this plus their own notes. */
async function gatherFacts(userId: string) {
  const profile = await getProfile(userId);
  const [{ data: auth }, { data: role }, { data: tests }, { data: results }, { data: portfolio }, { data: cert }, { data: grades }, { data: membership }] = await Promise.all([
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
    db.from("team_members").select("joined_at, team:team_id(name, persona:persona_id(name, mission))").eq("user_id", userId).not("user_id", "is", null).order("joined_at", { ascending: true }).limit(1).maybeSingle(),
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
    role_id: profile.role_id ?? "",
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

/** Parts of the résumé that come straight from verified records, never from the model. */
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

const stripTags = (s: string) => s.replace(/<\/?(background|target_role|facts|job_description)[^>]*>/gi, "");

async function draftWithAi(userId: string, f: Facts, targetRole: string, background: string, jobDescription = ""): Promise<CvDraft> {
  const { data } = await callStructured({
    feature: "cv_builder",
    userId,
    roleId: f.role_id || null,
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
          jobDescription
            ? `<job_description>\n${stripTags(jobDescription).slice(0, 6000)}\n</job_description>\nTailor the headline, summary, skills and bullet wording to this job's keywords where the facts support it. Never claim a skill or experience the facts don't show.`
            : "",
          "Write the résumé.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });
  return data;
}

const ROLE_SKILLS: Record<string, string[]> = {
  software_engineer: ["TypeScript", "React", "REST APIs", "Git & pull requests", "Automated testing", "Code review"],
  product_manager: ["Product specs & PRDs", "Prioritisation", "User stories", "Stakeholder updates", "Metrics definition", "Sprint planning"],
  uiux_designer: ["Figma", "User flows", "Wireframing", "Design systems", "Usability testing", "Accessibility"],
  devops_engineer: ["CI/CD", "Docker", "Cloud deployment", "Monitoring & alerting", "Infrastructure as code", "Incident response"],
  technical_writer: ["API documentation", "READMEs", "Release notes", "Style guides", "Information architecture", "Editing"],
  data_analyst: ["SQL", "Dashboards", "Data cleaning", "Cohort analysis", "Metric design", "Insight memos"],
  qa_engineer: ["Test plans", "Bug reporting", "Regression testing", "Automated tests", "Acceptance criteria", "Release sign-off"],
  growth_marketer: ["Positioning", "Launch copy", "Funnel analysis", "A/B tests", "Content marketing", "Go-to-market"],
};

/**
 * Writes the draft from verified records only, for when no AI key is set (and as the
 * fallback if the model is unavailable). Nothing is invented: every line traces to a record or the
 * user's own notes.
 */
export function offlineDraft(f: Facts, targetRole: string, background: string): CvDraft {
  const role = f.role || "Early-career tech professional";
  const passed = f.projects.filter((p) => p.passed);
  const proof = f.certificate ? "Huzzler-certified" : passed.length ? `${passed.length} shipped team project${passed.length === 1 ? "" : "s"}` : f.onboarding ? `verified at ${f.onboarding.score}% on role assessments` : "";
  const notes = background.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const eduLine = /(university|polytechnic|college|school|academy|bsc|b\.sc|hnd|ond|msc|degree|diploma|bootcamp)/i;
  return {
    headline: [targetRole || role, proof].filter(Boolean).join(" · "),
    summary: [
      `${role} who learns by shipping with a cross-functional team.`,
      f.team ? `Completed a simulated internship on Huzzler${f.team.company ? `, building for ${f.team.company} (a fictional company)` : ""}${passed.length ? ` and passed ${passed.length} graded team project${passed.length === 1 ? "" : "s"}` : ""}.` : f.onboarding ? `Verified on Huzzler's role assessments with a ${f.onboarding.score}% weighted score.` : "",
      f.bio,
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 1200),
    skills: [...new Set([...(ROLE_SKILLS[f.role_id] ?? []), "Remote collaboration", "Written communication"])].slice(0, 10),
    experience: f.team
      ? [
          {
            title: `${role} (simulated internship)`,
            organisation: "Huzzler",
            period: [monthYear(f.team.joined), monthYear(f.team.ended) || "Present"].filter(Boolean).join(" – "),
            bullets: [
              f.team.company ? `Worked in ${f.team.name || "a squad"} building for ${f.team.company}, a fictional company${f.team.mission ? ` whose mission is to ${f.team.mission.replace(/\.$/, "").toLowerCase()}` : ""}.` : "",
              ...f.projects.map((p) => `Delivered "${p.title}" (${p.stage.toLowerCase()}), scoring ${p.score}% on the graded team outcome.`),
              ...f.strengths.slice(0, 2).map((s) => `Reviewer feedback: ${s.replace(/\s+/g, " ").slice(0, 200)}`),
            ].filter(Boolean),
          },
        ]
      : [],
    projects: [
      ...f.projects.map((p) => ({
        name: p.title,
        context: `Huzzler ${p.stage.toLowerCase()} · ${[monthYear(p.started_at), monthYear(p.completed_at)].filter(Boolean).join(" – ")}`,
        bullets: [p.brief.split(/(?<=\.)\s/)[0] ?? "", `Scored ${p.score}% on the team deliverable${p.passed ? "" : " (in progress)"}.`].filter(Boolean),
        link: p.repo_url,
      })),
      ...f.portfolio.map((p) => ({ name: p.title, context: "Portfolio", bullets: [p.summary].filter(Boolean), link: p.links[0] ?? "" })),
    ],
    education: notes.filter((l) => eduLine.test(l)).slice(0, 4).map((l) => {
      // "BSc Computer Science, University of Lagos, 2022 – 2026" in any order.
      const parts = l.split(/,\s*|\s+[|·]\s+/).map((x) => x.trim()).filter(Boolean);
      const period = parts.find((x) => /\d{4}/.test(x)) ?? "";
      const school = parts.find((x) => x !== period && /(university|polytechnic|college|school|academy|institute|bootcamp)/i.test(x)) ?? parts[0];
      return { school, qualification: parts.filter((x) => x !== period && x !== school).join(", "), period };
    }),
  };
}

export async function getCv(userId: string) {
  const [{ data: doc }, facts, price, balance] = await Promise.all([
    db.from("cv_documents").select("content, target_role, generated_at, generation_count, updated_at").eq("user_id", userId).maybeSingle(),
    gatherFacts(userId),
    priceOf(CV_ACTION),
    balanceOf(userId),
  ]);
  return {
    // Older résumés gain the newer sections with their defaults.
    cv: doc?.content ? ((CvContent.safeParse(doc.content).data ?? doc.content) as CvContent) : null,
    target_role: doc?.target_role ?? null,
    generated_at: doc?.generated_at ?? null,
    updated_at: doc?.updated_at ?? null,
    generation_count: doc?.generation_count ?? 0,
    sources: sourceCounts(facts),
    cost: price.cost,
    balance,
    ai_enabled: aiConfigured(),
  };
}

export async function saveCv(userId: string, content: CvContent) {
  ok(await db.from("cv_documents").upsert({ user_id: userId, content }, { onConflict: "user_id" }), "cv save");
  return { cv: content };
}

/**
 * Charges the draft price up front (atomic, can't overdraw), writes the draft, and refunds the
 * charge if anything after the debit fails.
 */
export async function generateCv(userId: string, input: { target_role: string; background: string; job_description?: string }) {
  const price = await priceOf(CV_ACTION);
  const ref = crypto.randomUUID();
  const balanceAfterSpend = await spendTokens(userId, price.cost, `${price.tool} · ${price.label}`, price.tool, ref);

  try {
    const [facts, { data: existingDoc }] = await Promise.all([
      gatherFacts(userId),
      db.from("cv_documents").select("content, generation_count").eq("user_id", userId).maybeSingle(),
    ]);
    const existing = existingDoc?.content ? (CvContent.safeParse(existingDoc.content).data ?? null) : null;
    let engine: "ai" | "offline" = "offline";
    let draft: CvDraft | null = null;
    if (aiConfigured()) {
      try {
        draft = await draftWithAi(userId, facts, input.target_role, input.background, input.job_description ?? existing?.job_description ?? "");
        engine = "ai";
      } catch (err) {
        if (!(err instanceof AiUnavailableError || err instanceof AiBudgetError || err instanceof AiOutputError)) throw err;
        logger.warn({ err: String(err) }, "AI résumé failed; using the offline writer");
      }
    }
    draft ??= offlineDraft(facts, input.target_role, input.background);

    // Re-validate against the stored schema (trims to limits); keep user-entered education if the draft has none.
    const content = CvContent.parse({
      ...(existing ?? {}),
      ...verifiedParts(facts, existing),
      ...(input.job_description !== undefined ? { job_description: input.job_description } : {}),
      headline: draft.headline.slice(0, 160),
      summary: draft.summary.slice(0, 1200),
      skills: draft.skills.slice(0, 30).map((s) => s.slice(0, 60)),
      experience: draft.experience.slice(0, 10).map((e) => ({ title: e.title.slice(0, 120), organisation: e.organisation.slice(0, 120), period: e.period.slice(0, 60), bullets: e.bullets.slice(0, 10).map((b) => b.slice(0, 300)) })),
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
    return { cv: content, balance: balanceAfterSpend, charged: price.cost, engine };
  } catch (err) {
    // Nothing was produced: give the tokens back.
    await creditTokens(userId, price.cost, "refund", `Refund · ${price.tool} draft failed`, ref).catch((e) => logger.error({ err: String(e), userId, ref }, "résumé refund failed"));
    logger.error({ err: String(err), userId }, "résumé generation failed");
    throw new HttpError(502, "Something went wrong writing your résumé. Your tokens have been refunded.", "CV_FAILED");
  }
}
