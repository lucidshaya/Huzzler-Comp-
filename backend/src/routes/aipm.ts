import { Router } from "express";
import { z } from "zod";
import { h, parse, uid } from "./util.js";
import { requireRole } from "../middleware/auth.js";
import {
  activity,
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
