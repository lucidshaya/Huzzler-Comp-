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
import { processCampaign } from "../services/emailCampaigns.js";
import { runStandinWork, runAllStandinWork } from "../services/standins.js";
import { processMeeting } from "../services/meetings.js";
import { pruneOldLogs, runOpsChecks } from "../services/ops.js";
import { generateChecklists } from "../services/checklists.js";

type Processor = (data: any) => Promise<unknown>;

export const processors: Record<JobName, Processor> = {
  grade_test_submission: ({ submissionId }) => gradeTestSubmission(submissionId),
  grade_deliverable: ({ deliverableId }) => gradeDeliverable(deliverableId),
  grade_demo: (d) => gradeDemo(d),
  process_payment_event: ({ eventId }) => processWebhookEvent(eventId),
  run_matching: async () => {
    await runMatching();
    await runAllStandinWork();
    // Every 30 minutes: tell admins about crashes, AI failures, stuck jobs and webhook errors.
    await runOpsChecks().catch((err) => logger.error({ err: String(err) }, "ops checks failed"));
  },
  expire_offers: () => expireOffers(),
  generate_offers: ({ userId }) => generateOffers(userId),
  compute_project_results: ({ instanceId, onlyIfComplete }) => computeProjectResults(instanceId, Boolean(onlyIfComplete)),
  issue_certificate: ({ userId }) => issueCertificate(userId),
  send_campaign: ({ campaignId }) => processCampaign(campaignId),
  standin_work: ({ teamId }) => runStandinWork(teamId),
  process_meeting: ({ meetingId }) => processMeeting(meetingId),
  task_checklists: ({ instanceId }) => generateChecklists(instanceId),
  nudges: async () => {
    await sendNudges();
    await compileStandups();
  },
  inactivity_check: async () => {
    await runInactivityCheck();
    await finalizeOverdueProjects();
    await pruneOldLogs();
  },
  lapse_check: async () => {
    const lapsed = await runLapseCheck();
    for (const u of lapsed) await handleLapsedMember(u);
    await backfillLapsed();
  },
  // Once an AI key (DEEPSEEK_API_KEY) is configured, everything parked in `awaiting_ai` is graded.
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
