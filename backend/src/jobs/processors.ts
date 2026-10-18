import { db } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { aiConfigured } from "../ai/aiClient.js";
import type { JobName } from "./queue.js";
import { gradeTestSubmission } from "../services/onboarding.js";
import { gradeDeliverable, gradeDemo, computeProjectResults, compileStandups, sendNudges, runInactivityCheck, handleLapsedMember, backfillLapsed, finalizeOverdueProjects } from "../services/projects.js";
import { processWebhookEvent, runLapseCheck } from "../services/payments.js";
import { runMatching } from "../services/teams.js";
import { generateOffers, expireOffers } from "../services/offers.js";
import { issueCertificate } from "../services/certification.js";

type Processor = (data: any) => Promise<unknown>;

export const processors: Record<JobName, Processor> = {
  grade_test_submission: ({ submissionId }) => gradeTestSubmission(submissionId),
  grade_deliverable: ({ deliverableId }) => gradeDeliverable(deliverableId),
  grade_demo: (d) => gradeDemo(d),
  process_payment_event: ({ eventId }) => processWebhookEvent(eventId),
  run_matching: () => runMatching(),
  expire_offers: () => expireOffers(),
  generate_offers: ({ userId }) => generateOffers(userId),
  compute_project_results: ({ instanceId, onlyIfComplete }) => computeProjectResults(instanceId, Boolean(onlyIfComplete)),
  issue_certificate: ({ userId }) => issueCertificate(userId),
  nudges: async () => {
    await sendNudges();
    await compileStandups();
  },
  inactivity_check: async () => {
    await runInactivityCheck();
    await finalizeOverdueProjects();
  },
  lapse_check: async () => {
    const lapsed = await runLapseCheck();
    for (const u of lapsed) await handleLapsedMember(u);
    await backfillLapsed();
  },
  // Once ANTHROPIC_API_KEY is configured, everything parked in `awaiting_ai` is graded.
  retry_awaiting_ai: async () => {
    if (!aiConfigured()) return;
    const { data: subs } = await db.from("test_submissions").select("id").eq("status", "awaiting_ai").limit(50);
    for (const s of subs ?? []) {
      await db.from("test_submissions").update({ status: "grading" }).eq("id", s.id);
      await gradeTestSubmission(s.id).catch((err) => logger.error({ err, id: s.id }, "retry grading failed"));
    }
    const { data: dels } = await db.from("deliverables").select("id").eq("status", "awaiting_ai").limit(50);
    for (const d of dels ?? []) {
      await db.from("deliverables").update({ status: "grading" }).eq("id", d.id);
      await gradeDeliverable(d.id).catch((err) => logger.error({ err, id: d.id }, "retry grading failed"));
    }
  },
};

/** Recurring jobs (cron, UTC). */
export const SCHEDULE: Array<{ name: JobName; cron: string; everyMs: number }> = [
  { name: "expire_offers", cron: "15 * * * *", everyMs: 3_600_000 },
  { name: "run_matching", cron: "*/30 * * * *", everyMs: 1_800_000 },
  { name: "retry_awaiting_ai", cron: "*/10 * * * *", everyMs: 600_000 },
  { name: "nudges", cron: "0 16 * * *", everyMs: 86_400_000 },          // 17:00 WAT
  { name: "inactivity_check", cron: "0 6 * * *", everyMs: 86_400_000 },
  { name: "lapse_check", cron: "0 7 * * *", everyMs: 86_400_000 },
];
