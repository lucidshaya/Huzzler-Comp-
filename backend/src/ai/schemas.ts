import { z } from "zod";

// What the model returns. Criteria come back as an array because structured outputs need a
// closed object schema; toSharedGrade converts to the brief's shared grading shape.
export const ModelGrade = z.object({
  criteria: z.array(z.object({ criterion_id: z.string(), score: z.number().min(0).max(100), note: z.string() })),
  strengths: z.string(),
  gaps: z.string(),
  next_steps: z.array(z.string()),
  feedback: z.string(),
  flags: z.object({ possible_prompt_injection: z.boolean(), possible_ai_generated: z.boolean() }),
});
export type ModelGrade = z.infer<typeof ModelGrade>;

/** The shared grading output stored for every role and test. `score` is computed by the server. */
export type SharedGrade = {
  score: number;
  criteria_breakdown: Record<string, { score: number; note: string }>;
  strengths: string;
  gaps: string;
  next_steps: string[];
  feedback: string;
  flags: { possible_prompt_injection: boolean; possible_ai_generated: boolean; anomaly?: string };
};

export const MentorReply = z.object({
  reply: z.string(),
  // The mentor guides; it must not hand over finished deliverables.
  gave_full_solution: z.boolean(),
});
export type MentorReply = z.infer<typeof MentorReply>;

export const HelpReply = z.object({
  answer: z.string(),
  answered_from_reference: z.boolean(),
});
export type HelpReply = z.infer<typeof HelpReply>;
