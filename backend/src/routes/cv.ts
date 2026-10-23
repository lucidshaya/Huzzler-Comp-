import { Router } from "express";
import { z } from "zod";
import { h, parse, uid } from "./util.js";
import { CvContent } from "../ai/schemas.js";
import { getCv, saveCv, generateCv } from "../services/cv.js";
import { walletSummary, initializeTokenPurchase } from "../services/tokens.js";

export const tokensRouter = Router();

tokensRouter.get("/", h(async (req) => walletSummary(uid(req))));
tokensRouter.post("/purchase", h(async (req) => initializeTokenPurchase(uid(req), parse(z.object({ pack_id: z.string().min(1).max(40) }), req.body).pack_id)));

export const cvRouter = Router();

cvRouter.get("/", h(async (req) => getCv(uid(req))));
cvRouter.put("/", h(async (req) => saveCv(uid(req), parse(z.object({ content: CvContent }), req.body).content)));
cvRouter.post(
  "/generate",
  h(async (req) => {
    const b = parse(z.object({ target_role: z.string().trim().max(120).default(""), background: z.string().trim().max(3000).default("") }), req.body ?? {});
    return generateCv(uid(req), b);
  }),
);
