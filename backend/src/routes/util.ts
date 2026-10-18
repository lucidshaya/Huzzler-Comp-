import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { z } from "zod";
import { badRequest } from "../lib/errors.js";

export const h =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res)
      .then((out) => {
        // Only `undefined` (no return value) becomes {ok:true}; an explicit null is meaningful ("none yet").
        if (!res.headersSent) res.json(out === undefined ? { ok: true } : out);
      })
      .catch(next);
  };

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "), "VALIDATION");
  return r.data;
}

export const uid = (req: Request) => req.user!.id;
