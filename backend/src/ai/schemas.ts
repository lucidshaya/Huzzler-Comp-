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

const CvEntry = z.object({ title: z.string(), organisation: z.string(), period: z.string(), bullets: z.array(z.string()) });

/** What the model drafts. Contact details and certifications are filled in by the server from verified records. */
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

/** The stored, user-editable résumé. */
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
  // ATS builder sections (added later; defaults keep older saved résumés valid).
  personal: z.object({ first_name: line(40), last_name: line(40), nationality: line(60), availability: line(80) }).default({ first_name: "", last_name: "", nationality: "", availability: "" }),
  courses: z.array(z.object({ name: line(120), institution: line(120), period: line(60) })).max(10).default([]),
  languages: z.array(z.object({ name: line(40), level: line(40) })).max(10).default([]),
  references: z.array(z.object({ name: line(80), company: line(120), contact: line(160) })).max(6).default([]),
  hobbies: line(400).default(""),
  custom: z.object({ title: line(60), items: z.array(z.object({ title: line(120), subtitle: line(120), period: line(60), description: line(600) })).max(8) }).default({ title: "", items: [] }),
  job_description: line(8000).default(""),
  design: z
    .object({ template: z.enum(["classic", "modern", "compact"]), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), font: z.enum(["serif", "sans"]) })
    .default({ template: "modern", accent: "#4f46e5", font: "serif" }),
});
export type CvContent = z.infer<typeof CvContent>;
