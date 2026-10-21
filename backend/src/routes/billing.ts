import { Router } from "express";
import { z } from "zod";
import { h, parse, uid } from "./util.js";
import { initializePayment, verifyPayment, billingSummary, cancelSubscription } from "../services/payments.js";
import { initializeTokenPurchase, walletSummary } from "../services/tokens.js";

export const billingRouter = Router();

billingRouter.get("/", h(async (req) => billingSummary(uid(req))));
billingRouter.post("/initialize", h(async (req) => initializePayment(uid(req), parse(z.object({ plan: z.enum(["one_time", "monthly"]) }), req.body).plan)));
billingRouter.post("/verify", h(async (req) => verifyPayment(uid(req), parse(z.object({ reference: z.string().min(5).max(100) }), req.body).reference)));
billingRouter.post("/cancel", h(async (req) => cancelSubscription(uid(req))));

// Token wallet: balance, what each AI tool costs, and top-ups through Paystack.
billingRouter.get("/tokens", h(async (req) => walletSummary(uid(req))));
billingRouter.post("/tokens/initialize", h(async (req) => initializeTokenPurchase(uid(req), parse(z.object({ pack_id: z.string().min(2).max(40) }), req.body).pack_id)));
