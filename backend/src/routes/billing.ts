import { Router } from "express";
import { z } from "zod";
import { h, parse, uid } from "./util.js";
import { initializePayment, verifyPayment, billingSummary, cancelSubscription } from "../services/payments.js";

export const billingRouter = Router();

billingRouter.get("/", h(async (req) => billingSummary(uid(req))));
billingRouter.post("/initialize", h(async (req) => initializePayment(uid(req), parse(z.object({ plan: z.enum(["one_time", "monthly"]) }), req.body).plan)));
billingRouter.post("/verify", h(async (req) => verifyPayment(uid(req), parse(z.object({ reference: z.string().min(5).max(100) }), req.body).reference)));
billingRouter.post("/cancel", h(async (req) => cancelSubscription(uid(req))));
