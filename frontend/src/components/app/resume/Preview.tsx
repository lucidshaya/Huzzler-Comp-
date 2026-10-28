import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Cv } from "./model";

// The résumé page. Single column with standard headings and real text (no tables or images), so
// applicant tracking systems can read it. Rendered at A4 width and scaled to fit; printed unscaled.

const PAGE_W = 794; // A4 at 96 dpi

const FONTS = {
  serif: "Georgia, 'Times New Roman', Cambria, serif",
  sans: "'Helvetica Neue', Arial, 'Segoe UI', sans-serif",
};

export function ResumePage({ cv }: { cv: Cv }) {
  const wrap = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      if (wrap.current) setScale(Math.min(1, wrap.current.clientWidth / PAGE_W));
      if (page.current) setHeight(Math.max(1123, page.current.scrollHeight));
    });
    if (wrap.current) ro.observe(wrap.current);
    if (page.current) ro.observe(page.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} className="w-full" style={{ height: height * scale }}>
      <article
        id="cv-print"
        ref={page}
        className="hz-cv origin-top-left rounded-md bg-white text-neutral-900 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)] print:rounded-none print:shadow-none"
        style={
          {
            width: PAGE_W,
            minHeight: 1123,
            transform: `scale(${scale})`,
            fontFamily: FONTS[cv.design.font],
            "--accent": cv.design.accent,
          } as CSSProperties
        }
      >
        {cv.design.template === "classic" ? (
          <Classic cv={cv} />
        ) : cv.design.template === "compact" ? (
          <Compact cv={cv} />
        ) : (
          <Modern cv={cv} />
        )}
      </article>
    </div>
  );
}

const contactLine = (cv: Cv) =>
  [cv.contact.email, cv.contact.phone, cv.contact.location, ...cv.contact.links].filter(Boolean);

const name = (cv: Cv) =>
  `${cv.personal.first_name} ${cv.personal.last_name}`.trim() || cv.full_name || "Your name";

/** All sections in ATS-friendly order; `H` styles the heading for each template. */
function Body({
  cv,
  H,
  dense,
}: {
  cv: Cv;
  H: (p: { children: ReactNode }) => ReactNode;
  dense?: boolean;
}) {
  const gap = dense ? "mb-2" : "mb-3";
  const meta = "text-[11px] text-neutral-500";
  const extra = [
    cv.personal.nationality && `Nationality: ${cv.personal.nationality}`,
    cv.personal.availability && `Availability: ${cv.personal.availability}`,
  ].filter(Boolean);
  return (
    <>
      {cv.summary.trim() && (
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
          <H>Employment</H>
          {cv.experience.map((e, i) => (
            <div key={i} className={`${gap} break-inside-avoid`}>
              <Row
                left={
                  <>
                    <b>{e.title}</b>
                    {e.organisation && <span className="text-neutral-700">, {e.organisation}</span>}
                  </>
                }
                right={<span className={meta}>{e.period}</span>}
              />
              <Bullets items={e.bullets} />
            </div>
          ))}
        </>
      )}
      {cv.projects.length > 0 && (
        <>
          <H>Projects</H>
          {cv.projects.map((p, i) => (
            <div key={i} className={`${gap} break-inside-avoid`}>
              <Row
                left={
                  <>
                    <b>{p.name}</b>
                    {p.context && <span className="text-neutral-700">, {p.context}</span>}
                  </>
                }
                right={p.link && <span className={`${meta} break-all`}>{p.link}</span>}
              />
              <Bullets items={p.bullets} />
            </div>
          ))}
        </>
      )}
      {cv.education.length > 0 && (
        <>
          <H>Education</H>
          {cv.education.map((e, i) => (
            <Row
              key={i}
              left={
                <>
                  <b>{e.qualification || e.school}</b>
                  {e.qualification && e.school && (
                    <span className="text-neutral-700">, {e.school}</span>
                  )}
                </>
              }
              right={<span className={meta}>{e.period}</span>}
            />
          ))}
        </>
      )}
      {cv.courses.length > 0 && (
        <>
          <H>Courses</H>
          {cv.courses.map((c, i) => (
            <Row
              key={i}
              left={
                <>
                  <b>{c.name}</b>
                  {c.institution && <span className="text-neutral-700">, {c.institution}</span>}
                </>
              }
              right={<span className={meta}>{c.period}</span>}
            />
          ))}
        </>
      )}
      {cv.certifications.length > 0 && (
        <>
          <H>Certifications</H>
          {cv.certifications.map((c, i) => (
            <div key={i} className="mb-1">
              <b>{c.name}</b>
              {c.issuer && <span className="text-neutral-700">, {c.issuer}</span>}
              {c.url && <span className={`block ${meta} break-all`}>Verify: {c.url}</span>}
            </div>
          ))}
        </>
      )}
      {cv.custom.items.length > 0 && (
        <>
          <H>{cv.custom.title || "Additional"}</H>
          {cv.custom.items.map((it, i) => (
            <div key={i} className={`${gap} break-inside-avoid`}>
              <Row
                left={
                  <>
                    <b>{it.title}</b>
                    {it.subtitle && <span className="text-neutral-700">, {it.subtitle}</span>}
                  </>
                }
                right={<span className={meta}>{it.period}</span>}
              />
              {it.description && <p className="mt-0.5 whitespace-pre-line">{it.description}</p>}
            </div>
          ))}
        </>
      )}
      {cv.languages.length > 0 && (
        <>
          <H>Languages</H>
          <p>
            {cv.languages
              .map((l) => (l.level ? `${l.name} (${l.level})` : l.name))
              .filter(Boolean)
              .join(" · ")}
          </p>
        </>
      )}
      {cv.references.length > 0 && (
        <>
          <H>References</H>
          {cv.references.map((r, i) => (
            <div key={i} className="mb-1">
              <b>{r.name}</b>
              {r.company && <span className="text-neutral-700">, {r.company}</span>}
              {r.contact && <span className={`block ${meta}`}>{r.contact}</span>}
            </div>
          ))}
        </>
      )}
      {cv.hobbies.trim() && (
        <>
          <H>Hobbies</H>
          <p>{cv.hobbies}</p>
        </>
      )}
      {extra.length > 0 && <p className={`mt-4 ${meta}`}>{extra.join("  ·  ")}</p>}
    </>
  );
}

function Modern({ cv }: { cv: Cv }) {
  const H = ({ children }: { children: ReactNode }) => (
    <h3
      className="mb-1.5 mt-5 border-b pb-1 text-[11px] font-bold uppercase tracking-[0.2em]"
      style={{
        color: "var(--accent)",
        borderColor: "color-mix(in srgb, var(--accent) 30%, white)",
      }}
    >
      {children}
    </h3>
  );
  return (
    <div className="px-14 py-12 text-[12.5px] leading-relaxed">
      <header>
        <h1
          className="text-[34px] leading-tight"
          style={{ color: "var(--accent)", fontFamily: FONTS.serif }}
        >
          {name(cv)}
        </h1>
        {cv.headline && (
          <p className="mt-1 text-[13px] font-semibold uppercase tracking-[0.14em] text-neutral-700">
            {cv.headline}
          </p>
        )}
        {contactLine(cv).length > 0 && (
          <p className="mt-2 break-words text-[11.5px] text-neutral-600">
            {contactLine(cv).join("  ·  ")}
          </p>
        )}
      </header>
      <Body cv={cv} H={H} />
    </div>
  );
}

function Classic({ cv }: { cv: Cv }) {
  const H = ({ children }: { children: ReactNode }) => (
    <h3 className="mb-1.5 mt-5 border-b border-neutral-800 pb-0.5 text-[13px] font-bold uppercase tracking-wider">
      {children}
    </h3>
  );
  return (
    <div className="px-14 py-12 text-[12.5px] leading-relaxed">
      <header className="text-center">
        <h1 className="text-[28px] font-bold tracking-wide">{name(cv)}</h1>
        {cv.headline && <p className="mt-0.5 text-[13px] italic text-neutral-700">{cv.headline}</p>}
        {contactLine(cv).length > 0 && (
          <p className="mt-1.5 break-words text-[11.5px] text-neutral-600">
            {contactLine(cv).join("  |  ")}
          </p>
        )}
      </header>
      <Body cv={cv} H={H} />
    </div>
  );
}

function Compact({ cv }: { cv: Cv }) {
  const H = ({ children }: { children: ReactNode }) => (
    <h3 className="mb-1 mt-3.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]">
      <span className="h-3 w-1 rounded-full" style={{ background: "var(--accent)" }} />
      {children}
    </h3>
  );
  return (
    <div className="px-11 py-9 text-[11.5px] leading-snug">
      <header className="border-b-2 pb-2" style={{ borderColor: "var(--accent)" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h1 className="text-[24px] font-bold">{name(cv)}</h1>
          {cv.headline && (
            <p className="text-[12px] font-semibold" style={{ color: "var(--accent)" }}>
              {cv.headline}
            </p>
          )}
        </div>
        {contactLine(cv).length > 0 && (
          <p className="mt-1 break-words text-[10.5px] text-neutral-600">
            {contactLine(cv).join("  ·  ")}
          </p>
        )}
      </header>
      <Body cv={cv} H={H} dense />
    </div>
  );
}

function Row({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <span>{left}</span>
      {right}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  const list = items.filter((b) => b.trim());
  if (!list.length) return null;
  return (
    <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
      {list.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
}
