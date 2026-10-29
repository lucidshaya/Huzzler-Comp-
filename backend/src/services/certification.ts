import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import { db, must, ok } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { notify } from "../lib/notify.js";
import { render } from "../lib/templates.js";
import { MIN_PEER_REVIEWS_FOR_CERT, PROJECT_PASS_MARK, PROJECT_LEVELS } from "../domain/constants.js";
import { round2 } from "../domain/grading.js";
import { PORTFOLIO_SUMMARY } from "../content/templates.js";
import { getJourney, transition } from "./journey.js";

export async function certificationStatus(userId: string) {
  const { data: results } = await db.from("project_results").select("project_instance_id, total, passed, peer_review_count, project:project_instance_id(level, team_id)").eq("user_id", userId);
  // Reviews needed per project: 2, or fewer when the squad had fewer than 3 real people (stand-ins
  // can't review). Everyone graded on a project has a result row, so the rows count the real members.
  const instanceIds = (results ?? []).map((r) => r.project_instance_id);
  const { data: graded } = instanceIds.length ? await db.from("project_results").select("project_instance_id").in("project_instance_id", instanceIds) : { data: [] };
  const realMembers = new Map<string, number>();
  for (const g of graded ?? []) realMembers.set(g.project_instance_id, (realMembers.get(g.project_instance_id) ?? 0) + 1);
  const reviewsNeeded = (instanceId: string) => Math.min(MIN_PEER_REVIEWS_FOR_CERT, Math.max(0, (realMembers.get(instanceId) ?? 1) - 1));
  const byLevel = new Map<number, any>();
  for (const r of (results ?? []) as any[]) {
    const prev = byLevel.get(r.project.level);
    if (!prev || Number(r.total) > Number(prev.total)) byLevel.set(r.project.level, r);
  }
  const { data: profile } = await db.from("profiles").select("identity_verified").eq("id", userId).single();
  const { count: openFlags } = await db.from("integrity_flags").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "open");
  const checks = {
    projects: PROJECT_LEVELS.map((l) => {
      const r = byLevel.get(l.level);
      return {
        level: l.level, name: l.name, score: r ? Number(r.total) : null, passed: Boolean(r && r.passed && Number(r.total) >= PROJECT_PASS_MARK),
        peer_reviews: r?.peer_review_count ?? 0,
        peer_reviews_needed: r ? reviewsNeeded(r.project_instance_id) : MIN_PEER_REVIEWS_FOR_CERT,
      };
    }),
    identity_verified: Boolean(profile?.identity_verified),
    open_integrity_flags: openFlags ?? 0,
  };
  const eligible =
    checks.projects.every((p) => p.passed && p.peer_reviews >= p.peer_reviews_needed) && checks.identity_verified && checks.open_integrity_flags === 0;
  return { eligible, ...checks };
}

const certCode = () => `HZ-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

export async function issueCertificate(userId: string) {
  const { data: existing } = await db.from("certifications").select("cert_code").eq("user_id", userId).eq("status", "valid").maybeSingle();
  if (existing) return existing;
  const status = await certificationStatus(userId);
  if (!status.eligible) {
    if (!status.identity_verified) await notify(userId, "cert.identity", "Verify your identity to get certified", "Upload a government ID in Profile → Account & privacy so we can issue your certificate.");
    return null;
  }
  const { data: profile } = await db.from("profiles").select("full_name, role_id, username").eq("id", userId).single();
  const { data: team } = await db.from("team_members").select("team_id").eq("user_id", userId).order("joined_at", { ascending: false }).limit(1).maybeSingle();
  const code = certCode();
  const scores = Object.fromEntries(status.projects.map((p) => [p.level, p.score]));

  const pdf = await renderPdf({ name: profile!.full_name ?? "", role: profile!.role_id, code, scores });
  const path = `${userId}/${code}.pdf`;
  await db.storage.from("certificates").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  ok(
    await db.from("certifications").insert({ cert_code: code, user_id: userId, role_id: profile!.role_id, team_id: team?.team_id ?? null, scores, projects: status.projects, pdf_path: path }),
    "certification",
  );
  const j = await getJourney(userId);
  if (j.status === "PROJECT_5") await transition(userId, "CERTIFIED", `certificate ${code}`);
  await buildPortfolio(userId);
  await notify(userId, "cert.issued", "You're certified! 🎓", `Your certificate ${code} is ready. Share it from your portfolio.`);
  return { cert_code: code };
}

async function renderPdf(p: { name: string; role: string; code: string; scores: Record<string, number | null> }): Promise<Buffer> {
  const { data: role } = await db.from("roles").select("name").eq("id", p.role).single();
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 60 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).lineWidth(3).stroke("#1cb0f6");
  doc.fontSize(14).fillColor("#58cc02").text("HUZZLER", { align: "center" });
  doc.moveDown(1.5).fontSize(36).fillColor("#222").text("Certificate of Experience", { align: "center" });
  doc.moveDown(1).fontSize(14).fillColor("#555").text("This certifies that", { align: "center" });
  doc.moveDown(0.5).fontSize(30).fillColor("#111").text(p.name, { align: "center" });
  doc.moveDown(0.5).fontSize(14).fillColor("#555").text(`completed Huzzler's ${role?.name ?? p.role} track: onboarding assessments and five team projects, including a full software product built and shipped with a real team.`, { align: "center" });
  const avg = round2(Object.values(p.scores).reduce((a: number, b) => a + Number(b ?? 0), 0) / 5);
  doc.moveDown(1).fontSize(12).text(`Average project score: ${avg}%   ·   Issued ${new Date().toDateString()}`, { align: "center" });
  doc.moveDown(2).fontSize(11).fillColor("#1cb0f6").text(`Verify: ${env.APP_URL}/verify/${p.code}   ·   ID ${p.code}`, { align: "center" });
  doc.end();
  return done;
}

/** Template-generated portfolio entries (the user can edit them). No AI. */
async function buildPortfolio(userId: string) {
  const { data: results } = await db.from("project_results").select("total, project_instance_id, project:project_instance_id(level, team:team_id(name), template:template_id(title))").eq("user_id", userId);
  const { data: profile } = await db.from("profiles").select("role_id").eq("id", userId).single();
  const { data: role } = await db.from("roles").select("name").eq("id", profile!.role_id).single();
  for (const r of (results ?? []) as any[]) {
    const { count } = await db.from("team_tasks").select("id", { count: "exact", head: true }).eq("project_instance_id", r.project_instance_id).eq("assignee_id", userId);
    const { data: exists } = await db.from("portfolio_items").select("id").eq("user_id", userId).eq("project_instance_id", r.project_instance_id).maybeSingle();
    if (exists) continue;
    await db.from("portfolio_items").insert({
      user_id: userId,
      project_instance_id: r.project_instance_id,
      title: r.project.template.title,
      summary: render(PORTFOLIO_SUMMARY, { role_name: role?.name, team_name: r.project.team.name, task_count: count ?? 0, project_title: r.project.template.title, level: r.project.level, score: r.total }),
    });
  }
}

export async function verifyCertificate(code: string) {
  const { data: cert } = await db.from("certifications").select("cert_code, user_id, role_id, scores, projects, issued_at, status").eq("cert_code", code.toUpperCase()).maybeSingle();
  if (!cert || cert.status !== "valid") return null;
  const [{ data: profile }, { data: role }] = await Promise.all([
    db.from("profiles").select("full_name, username").eq("id", cert.user_id).single(),
    db.from("roles").select("name").eq("id", cert.role_id).single(),
  ]);
  return { cert_code: cert.cert_code, name: profile?.full_name, username: profile?.username, role: role?.name, projects: cert.projects, scores: cert.scores, issued_at: cert.issued_at };
}

export async function publicPortfolio(username: string) {
  const { data: profile } = await db.from("profiles").select("id, full_name, username, bio, role_id, avatar_url, deleted_at").ilike("username", username).maybeSingle();
  if (!profile || profile.deleted_at) return null;
  const [{ data: items }, { data: cert }, { data: role }, { data: activity }] = await Promise.all([
    db.from("portfolio_items").select("title, summary, links, created_at").eq("user_id", profile.id).eq("visible", true).order("created_at"),
    db.from("certifications").select("cert_code, issued_at, scores").eq("user_id", profile.id).eq("status", "valid").maybeSingle(),
    db.from("roles").select("name").eq("id", profile.role_id).maybeSingle(),
    db.from("deliverables").select("submitted_at").eq("user_id", profile.id).gte("submitted_at", new Date(Date.now() - 180 * 86_400_000).toISOString()),
  ]);
  // Heatmap: deliverables per day over the last 6 months.
  const heat: Record<string, number> = {};
  for (const a of activity ?? []) {
    const d = a.submitted_at.slice(0, 10);
    heat[d] = (heat[d] ?? 0) + 1;
  }
  return { name: profile.full_name, username: profile.username, bio: profile.bio, role: role?.name, items: items ?? [], certificate: cert, heatmap: heat, badges: [cert ? "Certified" : null, "Verified " + (role?.name ?? "")].filter(Boolean) };
}

export async function certificatePdfUrl(userId: string) {
  const { data: cert } = await db.from("certifications").select("pdf_path, cert_code").eq("user_id", userId).eq("status", "valid").maybeSingle();
  if (!cert?.pdf_path) return null;
  const { data } = await db.storage.from("certificates").createSignedUrl(cert.pdf_path, 600);
  return { url: data?.signedUrl, cert_code: cert.cert_code };
}
