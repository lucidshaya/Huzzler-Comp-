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

const CvEntry = z.object({ title: z.string(), organisation: z.string(), period: z.string(), bullets: z.array(z.string()) });

/** What the model drafts. Contact details are filled in by the server from the profile. */
export const CvDraft = z.object({
  headline: z.string(),
  summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(CvEntry),
  projects: z.array(z.object({ name: z.string(), context: z.string(), bullets: z.array(z.string()), link: z.string() })),
  education: z.array(z.object({ school: z.string(), qualification: z.string(), period: z.string() })),
});
export type CvDraft = z.infer<typeof CvDraft>;

const line = (max: number) => z.string().trim().max(max);
const bullets = z.array(line(300)).max(10);

/** The stored, user-editable CV. */
export const CvContent = z.object({
  full_name: line(80),
  headline: line(160),
  contact: z.object({ email: line(120), phone: line(30), location: line(80), links: z.array(line(200)).max(6) }),
  summary: line(1200),
  skills: z.array(line(60)).max(30),
  experience: z.array(z.object({ title: line(120), organisation: line(120), period: line(60), bullets })).max(10),
  projects: z.array(z.object({ name: line(120), context: line(200), bullets, link: line(200) })).max(12),
  education: z.array(z.object({ school: line(120), qualification: line(120), period: line(60) })).max(6),
  certifications: z.array(z.object({ name: line(160), issuer: line(80), code: line(40), url: line(200) })).max(10),
});
export type CvContent = z.infer<typeof CvContent>;
