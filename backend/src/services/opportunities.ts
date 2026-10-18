import { db, must } from "../lib/supabase.js";
import { env } from "../config/env.js";
import { render } from "../lib/templates.js";
import { notify } from "../lib/notify.js";
import { audit } from "../lib/audit.js";
import { conflict, notFound } from "../lib/errors.js";
import { round2 } from "../domain/grading.js";
import { FIT_NOTE } from "../content/templates.js";

/** Code ranks opted-in certified candidates; a template drafts the fit note for the admin to edit. */
export async function shortlist(adminId: string, opportunityId: string, limit = 10) {
  const opp = must(await db.from("opportunities").select("*").eq("id", opportunityId).single(), "opportunity");
  const { data: certs } = await db.from("certifications").select("user_id, cert_code, scores").eq("role_id", opp.role_id).eq("status", "valid");
  const ids = (certs ?? []).map((c) => c.user_id);
  if (!ids.length) return [];
  const { data: profiles } = await db.from("profiles").select("id, full_name, open_to_opportunities").in("id", ids).eq("open_to_opportunities", true).is("deleted_at", null);
  const { data: role } = await db.from("roles").select("name").eq("id", opp.role_id).single();
  const ranked = (profiles ?? [])
    .map((p) => {
      const c = certs!.find((x) => x.user_id === p.id)!;
      const vals = Object.values(c.scores as Record<string, number>).map(Number);
      return { p, c, avg: round2(vals.reduce((a, b) => a + b, 0) / vals.length), capstone: Number((c.scores as any)["5"] ?? 0) };
    })
    .sort((a, b) => b.avg - a.avg || b.capstone - a.capstone)
    .slice(0, limit);

  const rows = ranked.map((r, i) => ({
    opportunity_id: opportunityId,
    user_id: r.p.id,
    rank: i + 1,
    status: "proposed",
    fit_note: render(FIT_NOTE, {
      first_name: (r.p.full_name ?? "").split(" ")[0], role_name: role?.name, avg_score: r.avg, capstone: "a full product",
      strengths: r.capstone >= 85 ? "capstone delivery, team collaboration" : "consistent delivery across projects", cert_code: r.c.cert_code, verify_url: `${env.APP_URL}/verify/${r.c.cert_code}`,
    }),
  }));
  if (rows.length) await db.from("opportunity_candidates").upsert(rows, { onConflict: "opportunity_id,user_id", ignoreDuplicates: true });
  await db.from("opportunities").update({ status: "shortlisting" }).eq("id", opportunityId);
  await audit(adminId, "opportunity.shortlist", "opportunity", opportunityId, { count: rows.length });
  return rows;
}

/** Admin approves a candidate: the user is asked for consent before anything is shared. */
export async function requestConsent(adminId: string, candidateId: string, fitNote?: string) {
  const { data: c } = await db.from("opportunity_candidates").update({ status: "consent_pending", ...(fitNote ? { fit_note: fitNote } : {}) }).eq("id", candidateId).eq("status", "proposed").select("user_id, opportunity:opportunity_id(company_name, role_id)").single();
  if (!c) throw conflict("Candidate isn't in the proposed state.");
  await notify(c.user_id, "opportunity.consent", "A company is interested in you", `Huzzler would like to share your profile with ${(c as any).opportunity.company_name}. Nothing is shared unless you accept.`);
  await audit(adminId, "opportunity.request_consent", "opportunity_candidate", candidateId);
  return { ok: true };
}

export async function myOpportunityRequests(userId: string) {
  const { data } = await db.from("opportunity_candidates").select("id, status, opportunity:opportunity_id(company_name, role_id, level, location, start_date)").eq("user_id", userId).in("status", ["consent_pending", "consented", "shared", "interview", "offer", "hired", "not_selected", "declined"]);
  return data ?? [];
}

export async function respondConsent(userId: string, candidateId: string, accept: boolean) {
  const { data } = await db
    .from("opportunity_candidates")
    .update({ status: accept ? "consented" : "declined", consent_at: accept ? new Date().toISOString() : null })
    .eq("id", candidateId)
    .eq("user_id", userId)
    .eq("status", "consent_pending")
    .select("id");
  if (!data?.length) throw notFound();
  return { ok: true };
}

export async function updateCandidateOutcome(adminId: string, candidateId: string, status: "shared" | "interview" | "offer" | "hired" | "not_selected") {
  const { data: c } = await db.from("opportunity_candidates").select("status").eq("id", candidateId).single();
  if (!c) throw notFound();
  // A profile can only be shared after the user consented for this specific company.
  if (status === "shared" && c.status !== "consented") throw conflict("The candidate hasn't consented to sharing with this company.");
  if (status !== "shared" && !["shared", "interview", "offer"].includes(c.status)) throw conflict("Share the profile first.");
  await db.from("opportunity_candidates").update({ status }).eq("id", candidateId);
  await audit(adminId, `opportunity.${status}`, "opportunity_candidate", candidateId);
  return { ok: true };
}
