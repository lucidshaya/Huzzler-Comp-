import { db } from "./supabase.js";
import { logger } from "./logger.js";

export type DecisionKind = "squad_matching" | "grading" | "wbs" | "offer_ranking" | "task_routing" | "workstation";
export type DecisionStep = { label: string; detail: string; weight?: number };

/**
 * Records what the AI (or the rules engine standing in for it until the API key is added) decided
 * and why, for the AI PM portal. Never throws: logging must not break the decision itself.
 */
export async function recordDecision(d: {
  kind: DecisionKind;
  engine: "ai" | "rules" | "mock";
  summary: string;
  reasoning: DecisionStep[];
  model?: string | null;
  subjectType?: string;
  subjectId?: string;
  userId?: string | null;
  teamId?: string | null;
  confidence?: number | null;
  latencyMs?: number | null;
  status?: "committed" | "flagged";
}) {
  const { error } = await db.from("ai_decisions").insert({
    kind: d.kind,
    engine: d.engine,
    model: d.model ?? null,
    subject_type: d.subjectType ?? null,
    subject_id: d.subjectId ?? null,
    user_id: d.userId ?? null,
    team_id: d.teamId ?? null,
    summary: d.summary.slice(0, 600),
    reasoning: d.reasoning.slice(0, 20),
    confidence: d.confidence ?? null,
    latency_ms: d.latencyMs ?? null,
    status: d.status ?? "committed",
  });
  if (error) logger.warn({ err: error.message, kind: d.kind }, "ai_decisions insert failed");
}
