import { Router } from "express";
import { z } from "zod";
import { h, parse, uid } from "./util.js";
import { SUPPORT_CATEGORIES, createTicket, listMyTickets, getMyTicket, replyAsUser, screenshotUploadUrl } from "../services/support.js";
import { askHelp, helpFeedback, suggestedQuestions } from "../services/help.js";
import { db } from "../lib/supabase.js";

// Available to every signed-in user (paid or not): anyone can ask for help or report a problem.
export const supportRouter = Router();

const Attachment = z.string().max(300).regex(/^[0-9a-f-]{36}\/support\/[0-9a-f-]{36}\.(png|jpe?g|webp|gif)$/i, "Invalid attachment").optional();

supportRouter.post("/support/upload-url", h(async (req) => screenshotUploadUrl(uid(req), parse(z.object({ ext: z.string().max(5) }), req.body).ext)));
supportRouter.get("/support/tickets", h(async (req) => listMyTickets(uid(req))));
supportRouter.post(
  "/support/tickets",
  h(async (req) =>
    createTicket(
      uid(req),
      parse(
        z.object({
          category: z.enum(SUPPORT_CATEGORIES),
          subject: z.string().trim().min(3).max(140),
          body: z.string().trim().min(10, "Tell us a little more (10+ characters)").max(5000),
          page_url: z.string().max(500).optional(),
          user_agent: z.string().max(300).optional(),
          attachment_path: Attachment,
        }),
        req.body,
      ),
    ),
  ),
);
supportRouter.get("/support/tickets/:id", h(async (req) => getMyTicket(uid(req), parse(z.string().uuid(), req.params.id))));
supportRouter.post(
  "/support/tickets/:id/messages",
  h(async (req) => {
    const b = parse(z.object({ body: z.string().trim().min(1).max(5000), attachment_path: Attachment }), req.body);
    return replyAsUser(uid(req), parse(z.string().uuid(), req.params.id), b.body, b.attachment_path);
  }),
);
supportRouter.get("/support/unread", h(async (req) => {
  const { count } = await db.from("support_tickets").select("id", { count: "exact", head: true }).eq("user_id", uid(req)).eq("unread_by_user", true);
  return { unread: count ?? 0 };
}));

supportRouter.get("/help/suggestions", h(async (req) => {
  const { data } = await db.from("profiles").select("role_id").eq("id", uid(req)).single();
  return suggestedQuestions(data?.role_id ?? null);
}));
supportRouter.post("/help/ask", h(async (req) => askHelp(uid(req), parse(z.object({ question: z.string().trim().min(2).max(500) }), req.body).question)));
supportRouter.post("/help/feedback", h(async (req) => {
  const b = parse(z.object({ id: z.string().uuid(), helpful: z.boolean() }), req.body);
  return helpFeedback(uid(req), b.id, b.helpful);
}));
