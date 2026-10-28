import type { Cv } from "./model";

// ATS check, done in the browser: keyword match against a pasted job description, plus the
// structural checks applicant tracking systems care about. Advisory only.

const STOP = new Set(
  `a about above across after again against all also am an and any are as at be because been before being below
between both but by can could did do does doing down during each etc few for from further had has have having he her
here hers him his how i if in into is it its itself just like may me more most must my no nor not now of off on once
only or other our ours out over own per plus same she should so some such than that the their theirs them then there
these they this those through to too under until up us very via was we well were what when where which while who whom
why will with within without would you your yours able ability across work working team teams role roles job jobs
candidate candidates company experience experienced year years strong good great excellent including include includes
using use used new looking join help make ensure across across based skills skill knowledge understanding required
preferred requirements responsibilities responsible plus bonus nice opportunity opportunities day days week weeks
month months environment fast paced level senior junior intern internship position apply application hiring hire
build building write writing care caring collaborate collaborating collaboration designers developers engineers people
will want looking seeking ideal someone across love passion passionate deliver delivering create creating support
interfaces products product features feature things thing best ensure ensuring maintain maintaining plus`.split(
    /\s+/,
  ),
);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#./\s-]/g, " ");

/** The job description's most distinctive terms (single words and common two-word phrases). */
export function keywords(jd: string, max = 24): string[] {
  const words = norm(jd)
    .split(/\s+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((w) => w.length > 1)
    .filter((w) => !STOP.has(w))
    .map((w) => (/^[a-z]{5,}s$/.test(w) && !w.endsWith("ss") ? w.slice(0, -1) : w));
  const counts = new Map<string, number>();
  const add = (k: string, n = 1) => counts.set(k, (counts.get(k) ?? 0) + n);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!STOP.has(w) && (w.length > 2 || /[+#]/.test(w)) && !/^\d+$/.test(w)) add(w);
    const next = words[i + 1];
    if (next && !STOP.has(w) && !STOP.has(next) && w.length > 2 && next.length > 2)
      add(`${w} ${next}`, 0.6);
  }
  return [...counts.entries()]
    .filter(([k, n]) => (k.includes(" ") ? n >= 1.2 : true))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([k]) => k)
    .filter(
      (k, _, all) =>
        !(
          k.includes(" ") === false &&
          all.some(
            (o) => o.includes(" ") && o.split(" ").includes(k) && all.indexOf(o) < all.indexOf(k),
          )
        ),
    )
    .slice(0, max);
}

export function resumeText(cv: Cv): string {
  return norm(
    [
      cv.headline,
      cv.summary,
      cv.skills.join(" "),
      ...cv.experience.flatMap((e) => [e.title, e.organisation, ...e.bullets]),
      ...cv.projects.flatMap((p) => [p.name, p.context, ...p.bullets]),
      ...cv.education.flatMap((e) => [e.school, e.qualification]),
      ...cv.courses.flatMap((c) => [c.name, c.institution]),
      ...cv.certifications.map((c) => c.name),
      ...cv.custom.items.flatMap((i) => [i.title, i.subtitle, i.description]),
      cv.languages.map((l) => l.name).join(" "),
    ].join(" "),
  );
}

export type Check = { label: string; ok: boolean; tip: string };

export function checks(cv: Cv): Check[] {
  const bullets = [
    ...cv.experience.flatMap((e) => e.bullets),
    ...cv.projects.flatMap((p) => p.bullets),
  ];
  const words = cv.summary.trim().split(/\s+/).filter(Boolean).length;
  return [
    {
      label: "Name and target job title",
      ok: Boolean(cv.personal.first_name.trim() && cv.headline.trim()),
      tip: "Add your name and the job title you want in Personal details.",
    },
    {
      label: "Email and phone",
      ok: Boolean(cv.contact.email.trim() && cv.contact.phone.trim()),
      tip: "Recruiters need both. Add them in Contact info.",
    },
    {
      label: "City or location",
      ok: Boolean(cv.contact.location.trim()),
      tip: "Many ATS filters search by location.",
    },
    {
      label: "Summary of 30–120 words",
      ok: words >= 30 && words <= 120,
      tip: `Your summary has ${words} words.`,
    },
    {
      label: "At least 6 skills",
      ok: cv.skills.filter(Boolean).length >= 6,
      tip: "Use the skill names job posts use.",
    },
    {
      label: "Work or project experience",
      ok: cv.experience.length + cv.projects.length > 0,
      tip: "Add Employment or Portfolio entries.",
    },
    {
      label: "Bullets with numbers",
      ok: bullets.filter((b) => /\d/.test(b)).length >= 2,
      tip: "Quantify results: '%', '₦', users, hours saved.",
    },
    { label: "Education", ok: cv.education.length > 0, tip: "Add your school or training." },
    {
      label: "Short bullets (under 30 words)",
      ok: bullets.every((b) => b.split(/\s+/).length <= 30),
      tip: "Split long bullets so they're easy to scan.",
    },
  ];
}

export type Ats = {
  score: number;
  mode: "match" | "ready";
  matched: string[];
  missing: string[];
  checks: Check[];
};

export function atsScore(cv: Cv): Ats {
  const cs = checks(cv);
  const structure = cs.filter((c) => c.ok).length / cs.length;
  const jd = cv.job_description.trim();
  if (jd.split(/\s+/).length < 15)
    return {
      score: Math.round(structure * 100),
      mode: "ready",
      matched: [],
      missing: [],
      checks: cs,
    };
  const text = ` ${resumeText(cv)} `;
  const kw = keywords(jd);
  const matched = kw.filter((k) => text.includes(` ${k} `) || text.includes(` ${k}`));
  const missing = kw.filter((k) => !matched.includes(k));
  const kwScore = kw.length ? matched.length / kw.length : 0;
  return {
    score: Math.round((kwScore * 0.7 + structure * 0.3) * 100),
    mode: "match",
    matched,
    missing,
    checks: cs,
  };
}
