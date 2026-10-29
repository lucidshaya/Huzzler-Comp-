import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "../lib/supabase.js";
import { h, parse, uid } from "./util.js";
import { forbidden } from "../lib/errors.js";
import { requirePaidAccess } from "../middleware/auth.js";
import { listOffers, respondToOffer, restoreOffer } from "../services/offers.js";
import { CanvasInput, RunInput, runTool, saveCanvas, workstationState } from "../services/workstation.js";
import { myTeam, assertTeamMember } from "../services/teams.js";
import { standinReply } from "../services/standins.js";
import { later } from "../lib/notify.js";
import { checkStep } from "../services/checklists.js";
import { workspace, updateTask, getTaskDetail, unlockHint, submitDeliverable, submitCheckin, submitPeerReviews, submitDemo, ciToken } from "../services/projects.js";
import { mentorHistory, askMentor } from "../services/mentor.js";
import { addMeeting, decideMeeting, getMeetingNotes, listMeetings } from "../services/meetings.js";
import { certificationStatus, certificatePdfUrl } from "../services/certification.js";
import { myOpportunityRequests, respondConsent } from "../services/opportunities.js";

export const teamRouter = Router();

// Certification and opportunities stay readable after a plan ends.
teamRouter.get("/certification", h(async (req) => ({ ...(await certificationStatus(uid(req))), pdf: await certificatePdfUrl(uid(req)) })));
teamRouter.get("/opportunities/requests", h(async (req) => myOpportunityRequests(uid(req))));
teamRouter.post("/opportunities/requests/:id", h(async (req) => respondConsent(uid(req), req.params.id, parse(z.object({ accept: z.boolean() }), req.body).accept)));
teamRouter.put("/opportunities/open", h(async (req) => {
  const { open } = parse(z.object({ open: z.boolean() }), req.body);
  await db.from("profiles").update({ open_to_opportunities: open }).eq("id", uid(req));
  await db.from("consents").insert({ user_id: uid(req), type: "opportunities", version: "2026-10-01", granted: open });
  return { open };
}));

// Team chat & board are readable while lapsed (read-only), so these come before requirePaidAccess.
teamRouter.get("/team", h(async (req) => myTeam(uid(req))));
teamRouter.get("/workspace", h(async (req) => workspace(uid(req))));
teamRouter.get("/team/messages", h(async (req) => {
  const team = await myTeam(uid(req));
  if (!team) return [];
  const before = typeof req.query.before === "string" ? req.query.before : new Date(Date.now() + 60_000).toISOString();
  const { data } = await db.from("messages").select("id, user_id, kind, author_label, body, created_at").eq("team_id", team.team!.id).is("deleted_at", null).lt("created_at", before).order("created_at", { ascending: false }).limit(50);
  return (data ?? []).reverse();
}));

// This week's stand-ups for the whole squad (the squad view's stand-up panel).
teamRouter.get("/team/checkins", h(async (req) => {
  const team = await myTeam(uid(req));
  if (!team) return [];
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db.from("checkins").select("id, user_id, checkin_date, yesterday, today, blockers, created_at, profile:user_id(full_name)").eq("team_id", team.team!.id).gte("checkin_date", since).order("created_at", { ascending: false }).limit(60);
  return data ?? [];
}));

// Meeting notes and the AI PM's proposed plan changes.
teamRouter.get("/team/meetings", h(async (req) => listMeetings(uid(req))));
teamRouter.get("/team/meetings/:id/notes", h(async (req) => getMeetingNotes(uid(req), req.params.id)));

teamRouter.use(requirePaidAccess);

teamRouter.get("/offers", h(async (req) => listOffers(uid(req))));
teamRouter.post("/offers/:id/respond", h(async (req) => respondToOffer(uid(req), req.params.id, parse(z.object({ accept: z.boolean() }), req.body).accept)));
teamRouter.post("/offers/:id/restore", h(async (req) => restoreOffer(uid(req), req.params.id)));

// Workstation: AI tools in the team workspace, paid for with tokens.
teamRouter.get("/workstation", h(async (req) => workstationState(uid(req))));
teamRouter.post("/workstation/run", h(async (req) => runTool(uid(req), parse(RunInput, req.body))));
teamRouter.put("/workstation/canvas", h(async (req) => saveCanvas(uid(req), parse(CanvasInput, req.body).nodes)));

teamRouter.post("/team/messages", h(async (req) => {
  const { body } = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
  const team = await myTeam(uid(req));
  if (!team) throw forbidden("You're not on a team yet.");
  const { data } = await db.from("messages").insert({ team_id: team.team!.id, user_id: uid(req), kind: "user", body }).select().single();
  later(standinReply(team.team!.id, body));
  return data;
}));

teamRouter.post("/team/meetings", h(async (req) =>
  addMeeting(uid(req), parse(z.object({
    title: z.string().trim().min(1).max(160),
    notes: z.string().trim().min(20).max(60_000),
    held_at: z.string().datetime().optional(),
    source: z.enum(["paste", "upload"]).default("paste"),
  }), req.body)),
));
teamRouter.post("/team/meetings/:id/decision", h(async (req) =>
  decideMeeting(uid(req), req.params.id, parse(z.object({ accept: z.array(z.number().int().min(0)).max(20) }), req.body).accept),
));

teamRouter.get("/tasks/:id", h(async (req) => getTaskDetail(uid(req), req.params.id)));
teamRouter.patch("/tasks/:id", h(async (req) =>
  updateTask(uid(req), req.params.id, parse(z.object({ status: z.enum(["todo", "in_progress", "blocked", "review"]).optional(), sort_order: z.number().int().optional(), due_at: z.string().datetime().optional() }), req.body)),
));
teamRouter.post("/tasks/:id/hints", h(async (req) => unlockHint(uid(req), req.params.id)));
teamRouter.post("/tasks/:id/checklist", h(async (req) => {
  const { step_id, done } = parse(z.object({ step_id: z.string().min(1).max(20), done: z.boolean() }), req.body);
  return checkStep(uid(req), req.params.id, step_id, done);
}));
teamRouter.post("/tasks/:id/deliverables", h(async (req) =>
  submitDeliverable(uid(req), req.params.id, parse(z.object({
    content: z.string().min(20).max(30_000),
    links: z.array(z.string().url()).max(10).default([]),
    file_paths: z.array(z.string()).max(10).default([]),
    ai_declaration: z.boolean(),
  }), req.body)),
));

teamRouter.post("/uploads/sign", h(async (req) => {
  const { filename } = parse(z.object({ filename: z.string().min(1).max(120) }), req.body);
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${uid(req)}/${crypto.randomUUID()}-${safe}`;
  const { data, error } = await db.storage.from("submissions").createSignedUploadUrl(path);
  if (error) throw error;
  return { path, token: data.token, signedUrl: data.signedUrl };
}));

teamRouter.post("/checkins", h(async (req) => submitCheckin(uid(req), parse(z.object({ yesterday: z.string().min(2).max(1000), today: z.string().min(2).max(1000), blockers: z.string().max(1000).optional() }), req.body))));

const Rating = z.number().int().min(1).max(5);
teamRouter.post("/projects/:id/peer-reviews", h(async (req) =>
  submitPeerReviews(uid(req), req.params.id, parse(z.object({
    reviews: z.array(z.object({ reviewee_id: z.string().uuid(), ratings: z.object({ communication: Rating, quality: Rating, reliability: Rating, collaboration: Rating }), comment: z.string().max(1000).optional() })).min(1).max(7),
  }), req.body).reviews),
));
teamRouter.get("/projects/:id/peer-reviews", h(async (req) => {
  const { data } = await db.from("peer_reviews").select("reviewee_id").eq("project_instance_id", req.params.id).eq("reviewer_id", uid(req));
  return (data ?? []).map((r) => r.reviewee_id);
}));
teamRouter.post("/projects/:id/demo", h(async (req) => submitDemo(uid(req), req.params.id, parse(z.object({ summary: z.string().min(100).max(6000), video_url: z.string().url().optional() }), req.body))));
teamRouter.get("/projects/:id/ci", h(async (req) => {
  const { data: pi } = await db.from("project_instances").select("team_id").eq("id", req.params.id).single();
  if (!pi || !(await assertTeamMember(uid(req), pi.team_id))) throw forbidden();
  return { endpoint: `/api/ci/${req.params.id}`, token: ciToken(req.params.id) };
}));

teamRouter.get("/mentor/:taskId", h(async (req) => mentorHistory(uid(req), req.params.taskId)));
teamRouter.post("/mentor/:taskId", h(async (req) => {
  const b = parse(z.object({ question: z.string().trim().min(3).max(1500), draft: z.string().max(8000).optional() }), req.body);
  return askMentor(uid(req), req.params.taskId, b.question, b.draft);
}));
