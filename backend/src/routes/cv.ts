import { Router } from "express";
import { z } from "zod";
import { h, parse, uid } from "./util.js";
import { CvContent } from "../ai/schemas.js";
import { getCv, saveCv, generateCv } from "../services/cv.js";

// AI résumé builder (Profile → AI résumé). Drafts are paid from the token wallet; editing is free.
export const cvRouter = Router();

cvRouter.get("/", h(async (req) => getCv(uid(req))));
cvRouter.put("/", h(async (req) => saveCv(uid(req), parse(z.object({ content: CvContent }), req.body).content)));
cvRouter.post(
  "/generate",
  h(async (req) => {
    const b = parse(z.object({ target_role: z.string().trim().max(120).default(""), background: z.string().trim().max(3000).default(""), job_description: z.string().trim().max(8000).optional() }), req.body ?? {});
    return generateCv(uid(req), b);
  }),
);
