import type { Me } from "@/lib/journey";

// The résumé document as stored by /cv (backend/src/ai/schemas.ts CvContent), plus helpers.

export type Design = {
  template: "classic" | "modern" | "compact";
  accent: string;
  font: "serif" | "sans";
};

export type Cv = {
  full_name: string;
  headline: string;
  contact: { email: string; phone: string; location: string; links: string[] };
  summary: string;
  skills: string[];
  experience: Array<{ title: string; organisation: string; period: string; bullets: string[] }>;
  projects: Array<{ name: string; context: string; bullets: string[]; link: string }>;
  education: Array<{ school: string; qualification: string; period: string }>;
  certifications: Array<{ name: string; issuer: string; code: string; url: string }>;
  personal: { first_name: string; last_name: string; nationality: string; availability: string };
  courses: Array<{ name: string; institution: string; period: string }>;
  languages: Array<{ name: string; level: string }>;
  references: Array<{ name: string; company: string; contact: string }>;
  hobbies: string;
  custom: {
    title: string;
    items: Array<{ title: string; subtitle: string; period: string; description: string }>;
  };
  job_description: string;
  design: Design;
};

export const DEFAULT_DESIGN: Design = { template: "modern", accent: "#4f46e5", font: "serif" };

/** Fills sections missing from older saved résumés and splits the name for the form. */
export function normalize(raw: Partial<Cv>): Cv {
  const full = raw.full_name ?? "";
  const personal = raw.personal ?? {
    first_name: "",
    last_name: "",
    nationality: "",
    availability: "",
  };
  if (!personal.first_name && !personal.last_name && full) {
    const [first, ...rest] = full.split(" ");
    personal.first_name = first;
    personal.last_name = rest.join(" ");
  }
  return {
    full_name: full,
    headline: raw.headline ?? "",
    contact: raw.contact ?? { email: "", phone: "", location: "", links: [] },
    summary: raw.summary ?? "",
    skills: raw.skills ?? [],
    experience: raw.experience ?? [],
    projects: raw.projects ?? [],
    education: raw.education ?? [],
    certifications: raw.certifications ?? [],
    personal,
    courses: raw.courses ?? [],
    languages: raw.languages ?? [],
    references: raw.references ?? [],
    hobbies: raw.hobbies ?? "",
    custom: raw.custom ?? { title: "", items: [] },
    job_description: raw.job_description ?? "",
    design: { ...DEFAULT_DESIGN, ...(raw.design ?? {}) },
  };
}

export const blankCv = (me: Me): Cv =>
  normalize({
    full_name: me.profile.full_name ?? "",
    contact: { email: me.user.email ?? "", phone: me.profile.phone ?? "", location: "", links: [] },
    summary: me.profile.bio ?? "",
  });

/** Trims empty rows and keeps full_name in step with the first/last name fields before saving. */
export function forSave(cv: Cv): Cv {
  const name = `${cv.personal.first_name.trim()} ${cv.personal.last_name.trim()}`.trim();
  const clean = <T extends object>(rows: T[]) =>
    rows.filter((r) =>
      Object.values(r).some((v) => (Array.isArray(v) ? v.length : String(v).trim())),
    );
  return {
    ...cv,
    full_name: name || cv.full_name,
    skills: cv.skills.map((s) => s.trim()).filter(Boolean),
    contact: { ...cv.contact, links: cv.contact.links.map((l) => l.trim()).filter(Boolean) },
    experience: clean(cv.experience),
    projects: clean(cv.projects),
    education: clean(cv.education),
    courses: clean(cv.courses),
    languages: clean(cv.languages),
    references: clean(cv.references),
    certifications: clean(cv.certifications),
    custom: { ...cv.custom, items: clean(cv.custom.items) },
  };
}

export type SectionKey =
  | "personal"
  | "contact"
  | "employment"
  | "education"
  | "courses"
  | "portfolio"
  | "skills"
  | "references"
  | "hobbies"
  | "custom"
  | "languages"
  | "summary";

export const SECTIONS: Array<{ key: SectionKey; label: string; hint: string }> = [
  {
    key: "personal",
    label: "Personal details",
    hint: "Fill in your details and the job title you are aiming for to make a clear first impression.",
  },
  {
    key: "contact",
    label: "Contact info",
    hint: "How employers reach you. Add your portfolio, GitHub or LinkedIn.",
  },
  {
    key: "employment",
    label: "Employment",
    hint: "Most recent first. Start bullets with a verb and include a number where you can.",
  },
  { key: "education", label: "Education", hint: "Schools, degrees and certificates." },
  { key: "courses", label: "Courses", hint: "Bootcamps, online courses and trainings." },
  {
    key: "portfolio",
    label: "Portfolio",
    hint: "Projects that show your work, with links where possible.",
  },
  {
    key: "skills",
    label: "Skills",
    hint: "Use the exact words job posts use. ATS systems match on these.",
  },
  { key: "references", label: "References", hint: "People who can vouch for your work." },
  { key: "hobbies", label: "Hobbies", hint: "Optional. A line that shows who you are." },
  {
    key: "custom",
    label: "Custom section",
    hint: "Volunteering, awards, leadership: anything with its own heading.",
  },
  { key: "languages", label: "Languages", hint: "Languages you speak and how well." },
  {
    key: "summary",
    label: "Summary",
    hint: "2–4 sentences: who you are, what you're great at, and what you want next.",
  },
];

/** Whether a section has anything in it (drives the green dots in the section list). */
export function filled(cv: Cv, key: SectionKey): boolean {
  switch (key) {
    case "personal":
      return Boolean(cv.personal.first_name.trim() && cv.headline.trim());
    case "contact":
      return Boolean(cv.contact.email.trim() || cv.contact.phone.trim());
    case "employment":
      return cv.experience.length > 0;
    case "education":
      return cv.education.length > 0;
    case "courses":
      return cv.courses.length > 0;
    case "portfolio":
      return cv.projects.length > 0;
    case "skills":
      return cv.skills.filter(Boolean).length > 0;
    case "references":
      return cv.references.length > 0;
    case "hobbies":
      return Boolean(cv.hobbies.trim());
    case "custom":
      return cv.custom.items.length > 0;
    case "languages":
      return cv.languages.length > 0;
    case "summary":
      return Boolean(cv.summary.trim());
  }
}
