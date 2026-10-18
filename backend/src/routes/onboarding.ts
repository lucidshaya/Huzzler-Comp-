import { Router } from "express";
import { z } from "zod";
import { h, parse, uid } from "./util.js";
import { requirePaidAccess } from "../middleware/auth.js";
import { startAttempt, attemptOverview, getTest, startTest, saveDraft, submitTest, attemptResults, fileAppeal, answerFollowUp } from "../services/onboarding.js";

export const onboardingRouter = Router();
onboardingRouter.use(requirePaidAccess);

const testNo = (v: string) => parse(z.coerce.number().int().min(1).max(5), v);

onboardingRouter.get("/", h(async (req) => attemptOverview(uid(req))));
onboardingRouter.post("/start", h(async (req) => startAttempt(uid(req))));
onboardingRouter.get("/tests/:n", h(async (req) => getTest(uid(req), testNo(req.params.n))));
onboardingRouter.post("/tests/:n/start", h(async (req) => startTest(uid(req), testNo(req.params.n))));
onboardingRouter.put("/tests/:n/draft", h(async (req) => saveDraft(uid(req), testNo(req.params.n), req.body?.draft ?? {})));
onboardingRouter.post("/tests/:n/submit", h(async (req) =>
  submitTest(uid(req), testNo(req.params.n), parse(z.object({ answers: z.unknown(), ai_declaration: z.boolean().optional() }), req.body)),
));
onboardingRouter.get("/results", h(async (req) => attemptResults(uid(req), typeof req.query.attempt === "string" ? req.query.attempt : undefined)));
onboardingRouter.post("/appeals", h(async (req) => {
  const b = parse(z.object({ grade_id: z.string().uuid(), reason: z.string().min(20).max(2000) }), req.body);
  return fileAppeal(uid(req), b.grade_id, b.reason);
}));
onboardingRouter.post("/follow-up/:id", h(async (req) => answerFollowUp(uid(req), req.params.id, parse(z.object({ answer: z.string().min(20).max(3000) }), req.body).answer)));
