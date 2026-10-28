import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { inputCls } from "../ui";
import type { Cv, SectionKey } from "./model";

// One editor per résumé section (Write mode). Each edits the Cv in place through `onChange`.

const input = inputCls.replace("px-4 py-3 text-base", "px-3.5 py-2.5 text-sm");

function F({
  label,
  value,
  onChange,
  max,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        type={type}
        className={input}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  max,
  placeholder,
  rows = 4,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
        {label}
        <span className="font-normal">
          {value.length}/{max}
        </span>
      </span>
      <textarea
        className={input}
        rows={rows}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** One bullet per line; keeps the raw text while typing so blank lines don't vanish mid-edit. */
function BulletsArea({ value, onChange }: { value: string[]; onChange: (b: string[]) => void }) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => {
    if (
      text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n") !== value.join("\n")
    )
      setText(value.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">
        Achievements (one per line)
      </span>
      <textarea
        className={input}
        rows={4}
        value={text}
        placeholder={"Built the checkout flow used by 2,000 traders\nCut page load time by 40%"}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split("\n")
              .map((l) => l.trim().slice(0, 300))
              .filter(Boolean)
              .slice(0, 10),
          );
        }}
      />
    </label>
  );
}

/** Collapsible entry card used by every list section. */
function Entry({
  title,
  sub,
  open,
  onToggle,
  onRemove,
  children,
}: {
  title: string;
  sub?: string;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="hz-fade-up rounded-2xl border border-border bg-background/40">
      <div className="flex items-center gap-2 p-3">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{title || "(not specified)"}</span>
            {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
          </span>
        </button>
        <button
          onClick={onRemove}
          aria-label="Remove"
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {open && <div className="flex flex-col gap-3 border-t border-border p-3">{children}</div>}
    </div>
  );
}

function List<T>({
  items,
  onChange,
  blank,
  addLabel,
  head,
  render,
  max,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  blank: T;
  addLabel: string;
  head: (item: T) => { title: string; sub?: string };
  render: (item: T, set: (patch: Partial<T>) => void) => ReactNode;
  max: number;
}) {
  const [open, setOpen] = useState<number | null>(items.length ? null : 0);
  return (
    <div className="flex flex-col gap-3">
      {items.map((it, i) => (
        <Entry
          key={i}
          {...head(it)}
          open={open === i}
          onToggle={() => setOpen(open === i ? null : i)}
          onRemove={() => onChange(items.filter((_, j) => j !== i))}
        >
          {render(it, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))))}
        </Entry>
      ))}
      {items.length < max && (
        <button
          onClick={() => {
            onChange([...items, blank]);
            setOpen(items.length);
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-bold text-primary hover:bg-primary/10"
        >
          <Plus className="h-4 w-4" /> {addLabel}
        </button>
      )}
    </div>
  );
}

const grid = "grid gap-3 sm:grid-cols-2";

export function SectionEditor({
  section,
  cv,
  onChange,
}: {
  section: SectionKey;
  cv: Cv;
  onChange: (cv: Cv) => void;
}) {
  const set = <K extends keyof Cv>(k: K, v: Cv[K]) => onChange({ ...cv, [k]: v });
  const [more, setMore] = useState(Boolean(cv.personal.nationality || cv.personal.availability));
  const [skill, setSkill] = useState("");

  switch (section) {
    case "personal":
      return (
        <div className="flex flex-col gap-3">
          <div className={grid}>
            <F
              label="First name"
              value={cv.personal.first_name}
              max={40}
              onChange={(v) => set("personal", { ...cv.personal, first_name: v })}
            />
            <F
              label="Last name"
              value={cv.personal.last_name}
              max={40}
              onChange={(v) => set("personal", { ...cv.personal, last_name: v })}
            />
          </div>
          <F
            label="Desired job title"
            value={cv.headline}
            max={160}
            placeholder="e.g. Junior Frontend Engineer"
            onChange={(v) => set("headline", v)}
          />
          {more ? (
            <div className={`${grid} hz-fade-up`}>
              <F
                label="Nationality"
                value={cv.personal.nationality}
                max={60}
                onChange={(v) => set("personal", { ...cv.personal, nationality: v })}
              />
              <F
                label="Availability"
                value={cv.personal.availability}
                max={80}
                placeholder="e.g. Immediately, remote or Lagos"
                onChange={(v) => set("personal", { ...cv.personal, availability: v })}
              />
            </div>
          ) : (
            <button
              onClick={() => setMore(true)}
              className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-primary"
            >
              <Plus className="h-4 w-4" /> Show additional details
            </button>
          )}
        </div>
      );
    case "contact":
      return (
        <div className="flex flex-col gap-3">
          <div className={grid}>
            <F
              label="Email"
              type="email"
              value={cv.contact.email}
              max={120}
              onChange={(v) => set("contact", { ...cv.contact, email: v })}
            />
            <F
              label="Phone"
              value={cv.contact.phone}
              max={30}
              onChange={(v) => set("contact", { ...cv.contact, phone: v })}
            />
          </div>
          <F
            label="City, country"
            value={cv.contact.location}
            max={80}
            placeholder="Lagos, Nigeria"
            onChange={(v) => set("contact", { ...cv.contact, location: v })}
          />
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Links (portfolio, GitHub, LinkedIn)
            </span>
            {cv.contact.links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={input}
                  value={l}
                  maxLength={200}
                  placeholder="https://"
                  onChange={(e) =>
                    set("contact", {
                      ...cv.contact,
                      links: cv.contact.links.map((x, j) => (j === i ? e.target.value : x)),
                    })
                  }
                />
                <button
                  aria-label="Remove link"
                  onClick={() =>
                    set("contact", {
                      ...cv.contact,
                      links: cv.contact.links.filter((_, j) => j !== i),
                    })
                  }
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {cv.contact.links.length < 6 && (
              <button
                onClick={() => set("contact", { ...cv.contact, links: [...cv.contact.links, ""] })}
                className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-primary"
              >
                <Plus className="h-4 w-4" /> Add link
              </button>
            )}
          </div>
        </div>
      );
    case "employment":
      return (
        <List
          items={cv.experience}
          onChange={(v) => set("experience", v)}
          max={10}
          addLabel="Add employment"
          blank={{ title: "", organisation: "", period: "", bullets: [] }}
          head={(e) => ({
            title: e.title,
            sub: [e.organisation, e.period].filter(Boolean).join(" · "),
          })}
          render={(e, s) => (
            <>
              <div className={grid}>
                <F label="Job title" value={e.title} max={120} onChange={(v) => s({ title: v })} />
                <F
                  label="Employer"
                  value={e.organisation}
                  max={120}
                  onChange={(v) => s({ organisation: v })}
                />
              </div>
              <F
                label="Start – end"
                value={e.period}
                max={60}
                placeholder="Jan 2026 – Present"
                onChange={(v) => s({ period: v })}
              />
              <BulletsArea value={e.bullets} onChange={(b) => s({ bullets: b })} />
            </>
          )}
        />
      );
    case "education":
      return (
        <List
          items={cv.education}
          onChange={(v) => set("education", v)}
          max={6}
          addLabel="Add education"
          blank={{ school: "", qualification: "", period: "" }}
          head={(e) => ({
            title: e.qualification || e.school,
            sub: [e.school, e.period].filter(Boolean).join(" · "),
          })}
          render={(e, s) => (
            <>
              <F label="School" value={e.school} max={120} onChange={(v) => s({ school: v })} />
              <div className={grid}>
                <F
                  label="Degree or qualification"
                  value={e.qualification}
                  max={120}
                  onChange={(v) => s({ qualification: v })}
                />
                <F
                  label="Start – end"
                  value={e.period}
                  max={60}
                  placeholder="2022 – 2026"
                  onChange={(v) => s({ period: v })}
                />
              </div>
            </>
          )}
        />
      );
    case "courses":
      return (
        <List
          items={cv.courses}
          onChange={(v) => set("courses", v)}
          max={10}
          addLabel="Add course"
          blank={{ name: "", institution: "", period: "" }}
          head={(c) => ({
            title: c.name,
            sub: [c.institution, c.period].filter(Boolean).join(" · "),
          })}
          render={(c, s) => (
            <>
              <F label="Course" value={c.name} max={120} onChange={(v) => s({ name: v })} />
              <div className={grid}>
                <F
                  label="Institution"
                  value={c.institution}
                  max={120}
                  onChange={(v) => s({ institution: v })}
                />
                <F label="When" value={c.period} max={60} onChange={(v) => s({ period: v })} />
              </div>
            </>
          )}
        />
      );
    case "portfolio":
      return (
        <List
          items={cv.projects}
          onChange={(v) => set("projects", v)}
          max={12}
          addLabel="Add project"
          blank={{ name: "", context: "", bullets: [], link: "" }}
          head={(p) => ({ title: p.name, sub: p.context })}
          render={(p, s) => (
            <>
              <div className={grid}>
                <F label="Project" value={p.name} max={120} onChange={(v) => s({ name: v })} />
                <F
                  label="Context"
                  value={p.context}
                  max={200}
                  placeholder="Team of 5, fintech, 4 weeks"
                  onChange={(v) => s({ context: v })}
                />
              </div>
              <F
                label="Link"
                value={p.link}
                max={200}
                placeholder="https://"
                onChange={(v) => s({ link: v })}
              />
              <BulletsArea value={p.bullets} onChange={(b) => s({ bullets: b })} />
            </>
          )}
        />
      );
    case "skills":
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {cv.skills.filter(Boolean).map((sk, i) => (
              <span
                key={`${sk}-${i}`}
                className="hz-fade-up inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-1 pl-3 pr-1 text-sm font-semibold text-primary"
              >
                {sk}
                <button
                  aria-label={`Remove ${sk}`}
                  onClick={() =>
                    set(
                      "skills",
                      cv.skills.filter((_, j) => j !== i),
                    )
                  }
                  className="grid h-6 w-6 place-items-center rounded-full hover:bg-primary/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {!cv.skills.length && (
              <span className="text-sm text-muted-foreground">No skills yet.</span>
            )}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const add = skill
                .split(",")
                .map((x) => x.trim().slice(0, 60))
                .filter((x) => x && !cv.skills.some((s) => s.toLowerCase() === x.toLowerCase()));
              if (add.length) set("skills", [...cv.skills, ...add].slice(0, 30));
              setSkill("");
            }}
          >
            <input
              className={input}
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              placeholder="Type a skill and press Enter (commas for several)"
            />
            <button className="btn-duo shrink-0 !py-2 !px-4 text-sm" disabled={!skill.trim()}>
              <Plus className="h-4 w-4" /> Add
            </button>
          </form>
        </div>
      );
    case "references":
      return (
        <List
          items={cv.references}
          onChange={(v) => set("references", v)}
          max={6}
          addLabel="Add reference"
          blank={{ name: "", company: "", contact: "" }}
          head={(r) => ({ title: r.name, sub: r.company })}
          render={(r, s) => (
            <>
              <div className={grid}>
                <F label="Name" value={r.name} max={80} onChange={(v) => s({ name: v })} />
                <F
                  label="Company and role"
                  value={r.company}
                  max={120}
                  onChange={(v) => s({ company: v })}
                />
              </div>
              <F
                label="Email or phone"
                value={r.contact}
                max={160}
                onChange={(v) => s({ contact: v })}
              />
            </>
          )}
        />
      );
    case "hobbies":
      return (
        <Area
          label="Hobbies and interests"
          value={cv.hobbies}
          max={400}
          rows={3}
          placeholder="Chess, mentoring at a coding club, football"
          onChange={(v) => set("hobbies", v)}
        />
      );
    case "custom":
      return (
        <div className="flex flex-col gap-3">
          <F
            label="Section heading"
            value={cv.custom.title}
            max={60}
            placeholder="e.g. Volunteering, Awards, Leadership"
            onChange={(v) => set("custom", { ...cv.custom, title: v })}
          />
          <List
            items={cv.custom.items}
            onChange={(v) => set("custom", { ...cv.custom, items: v })}
            max={8}
            addLabel="Add item"
            blank={{ title: "", subtitle: "", period: "", description: "" }}
            head={(it) => ({
              title: it.title,
              sub: [it.subtitle, it.period].filter(Boolean).join(" · "),
            })}
            render={(it, s) => (
              <>
                <div className={grid}>
                  <F label="Title" value={it.title} max={120} onChange={(v) => s({ title: v })} />
                  <F
                    label="Organisation"
                    value={it.subtitle}
                    max={120}
                    onChange={(v) => s({ subtitle: v })}
                  />
                </div>
                <F label="When" value={it.period} max={60} onChange={(v) => s({ period: v })} />
                <Area
                  label="Description"
                  value={it.description}
                  max={600}
                  rows={3}
                  onChange={(v) => s({ description: v })}
                />
              </>
            )}
          />
        </div>
      );
    case "languages":
      return (
        <List
          items={cv.languages}
          onChange={(v) => set("languages", v)}
          max={10}
          addLabel="Add language"
          blank={{ name: "", level: "" }}
          head={(l) => ({ title: l.name, sub: l.level })}
          render={(l, s) => (
            <div className={grid}>
              <F label="Language" value={l.name} max={40} onChange={(v) => s({ name: v })} />
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Level</span>
                <select
                  className={input}
                  value={l.level}
                  onChange={(e) => s({ level: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {["Native", "Fluent", "Professional", "Intermediate", "Basic"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        />
      );
    case "summary":
      return (
        <Area
          label="Professional summary"
          value={cv.summary}
          max={1200}
          rows={7}
          placeholder="Junior frontend engineer who has shipped 5 team projects…"
          hint="Aim for 30–120 words. Mention your field, your strongest skills and what you want next."
          onChange={(v) => set("summary", v)}
        />
      );
  }
}
