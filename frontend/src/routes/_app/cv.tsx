import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  Coins,
  CreditCard,
  Download,
  FileText,
  History,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { api, ApiError, naira } from "@/lib/api";
import { useMe, type Me } from "@/lib/journey";
import {
  Card,
  CardTitle,
  ErrorNote,
  Field,
  fmtDateTime,
  inputCls,
  Notice,
  PageHeader,
  Pill,
  Spinner,
} from "@/components/app/ui";

export const Route = createFileRoute("/_app/cv")({
  head: () => ({ meta: [{ title: "CV builder · Huzzler" }] }),
  component: CvBuilder,
});

type Cv = {
  full_name: string;
  headline: string;
  contact: { email: string; phone: string; location: string; links: string[] };
  summary: string;
  skills: string[];
  experience: Array<{ title: string; organisation: string; period: string; bullets: string[] }>;
  projects: Array<{ name: string; context: string; bullets: string[]; link: string }>;
  education: Array<{ school: string; qualification: string; period: string }>;
  certifications: Array<{ name: string; issuer: string; code: string; url: string }>;
};

type CvState = {
  cv: Cv | null;
  target_role: string | null;
  generated_at: string | null;
  updated_at: string | null;
  sources: {
    onboarding_passed: boolean;
    projects: number;
    portfolio_items: number;
    certified: boolean;
  };
  cost: number;
  balance: number;
  enabled: boolean;
  ai_ready: boolean;
};

type Wallet = {
  balance: number;
  costs: { cv_generate: number };
  packs: Array<{ id: string; name: string; tokens: number; amount_kobo: number }>;
  history: Array<{
    id: string;
    delta: number;
    balance_after: number;
    reason: string;
    created_at: string;
  }>;
};

const REASON_LABEL: Record<string, string> = {
  purchase: "Top-up",
  cv_generate: "CV generated",
  refund: "Refund",
  admin_grant: "Granted by Huzzler",
  welcome: "Welcome tokens",
};

const blankCv = (me: Me): Cv => ({
  full_name: me.profile.full_name ?? "",
  headline: "",
  contact: { email: me.user.email ?? "", phone: me.profile.phone ?? "", location: "", links: [] },
  summary: me.profile.bio ?? "",
  skills: [],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
});

function CvBuilder() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cv"],
    queryFn: () => api<CvState>("/cv"),
  });
  const [draft, setDraft] = useState<Cv | null>(null);
  const [dirty, setDirty] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [background, setBackground] = useState("");

  useEffect(() => {
    if (data && !dirty) {
      setDraft(data.cv);
      setTargetRole((t) => t || data.target_role || "");
    }
  }, [data, dirty]);

  const edit = (next: Cv) => {
    setDraft(next);
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: (content: Cv) => api<{ cv: Cv }>("/cv", { method: "PUT", body: { content } }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["cv"] });
    },
  });

  const generate = useMutation({
    mutationFn: () =>
      api<{ cv: Cv; balance: number; charged: number }>("/cv/generate", {
        body: { target_role: targetRole, background },
      }),
    onSuccess: (r) => {
      setDirty(false);
      setDraft(r.cv);
      qc.invalidateQueries({ queryKey: ["cv"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "INSUFFICIENT_TOKENS") setTopUpOpen(true);
      qc.invalidateQueries({ queryKey: ["wallet"] });
    },
  });

  if (isLoading || !me) return <Spinner />;
  if (error || !data) return <ErrorNote error={error} />;

  const canAfford = data.balance >= data.cost;
  const runGenerate = () => {
    if (!canAfford) return setTopUpOpen(true);
    if (
      draft &&
      !confirm(
        `Regenerate your CV for ${data.cost} tokens? This replaces the current text (your contact details and links are kept).`,
      )
    )
      return;
    generate.mutate();
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          chip="CV builder"
          title="Turn your Huzzler work into a CV"
          body={`AI drafts your CV from your verified tests, team projects and certificate. Each draft costs ${data.cost} tokens; editing and downloading are free.`}
          actions={<WalletPill balance={data.balance} onTopUp={() => setTopUpOpen(true)} />}
        />
      </div>

      {!data.enabled && <Notice tone="warn">The CV builder is turned off right now.</Notice>}

      <div className="grid gap-6 print:block lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-6 print:hidden">
          <Card>
            <CardTitle
              icon={Wand2}
              aside={
                <Pill tone="gold">
                  <Coins className="h-3 w-3" /> {data.cost} tokens
                </Pill>
              }
            >
              {draft ? "Regenerate with AI" : "Generate with AI"}
            </CardTitle>
            <Sources sources={data.sources} />
            <div className="mt-4 flex flex-col gap-3">
              <Field
                label="Job you're applying for"
                hint="Optional. The AI tailors the headline and skills to it."
              >
                <input
                  className={inputCls}
                  value={targetRole}
                  maxLength={120}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Junior Frontend Engineer"
                />
              </Field>
              <Field
                label="Anything else to include"
                hint="Education, past jobs, volunteering, tools you know. The AI only uses facts you give it."
              >
                <textarea
                  className={`${inputCls} min-h-24`}
                  value={background}
                  maxLength={3000}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="BSc Computer Science, University of Lagos, 2022–2026…"
                />
              </Field>
            </div>
            {!data.ai_ready && (
              <div className="mt-3">
                <Notice tone="warn">
                  AI CV writing isn't switched on yet. You can still write your CV by hand below.
                </Notice>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={runGenerate}
                disabled={generate.isPending || !data.enabled || !data.ai_ready}
                className="btn-duo !py-2 !px-4 text-sm"
              >
                <Sparkles className="h-4 w-4" />
                {generate.isPending
                  ? "Writing your CV…"
                  : `${draft ? "Regenerate" : "Generate"} · ${data.cost} tokens`}
              </button>
              {!draft && (
                <button
                  onClick={() => edit(blankCv(me))}
                  className="btn-duo-outline !py-2 !px-4 text-sm"
                >
                  <FileText className="h-4 w-4" /> Start from scratch (free)
                </button>
              )}
            </div>
            {!canAfford && (
              <p className="mt-2 text-xs font-semibold text-[color:var(--fire)]">
                You have {data.balance} tokens — top up to generate.
              </p>
            )}
            {generate.error &&
              !(
                generate.error instanceof ApiError && generate.error.code === "INSUFFICIENT_TOKENS"
              ) && <ErrorNote error={generate.error} />}
          </Card>

          {draft && (
            <Card>
              <CardTitle
                icon={FileText}
                aside={
                  <button
                    onClick={() => save.mutate(draft)}
                    disabled={!dirty || save.isPending}
                    className="btn-duo !py-1.5 !px-3 text-xs"
                  >
                    <Save className="h-3.5 w-3.5" />{" "}
                    {save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
                  </button>
                }
              >
                Edit
              </CardTitle>
              <Editor cv={draft} onChange={edit} />
              <ErrorNote error={save.error} />
            </Card>
          )}

          <TokenHistory />
        </div>

        <div className="flex flex-col gap-3 print:block">
          {draft ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <span className="text-xs text-muted-foreground">
                  {data.generated_at
                    ? `Last AI draft ${fmtDateTime(data.generated_at)}`
                    : "Preview"}
                  {dirty && " · unsaved changes"}
                </span>
                <button
                  onClick={() => {
                    if (dirty) save.mutate(draft);
                    window.print();
                  }}
                  className="btn-duo-outline !py-1.5 !px-3 text-xs"
                >
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </button>
              </div>
              <CvPreview cv={draft} />
            </>
          ) : (
            <Card className="print:hidden">
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground opacity-60" />
                <p className="font-display text-sm font-bold">Your CV preview appears here</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Generate a draft with AI or start from scratch.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {topUpOpen && <TopUpModal onClose={() => setTopUpOpen(false)} />}
    </div>
  );
}

function WalletPill({ balance, onTopUp }: { balance: number; onTopUp: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--gold)]/40 bg-[color:var(--gold)]/10 py-2 pl-3 pr-2">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--gold)]/20 text-[color:var(--gold)]">
        <Coins className="h-5 w-5" />
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Token balance
        </div>
        <div className="font-display text-lg font-bold leading-tight">
          {balance.toLocaleString("en-NG")}
        </div>
      </div>
      <button onClick={onTopUp} className="btn-duo !py-1.5 !px-3 text-xs">
        <CreditCard className="h-3.5 w-3.5" /> Top up
      </button>
    </div>
  );
}

function Sources({ sources }: { sources: CvState["sources"] }) {
  const items = [
    { ok: sources.onboarding_passed, label: "Onboarding tests passed" },
    {
      ok: sources.projects > 0,
      label: `${sources.projects} team project${sources.projects === 1 ? "" : "s"} graded`,
    },
    {
      ok: sources.portfolio_items > 0,
      label: `${sources.portfolio_items} portfolio item${sources.portfolio_items === 1 ? "" : "s"}`,
    },
    { ok: sources.certified, label: "Certificate issued" },
  ];
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-muted-foreground">What the AI will use</div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {items.map((i) => (
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
      {!sources.onboarding_passed && sources.projects === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          You don't have verified work yet, so the draft will lean on what you write below. It gets
          stronger as you finish{" "}
          <Link to="/tests" className="font-bold text-primary">
            tests
          </Link>{" "}
          and projects.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function Section({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1 text-xs font-bold text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function EntryBox({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
  return (
    <div className="relative flex flex-col gap-2 rounded-xl border border-border p-3 pr-10">
      <button
        onClick={onRemove}
        aria-label="Remove"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  );
}

const smallInput = inputCls.replace("px-4 py-3 text-base", "px-3 py-2 text-sm");

function Editor({ cv, onChange }: { cv: Cv; onChange: (cv: Cv) => void }) {
  const set = <K extends keyof Cv>(k: K, v: Cv[K]) => onChange({ ...cv, [k]: v });
  const setAt = <K extends "experience" | "projects" | "education" | "certifications">(
    k: K,
    i: number,
    patch: Partial<Cv[K][number]>,
  ) => set(k, cv[k].map((e, j) => (j === i ? { ...e, ...patch } : e)) as Cv[K]);
  const removeAt = <K extends "experience" | "projects" | "education" | "certifications">(
    k: K,
    i: number,
  ) => set(k, cv[k].filter((_, j) => j !== i) as Cv[K]);

  return (
    <div className="flex flex-col gap-4">
      <Section title="Basics">
        <input
          className={smallInput}
          value={cv.full_name}
          maxLength={80}
          onChange={(e) => set("full_name", e.target.value)}
          placeholder="Full name"
        />
        <input
          className={smallInput}
          value={cv.headline}
          maxLength={160}
          onChange={(e) => set("headline", e.target.value)}
          placeholder="Headline"
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <input
            className={smallInput}
            value={cv.contact.email}
            maxLength={120}
            onChange={(e) => set("contact", { ...cv.contact, email: e.target.value })}
            placeholder="Email"
          />
          <input
            className={smallInput}
            value={cv.contact.phone}
            maxLength={30}
            onChange={(e) => set("contact", { ...cv.contact, phone: e.target.value })}
            placeholder="Phone"
          />
          <input
            className={smallInput}
            value={cv.contact.location}
            maxLength={80}
            onChange={(e) => set("contact", { ...cv.contact, location: e.target.value })}
            placeholder="City"
          />
        </div>
        <textarea
          className={`${smallInput} min-h-16`}
          value={cv.contact.links.join("\n")}
          onChange={(e) =>
            set("contact", { ...cv.contact, links: e.target.value.split("\n").slice(0, 6) })
          }
          onBlur={(e) =>
            set("contact", { ...cv.contact, links: lines(e.target.value).slice(0, 6) })
          }
          placeholder="Links, one per line (portfolio, GitHub, LinkedIn)"
        />
      </Section>

      <Section title="Summary">
        <textarea
          className={`${smallInput} min-h-24`}
          value={cv.summary}
          maxLength={1200}
          onChange={(e) => set("summary", e.target.value)}
        />
      </Section>

      <Section title="Skills">
        <input
          className={smallInput}
          value={cv.skills.join(", ")}
          onChange={(e) =>
            set(
              "skills",
              e.target.value
                .split(",")
                .map((s) => s.trimStart())
                .slice(0, 30),
            )
          }
          onBlur={(e) =>
            set(
              "skills",
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 30),
            )
          }
          placeholder="Comma-separated"
        />
      </Section>

      <Section
        title="Experience"
        onAdd={() =>
          set("experience", [
            ...cv.experience,
            { title: "", organisation: "", period: "", bullets: [] },
          ])
        }
      >
        {cv.experience.map((e, i) => (
          <EntryBox key={i} onRemove={() => removeAt("experience", i)}>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={smallInput}
                value={e.title}
                maxLength={120}
                onChange={(ev) => setAt("experience", i, { title: ev.target.value })}
                placeholder="Title"
              />
              <input
                className={smallInput}
                value={e.organisation}
                maxLength={120}
                onChange={(ev) => setAt("experience", i, { organisation: ev.target.value })}
                placeholder="Organisation"
              />
            </div>
            <input
              className={smallInput}
              value={e.period}
              maxLength={60}
              onChange={(ev) => setAt("experience", i, { period: ev.target.value })}
              placeholder="Period, e.g. Jan 2026 – Present"
            />
            <BulletsInput
              value={e.bullets}
              onChange={(b) => setAt("experience", i, { bullets: b })}
            />
          </EntryBox>
        ))}
      </Section>

      <Section
        title="Projects"
        onAdd={() =>
          set("projects", [...cv.projects, { name: "", context: "", bullets: [], link: "" }])
        }
      >
        {cv.projects.map((p, i) => (
          <EntryBox key={i} onRemove={() => removeAt("projects", i)}>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={smallInput}
                value={p.name}
                maxLength={120}
                onChange={(ev) => setAt("projects", i, { name: ev.target.value })}
                placeholder="Project name"
              />
              <input
                className={smallInput}
                value={p.context}
                maxLength={200}
                onChange={(ev) => setAt("projects", i, { context: ev.target.value })}
                placeholder="Context"
              />
            </div>
            <input
              className={smallInput}
              value={p.link}
              maxLength={200}
              onChange={(ev) => setAt("projects", i, { link: ev.target.value })}
              placeholder="Link (optional)"
            />
            <BulletsInput
              value={p.bullets}
              onChange={(b) => setAt("projects", i, { bullets: b })}
            />
          </EntryBox>
        ))}
      </Section>

      <Section
        title="Education"
        onAdd={() =>
          set("education", [...cv.education, { school: "", qualification: "", period: "" }])
        }
      >
        {cv.education.map((e, i) => (
          <EntryBox key={i} onRemove={() => removeAt("education", i)}>
            <input
              className={smallInput}
              value={e.school}
              maxLength={120}
              onChange={(ev) => setAt("education", i, { school: ev.target.value })}
              placeholder="School"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={smallInput}
                value={e.qualification}
                maxLength={120}
                onChange={(ev) => setAt("education", i, { qualification: ev.target.value })}
                placeholder="Qualification"
              />
              <input
                className={smallInput}
                value={e.period}
                maxLength={60}
                onChange={(ev) => setAt("education", i, { period: ev.target.value })}
                placeholder="Period"
              />
            </div>
          </EntryBox>
        ))}
      </Section>

      <Section
        title="Certifications"
        onAdd={() =>
          set("certifications", [...cv.certifications, { name: "", issuer: "", code: "", url: "" }])
        }
      >
        {cv.certifications.map((c, i) => (
          <EntryBox key={i} onRemove={() => removeAt("certifications", i)}>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className={smallInput}
                value={c.name}
                maxLength={160}
                onChange={(ev) => setAt("certifications", i, { name: ev.target.value })}
                placeholder="Name"
              />
              <input
                className={smallInput}
                value={c.issuer}
                maxLength={80}
                onChange={(ev) => setAt("certifications", i, { issuer: ev.target.value })}
                placeholder="Issuer"
              />
            </div>
            <input
              className={smallInput}
              value={c.url}
              maxLength={200}
              onChange={(ev) => setAt("certifications", i, { url: ev.target.value })}
              placeholder="Verification link (optional)"
            />
          </EntryBox>
        ))}
      </Section>
    </div>
  );
}

/** One bullet per line; keeps the raw text while typing so blank lines don't vanish mid-edit. */
function BulletsInput({ value, onChange }: { value: string[]; onChange: (b: string[]) => void }) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => {
    if (lines(text).join("\n") !== value.join("\n")) setText(value.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <textarea
      className={`${smallInput} min-h-20`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          lines(e.target.value)
            .slice(0, 10)
            .map((l) => l.slice(0, 300)),
        );
      }}
      placeholder="Achievements, one per line"
    />
  );
}

// ---------------------------------------------------------------------------
// Preview (also the printed PDF: fixed light colours regardless of theme)
// ---------------------------------------------------------------------------
function CvPreview({ cv }: { cv: Cv }) {
  const contact = [
    cv.contact.email,
    cv.contact.phone,
    cv.contact.location,
    ...cv.contact.links,
  ].filter(Boolean);
  const H = ({ children }: { children: ReactNode }) => (
    <h3 className="mb-1.5 mt-5 border-b border-neutral-300 pb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-600">
      {children}
    </h3>
  );
  return (
    <article
      id="cv-print"
      className="rounded-2xl border border-border bg-white p-8 text-[13px] leading-relaxed text-neutral-900 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
    >
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-950">
          {cv.full_name || "Your name"}
        </h2>
        {cv.headline && (
          <p className="mt-0.5 text-sm font-semibold text-neutral-700">{cv.headline}</p>
        )}
        {contact.length > 0 && (
          <p className="mt-1.5 break-words text-xs text-neutral-600">{contact.join("  ·  ")}</p>
        )}
      </header>

      {cv.summary && (
        <>
          <H>Summary</H>
          <p className="whitespace-pre-line">{cv.summary}</p>
        </>
      )}

      {cv.skills.filter(Boolean).length > 0 && (
        <>
          <H>Skills</H>
          <p>{cv.skills.filter(Boolean).join(" · ")}</p>
        </>
      )}

      {cv.experience.length > 0 && (
        <>
          <H>Experience</H>
          {cv.experience.map((e, i) => (
            <div key={i} className="mb-3 break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-bold">
                  {e.title}
                  {e.organisation && (
                    <span className="font-normal text-neutral-700"> — {e.organisation}</span>
                  )}
                </span>
                <span className="text-xs text-neutral-500">{e.period}</span>
              </div>
              <Bullets items={e.bullets} />
            </div>
          ))}
        </>
      )}

      {cv.projects.length > 0 && (
        <>
          <H>Projects</H>
          {cv.projects.map((p, i) => (
            <div key={i} className="mb-3 break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-bold">
                  {p.name}
                  {p.context && (
                    <span className="font-normal text-neutral-700"> — {p.context}</span>
                  )}
                </span>
                {p.link && <span className="break-all text-xs text-neutral-500">{p.link}</span>}
              </div>
              <Bullets items={p.bullets} />
            </div>
          ))}
        </>
      )}

      {cv.education.length > 0 && (
        <>
          <H>Education</H>
          {cv.education.map((e, i) => (
            <div key={i} className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
              <span>
                <b>{e.school}</b>
                {e.qualification && <span className="text-neutral-700"> — {e.qualification}</span>}
              </span>
              <span className="text-xs text-neutral-500">{e.period}</span>
            </div>
          ))}
        </>
      )}

      {cv.certifications.length > 0 && (
        <>
          <H>Certifications</H>
          {cv.certifications.map((c, i) => (
            <div key={i} className="mb-1.5">
              <b>{c.name}</b>
              {c.issuer && <span className="text-neutral-700"> — {c.issuer}</span>}
              {c.url && (
                <span className="block break-all text-xs text-neutral-500">Verify: {c.url}</span>
              )}
            </div>
          ))}
        </>
      )}
    </article>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5">
      {items.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------
const useWallet = () => useQuery({ queryKey: ["wallet"], queryFn: () => api<Wallet>("/tokens") });

function TokenHistory() {
  const { data } = useWallet();
  if (!data || data.history.length === 0) return null;
  return (
    <Card>
      <CardTitle icon={History}>Token activity</CardTitle>
      <ul className="divide-y divide-border">
        {data.history.map((h) => (
          <li key={h.id} className="flex items-center justify-between py-2 text-sm">
            <span>
              <span className="font-semibold">{REASON_LABEL[h.reason] ?? h.reason}</span>
              <span className="block text-xs text-muted-foreground">
                {fmtDateTime(h.created_at)}
              </span>
            </span>
            <span
              className={`font-display font-bold ${h.delta > 0 ? "text-primary" : "text-muted-foreground"}`}
            >
              {h.delta > 0 ? "+" : ""}
              {h.delta.toLocaleString("en-NG")}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TopUpModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading, error } = useWallet();
  const [packId, setPackId] = useState<string | null>(null);
  const buy = useMutation({
    mutationFn: (pack_id: string) =>
      api<{ authorization_url: string }>("/tokens/purchase", { body: { pack_id } }),
    onSuccess: (r) => (window.location.href = r.authorization_url),
  });
  const selected = packId ?? data?.packs[0]?.id ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm print:hidden"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Top up tokens"
        className="card-duo w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[color:var(--gold)]/15 text-[color:var(--gold)]">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-base font-bold">Top up tokens</div>
              <div className="text-xs text-muted-foreground">
                {data
                  ? `Balance ${data.balance.toLocaleString("en-NG")} · CV draft costs ${data.costs.cv_generate}`
                  : "Paid securely with Paystack"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full border border-border"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {isLoading && <Spinner />}
        <ErrorNote error={error} />
        {data && (
          <div className="flex flex-col gap-2">
            {data.packs.map((p) => (
              <button
                key={p.id}
                onClick={() => setPackId(p.id)}
                className={`flex items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                  selected === p.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span>
                  <span className="block font-display font-bold">
                    {p.tokens.toLocaleString("en-NG")} tokens
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {p.name} · ~{Math.floor(p.tokens / data.costs.cv_generate)} CV drafts
                  </span>
                </span>
                <span className="font-display font-bold">{naira(p.amount_kobo)}</span>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => selected && buy.mutate(selected)}
          disabled={!selected || buy.isPending}
          className="btn-duo mt-4 w-full !py-2.5 text-sm"
        >
          <CreditCard className="h-4 w-4" />{" "}
          {buy.isPending ? "Opening Paystack…" : "Pay with Paystack"}
        </button>
        <ErrorNote error={buy.error} />
      </div>
    </div>
  );
}
