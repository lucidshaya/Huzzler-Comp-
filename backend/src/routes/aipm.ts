import { Router } from "express";
import { z } from "zod";
import { h, parse, uid } from "./util.js";
import { requireRole } from "../middleware/auth.js";
import { badRequest } from "../lib/errors.js";
import { answerAppeal, listAppeals, resolveGrade, reviewQueue } from "../services/grading.js";
import {
  activity,
  aiStatus,
  decisions,
  matchingPreview,
  BriefInput,
  createBrief,
  createReport,
  draftSquad,
  listBriefs,
  listReports,
  overview,
  PM_STATUSES,
  reassignTask,
  requestStandup,
  runAutoMatching,
  setTaskStatus,
  sprintBoard,
  talent,
} from "../services/aipm.js";

// AI PM portal (/aipm). Admins and project managers; same staff sign-in (and MFA rule) as /admin.
export const aipmRouter = Router();
aipmRouter.use(requireRole("project_manager"));

aipmRouter.get("/whoami", h(async (req) => ({ id: uid(req), role: req.user!.appRole, aal: req.user!.aal })));
aipmRouter.get("/overview", h(async () => overview()));

aipmRouter.get("/briefs", h(async () => listBriefs()));
aipmRouter.post("/briefs", h(async (req) => createBrief(uid(req), parse(BriefInput, req.body))));

aipmRouter.get("/talent", h(async () => talent()));
aipmRouter.post(
  "/squads",
  h(async (req) => {
    const { archetype_id, user_ids } = parse(z.object({ archetype_id: z.string().min(2), user_ids: z.array(z.string().uuid()).min(1).max(7) }), req.body);
    return draftSquad(uid(req), archetype_id, user_ids);
  }),
);
aipmRouter.post("/matching/run", h(async (req) => runAutoMatching(uid(req))));

aipmRouter.get("/board", h(async () => sprintBoard()));
aipmRouter.post("/tasks/:id/status", h(async (req) => setTaskStatus(uid(req), req.params.id, parse(z.object({ status: z.enum(PM_STATUSES) }), req.body).status)));
aipmRouter.post("/tasks/:id/reassign", h(async (req) => reassignTask(uid(req), req.params.id, parse(z.object({ member_id: z.string().uuid() }), req.body).member_id)));
aipmRouter.post("/standups", h(async (req) => requestStandup(uid(req), parse(z.object({ team_id: z.string().uuid().nullable().default(null) }), req.body ?? {}).team_id)));

aipmRouter.get("/reports", h(async () => listReports()));
aipmRouter.post("/teams/:id/report", h(async (req) => createReport(uid(req), req.params.id)));
aipmRouter.get("/activity", h(async () => activity()));

// Project grading (deliverables and demo day) lives here, next to the squads; onboarding grading stays in Admin.
aipmRouter.get("/grading", h(async () => ({ ...(await reviewQueue("projects")), appeals: await listAppeals("projects") })));
aipmRouter.post(
  "/grading/:subjectType/:subjectId/resolve",
  h(async (req) => {
    if (!["deliverable", "demo"].includes(req.params.subjectType)) throw badRequest("Onboarding tests are graded in Admin.");
    return resolveGrade(uid(req), req.params.subjectType, req.params.subjectId, parse(z.object({ score: z.number().min(0).max(100), feedback: z.string().max(4000).optional(), user_id: z.string().uuid().optional() }), req.body), req.ip);
  }),
);
aipmRouter.post(
  "/appeals/:id",
  h(async (req) =>
    answerAppeal(uid(req), "projects", req.params.id, parse(z.object({ status: z.enum(["upheld", "adjusted", "rejected"]), response: z.string().min(10).max(4000), new_score: z.number().min(0).max(100).optional() }), req.body), req.ip),
  ),
);

// How the AI PM thinks: engine status, the decision log, and a dry run of squad matching.
aipmRouter.get("/ai/status", h(async () => aiStatus()));
aipmRouter.get("/ai/decisions", h(async (req) => decisions(typeof req.query.kind === "string" && req.query.kind ? req.query.kind : undefined)));
aipmRouter.get("/ai/matching-preview", h(async () => matchingPreview()));
