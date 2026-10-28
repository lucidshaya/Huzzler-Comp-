import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  Cloud,
  CloudOff,
  Coins,
  Download,
  Eye,
  Loader2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Plus,
  Sparkles,
  Target,
  Wand2,
  XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/journey";
import { fmtTokens } from "@/lib/tokens";
import { hzConfirm } from "./Dialogs";
import { hzToast } from "./Toast";
import { TokenTopUp } from "./TokenTopUp";
import { ErrorNote, inputCls } from "./ui";
import { atsScore, type Ats } from "./resume/ats";
import {
  blankCv,
  filled,
  forSave,
  normalize,
  SECTIONS,
  type Cv,
  type SectionKey,
} from "./resume/model";
import { ResumePage } from "./resume/Preview";
import { SectionEditor } from "./resume/Sections";

// ATS résumé builder (Profile → ATS Resume Builder). Write: section by section with a live preview.
// Tailor: paste a job post, see the ATS match and missing keywords, and redraft with AI (paid from
// the token wallet). Design: template, colour and font. Editing, saving and the PDF are free.

type CvState = {
  cv: Partial<Cv> | null;
  target_role: string | null;
  generated_at: string | null;
  sources: {
    onboarding_passed: boolean;
    projects: number;
    portfolio_items: number;
    certified: boolean;
  };
  cost: number;
  balance: number;
  ai_enabled: boolean;
};

type Mode = "write" | "tailor" | "design";

const MODES: Array<{ key: Mode; label: string; icon: typeof PenLine }> = [
  { key: "write", label: "Write", icon: PenLine },
  { key: "tailor", label: "Tailor", icon: Target },
  { key: "design", label: "Design", icon: Palette },
];

const tone = (s: number) =>
  s >= 75
    ? "border-[color:var(--brand-green)]/50 bg-[color:var(--brand-green)]/15 text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]"
    : s >= 50
      ? "border-[color:var(--gold)]/50 bg-[color:var(--gold)]/15 text-[color:var(--gold)]"
      : "border-red-500/40 bg-red-500/10 text-red-500";

const WIDTH_KEY = "hz-cv-preview-width";

export function ResumeBuilder() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cv"],
    queryFn: () => api<CvState>("/cv"),
  });
  const [cv, setCv] = useState<Cv | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<Mode>("write");
  const [section, setSection] = useState<SectionKey>("personal");
  const [railOpen, setRailOpen] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [width, setWidth] = useState(() => {
    try {
      return Number(localStorage.getItem(WIDTH_KEY)) || 54;
    } catch {
      return 54;
    }
  });

  useEffect(() => {
    if (data && me && !cv) setCv(data.cv ? normalize(data.cv) : blankCv(me));
  }, [data, me, cv]);

  const edit = (next: Cv) => {
    setCv(next);
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: (content: Cv) =>
      api<{ cv: Cv }>("/cv", { method: "PUT", body: { content: forSave(content) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cv"] }),
  });

  // Autosave 1.2s after the last change.
  useEffect(() => {
    if (!dirty || !cv) return;
    const t = setTimeout(() => {
      setDirty(false);
      save.mutate(cv);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cv, dirty]);

  const generate = useMutation({
    mutationFn: (background: string) =>
      api<{ cv: Partial<Cv>; balance: number; charged: number; engine: "ai" | "offline" }>(
        "/cv/generate",
        {
          body: {
            target_role: cv?.headline ?? "",
            background,
            job_description: cv?.job_description ?? "",
          },
        },
      ),
    onSuccess: (r) => {
      setDirty(false);
      setCv(normalize(r.cv));
      qc.invalidateQueries({ queryKey: ["cv"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      setMode("write");
      hzToast.success(
        `Résumé drafted · −${r.charged} tokens`,
        r.engine === "ai"
          ? "Written by AI from your verified work. Check every line before you send it."
          : "Written from your verified records (AI isn't connected yet).",
      );
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "INSUFFICIENT_TOKENS") setTopUpOpen(true);
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
  });

  const ats = useMemo(() => (cv ? atsScore(cv) : null), [cv]);

  if (isLoading || !me || (data && !cv)) return <div className="skeleton h-[640px] rounded-3xl" />;
  if (error || !data || !cv || !ats) return <ErrorNote error={error} />;

  const setPreviewWidth = (v: number) => {
    setWidth(v);
    try {
      localStorage.setItem(WIDTH_KEY, String(v));
    } catch {
      /* ignore */
    }
  };

  const runAi = async (background: string) => {
    if (data.balance < data.cost) return setTopUpOpen(true);
    const ok = await hzConfirm({
      title: `Redraft your résumé for ${data.cost} tokens?`,
      body: "AI rewrites your headline, summary, skills and bullets from your verified work (and the job post, if you added one). Your contact details, links and other sections are kept. If anything goes wrong, the tokens are refunded.",
      confirmLabel: `Use ${data.cost} tokens`,
    });
    if (ok) generate.mutate(background);
  };

  const download = () => {
    if (dirty) save.mutate(cv);
    window.print();
  };

  const status = save.isPending ? (
    <>
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
    </>
  ) : save.isError ? (
    <button onClick={() => save.mutate(cv)} className="flex items-center gap-1 text-red-500">
      <CloudOff className="h-3.5 w-3.5" /> Not saved · retry
    </button>
  ) : (
    <>
      <Cloud className="h-3.5 w-3.5" /> {dirty ? "Editing…" : "Saved"}
    </>
  );

  const current = SECTIONS.find((s) => s.key === section)!;

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex rounded-full border border-border bg-muted/50 p-1" role="tablist">
          {MODES.map((m) => {
            const Icon = m.icon;
            const on = mode === m.key;
            return (
              <button
                key={m.key}
                role="tab"
                aria-selected={on}
                onClick={() => setMode(m.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-all duration-300 ${on ? "bg-primary text-primary-foreground shadow-[0_6px_20px_-8px_var(--primary)]" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4" /> {m.label}
              </button>
            );
          })}
        </div>
        <label className="hidden items-center gap-3 rounded-full border border-border bg-muted/50 px-4 py-2 text-xs font-bold lg:flex">
          Preview width
          <input
            type="range"
            min={32}
            max={62}
            value={width}
            onChange={(e) => setPreviewWidth(Number(e.target.value))}
            className="w-28 accent-[color:var(--primary)]"
          />
          <span className="w-9 text-primary">{width}%</span>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">{status}</span>
          <button
            onClick={() => setMode("tailor")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${tone(ats.score)}`}
            title="See what the ATS check found"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> {ats.score}%{" "}
            {ats.mode === "match" ? "ATS match" : "ATS ready"}
          </button>
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="btn-duo-outline !py-1.5 !px-3 text-xs lg:hidden"
          >
            <Eye className="h-3.5 w-3.5" /> {showPreview ? "Edit" : "Preview"}
          </button>
          <button onClick={download} className="btn-duo !py-1.5 !px-4 text-xs">
            <Download className="h-3.5 w-3.5" /> Download PDF
          </button>
        </div>
      </div>

      <div
        className="grid gap-4 print:block lg:[grid-template-columns:var(--cols)]"
        style={{ ["--cols" as string]: `minmax(0,1fr) ${width}%` }}
      >
        {/* Left: the active mode */}
        <div className={`min-w-0 print:hidden ${showPreview ? "hidden lg:block" : ""}`}>
          {mode === "write" && (
            <div
              className="grid gap-4 md:[grid-template-columns:var(--rail)_minmax(0,1fr)]"
              style={{ ["--rail" as string]: railOpen ? "200px" : "56px" }}
            >
              <nav
                aria-label="Résumé sections"
                className="card-duo flex gap-1 overflow-x-auto p-2 md:flex-col md:self-start md:overflow-visible"
              >
                <div className="hidden items-center justify-between px-2 pb-1 pt-1 md:flex">
                  {railOpen && (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Sections
                    </span>
                  )}
                  <button
                    onClick={() => setRailOpen((v) => !v)}
                    aria-label={railOpen ? "Collapse sections" : "Expand sections"}
                    className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                  >
                    {railOpen ? (
                      <PanelLeftClose className="h-4 w-4" />
                    ) : (
                      <PanelLeftOpen className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {SECTIONS.map((s, i) => {
                  const on = s.key === section;
                  const done = filled(cv, s.key);
                  return (
                    <button
                      key={s.key}
                      onClick={() => setSection(s.key)}
                      title={s.label}
                      className={`group relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${on ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      <span className={`flex-1 whitespace-nowrap ${railOpen ? "" : "md:hidden"}`}>
                        {s.label}
                      </span>
                      <span className="relative flex h-4 w-4 items-center justify-center">
                        {i < SECTIONS.length - 1 && (
                          <span className="absolute left-1/2 top-3 hidden h-[26px] w-px -translate-x-1/2 bg-border md:block" />
                        )}
                        <span
                          className={`relative h-2.5 w-2.5 rounded-full transition-all duration-300 ${on ? "scale-125 bg-white ring-2 ring-primary" : done ? "bg-[color:var(--brand-green)] shadow-[0_0_8px_var(--brand-green)]" : "bg-muted-foreground/30"}`}
                        />
                      </span>
                    </button>
                  );
                })}
              </nav>
              <section key={section} className="hz-page card-duo flex flex-col gap-4 p-5 md:p-6">
                <div>
                  <h2 className="font-display text-2xl font-bold">{current.label}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{current.hint}</p>
                </div>
                <SectionEditor key={section} section={section} cv={cv} onChange={edit} />
                <SectionNav section={section} onGo={setSection} />
              </section>
            </div>
          )}
          {mode === "tailor" && (
            <TailorPanel
              cv={cv}
              ats={ats}
              state={data}
              onChange={edit}
              onAi={(bg) => void runAi(bg)}
              busy={generate.isPending}
              error={generate.error}
              onTopUp={() => setTopUpOpen(true)}
            />
          )}
          {mode === "design" && <DesignPanel cv={cv} onChange={edit} />}
        </div>

        {/* Right: live preview (also what prints) */}
        <div className={`min-w-0 print:block ${showPreview ? "" : "hidden lg:block"}`}>
          <div className="lg:sticky lg:top-24">
            <div className="max-h-none rounded-3xl bg-muted/40 p-3 print:bg-transparent print:p-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
              <ResumePage cv={cv} />
            </div>
          </div>
        </div>
      </div>

      {topUpOpen && <TokenTopUp onClose={() => setTopUpOpen(false)} />}
    </div>
  );
}

function SectionNav({ section, onGo }: { section: SectionKey; onGo: (s: SectionKey) => void }) {
  const i = SECTIONS.findIndex((s) => s.key === section);
  const prev = SECTIONS[i - 1];
  const next = SECTIONS[i + 1];
  return (
    <div className="mt-2 flex items-center justify-between border-t border-border pt-4">
      {prev ? (
        <button onClick={() => onGo(prev.key)} className="btn-duo-outline !py-2 !px-4 text-xs">
          ← {prev.label}
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button onClick={() => onGo(next.key)} className="btn-duo !py-2 !px-4 text-xs">
          Next: {next.label} →
        </button>
      )}
    </div>
  );
}

function TailorPanel({
  cv,
  ats,
  state,
  onChange,
  onAi,
  busy,
  error,
  onTopUp,
}: {
  cv: Cv;
  ats: Ats;
  state: CvState;
  onChange: (cv: Cv) => void;
  onAi: (background: string) => void;
  busy: boolean;
  error: unknown;
  onTopUp: () => void;
}) {
  const [background, setBackground] = useState("");
  const input = inputCls.replace("px-4 py-3 text-base", "px-3.5 py-2.5 text-sm");
  const addSkill = (k: string) => {
    const label = k.replace(/\b\w/g, (c) => c.toUpperCase());
    if (!cv.skills.some((s) => s.toLowerCase() === k))
      onChange({ ...cv, skills: [...cv.skills, label].slice(0, 30) });
  };
  const s = state.sources;
  const sources = [
    { ok: s.onboarding_passed, label: "Onboarding tests passed" },
    {
      ok: s.projects > 0,
      label: `${s.projects} team project${s.projects === 1 ? "" : "s"} graded`,
    },
    {
      ok: s.portfolio_items > 0,
      label: `${s.portfolio_items} portfolio item${s.portfolio_items === 1 ? "" : "s"}`,
    },
    { ok: s.certified, label: "Certificate issued" },
  ];
  return (
    <div className="hz-page flex flex-col gap-4">
      <section className="card-duo flex flex-col gap-4 p-5 md:p-6">
        <div>
          <h2 className="font-display text-2xl font-bold">Tailor to a job</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste the job post. We compare it with your résumé the way an applicant tracking system
            would, and show which keywords are missing.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            Job title you're applying for
          </span>
          <input
            className={input}
            value={cv.headline}
            maxLength={160}
            onChange={(e) => onChange({ ...cv, headline: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Job description</span>
          <textarea
            className={input}
            rows={7}
            maxLength={8000}
            value={cv.job_description}
            placeholder="Paste the full job post here…"
            onChange={(e) => onChange({ ...cv, job_description: e.target.value })}
          />
        </label>
      </section>

      <section className="card-duo flex flex-col gap-4 p-5 md:p-6">
        <div className="flex items-center gap-4">
          <ScoreRing score={ats.score} />
          <div>
            <div className="font-display text-lg font-bold">
              {ats.mode === "match" ? "ATS match" : "ATS readiness"}
            </div>
            <p className="text-sm text-muted-foreground">
              {ats.mode === "match"
                ? `${ats.matched.length} of ${ats.matched.length + ats.missing.length} key terms from the job post appear in your résumé.`
                : "Paste a job description above to see your keyword match."}
            </p>
          </div>
        </div>
        {ats.mode === "match" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Missing: tap to add as a skill
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ats.missing.length === 0 && (
                  <span className="text-sm text-muted-foreground">Nothing missing.</span>
                )}
                {ats.missing.map((k) => (
                  <button
                    key={k}
                    onClick={() => addSkill(k)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-[color:var(--gold)]/60 px-2.5 py-1 text-xs font-semibold text-[color:var(--gold)] hover:bg-[color:var(--gold)]/10"
                  >
                    <Plus className="h-3 w-3" /> {k}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Only add what you can actually show. Interviewers will ask.
              </p>
            </div>
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Found
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ats.matched.map((k) => (
                  <span
                    key={k}
                    className="rounded-full bg-[color:var(--brand-green)]/15 px-2.5 py-1 text-xs font-semibold text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {ats.checks.map((c) => (
            <li
              key={c.label}
              className="flex items-start gap-2 text-sm"
              title={c.ok ? undefined : c.tip}
            >
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand-green)]" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span>
                <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
                {!c.ok && <span className="block text-[11px] text-muted-foreground">{c.tip}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card-duo flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <Wand2 className="h-5 w-5 text-primary" /> Redraft with AI
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/10 px-2.5 py-1 text-xs font-bold text-[color:var(--gold)]">
            <Coins className="h-3.5 w-3.5" /> {state.cost} tokens · you have{" "}
            {fmtTokens(state.balance)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          AI writes your headline, summary, skills and bullets from your verified Huzzler work
          {cv.job_description.trim() ? ", tailored to the job post above" : ""}. It never invents
          employers or skills.
        </p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {sources.map((i) => (
            <li key={i.label} className="flex items-center gap-2 text-sm">
              {i.ok ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={i.ok ? "" : "text-muted-foreground"}>{i.label}</span>
            </li>
          ))}
        </ul>
        {!s.onboarding_passed && s.projects === 0 && (
          <p className="text-xs text-muted-foreground">
            No verified work yet, so the draft leans on your notes below. It gets stronger as you
            finish{" "}
            <Link to="/tests" className="font-bold text-primary">
              tests
            </Link>{" "}
            and projects.
          </p>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            Anything else to include (optional)
          </span>
          <textarea
            className={input}
            rows={3}
            maxLength={3000}
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="Past jobs, volunteering, tools you know. The AI only uses facts you give it."
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onAi(background)}
            disabled={busy}
            className="btn-duo !py-2 !px-4 text-sm"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Writing your résumé…" : `Redraft · ${state.cost} tokens`}
          </button>
          {state.balance < state.cost && (
            <button onClick={onTopUp} className="btn-duo-outline !py-2 !px-4 text-sm">
              <Coins className="h-4 w-4" /> Top up tokens
            </button>
          )}
        </div>
        {!(error instanceof ApiError && error.code === "INSUFFICIENT_TOKENS") && (
          <ErrorNote error={error} />
        )}
      </section>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "var(--brand-green)" : score >= 50 ? "var(--gold)" : "#ef4444";
  return (
    <div className="relative grid h-16 w-16 shrink-0 place-items-center">
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span className="font-display text-base font-bold">{score}%</span>
    </div>
  );
}

const ACCENTS = [
  "#4f46e5",
  "#0ea5e9",
  "#0f766e",
  "#16a34a",
  "#b45309",
  "#be123c",
  "#7c3aed",
  "#111827",
];
const TEMPLATES: Array<{ key: Cv["design"]["template"]; label: string; note: string }> = [
  { key: "modern", label: "Modern", note: "Colour name and headings" },
  { key: "classic", label: "Classic", note: "Centred, traditional" },
  { key: "compact", label: "Compact", note: "Fits more on one page" },
];

function DesignPanel({ cv, onChange }: { cv: Cv; onChange: (cv: Cv) => void }) {
  const d = cv.design;
  const set = (patch: Partial<Cv["design"]>) => onChange({ ...cv, design: { ...d, ...patch } });
  return (
    <section className="hz-page card-duo flex flex-col gap-6 p-5 md:p-6">
      <div>
        <h2 className="font-display text-2xl font-bold">Design</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every template is single-column with standard headings, so applicant tracking systems read
          it correctly.
        </p>
      </div>
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Template
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((t) => {
            const on = d.template === t.key;
            return (
              <button
                key={t.key}
                onClick={() => set({ template: t.key })}
                className={`flex flex-col gap-2 rounded-2xl border p-3 text-left transition-all ${on ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50"}`}
              >
                <div className="flex h-24 flex-col gap-1.5 rounded-lg bg-white p-3">
                  <div
                    className={`h-2.5 rounded ${t.key === "classic" ? "mx-auto w-1/2 bg-neutral-800" : "w-2/3"}`}
                    style={t.key === "classic" ? undefined : { background: d.accent }}
                  />
                  <div
                    className={`h-1.5 rounded bg-neutral-300 ${t.key === "classic" ? "mx-auto w-1/3" : "w-1/3"}`}
                  />
                  <div
                    className="mt-1 h-1 w-1/4 rounded"
                    style={{ background: t.key === "classic" ? "#262626" : d.accent }}
                  />
                  <div className="h-1 w-full rounded bg-neutral-200" />
                  <div className="h-1 w-5/6 rounded bg-neutral-200" />
                  {t.key === "compact" && <div className="h-1 w-4/6 rounded bg-neutral-200" />}
                </div>
                <div>
                  <div className="text-sm font-bold">{t.label}</div>
                  <div className="text-[11px] text-muted-foreground">{t.note}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Accent colour
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENTS.map((c) => (
            <button
              key={c}
              aria-label={`Accent ${c}`}
              onClick={() => set({ accent: c })}
              className={`h-9 w-9 rounded-full transition-transform hover:scale-110 ${d.accent === c ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
              style={{ background: c }}
            />
          ))}
          <label
            className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-full border border-dashed border-border"
            title="Custom colour"
          >
            <input
              type="color"
              value={d.accent}
              onChange={(e) => set({ accent: e.target.value })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <Plus className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground" />
          </label>
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Font
        </div>
        <div className="flex gap-2">
          {(["serif", "sans"] as const).map((f) => (
            <button
              key={f}
              onClick={() => set({ font: f })}
              className={`rounded-xl border px-4 py-2 text-sm font-bold ${d.font === f ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
              style={{ fontFamily: f === "serif" ? "Georgia, serif" : "Arial, sans-serif" }}
            >
              {f === "serif" ? "Serif" : "Sans-serif"}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
