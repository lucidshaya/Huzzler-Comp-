import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SUPPORT_EMAIL } from "@/lib/site";

export type LegalSection = { id: string; title: string; body: ReactNode };

/** The shared layout for /terms and /privacy: a contents list beside the text. */
export function LegalPage({
  title,
  version,
  intro,
  sections,
}: {
  title: string;
  version: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/" className="inline-flex items-center gap-2">
            <img src="/huzzler-mark.svg" alt="" className="h-8 w-8" />
            <span className="font-display text-lg font-bold">Huzzler</span>
          </Link>
          <nav className="flex gap-5 text-sm font-semibold text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground [&.active]:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-foreground [&.active]:text-foreground">
              Privacy
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-10 px-5 py-12 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-8">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Contents
            </div>
            <ol className="mt-3 space-y-2 text-sm">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-muted-foreground hover:text-primary">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </aside>
        <article className="min-w-0 max-w-[68ch]">
          <h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Version {version}</p>
          <div className="mt-6 text-[15px] leading-relaxed">{intro}</div>
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="mt-10 scroll-mt-8">
              <h2 className="font-display text-xl font-bold">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-foreground/90 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
                {s.body}
              </div>
            </section>
          ))}
          <p className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
            Questions about this document? Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-primary">
              {SUPPORT_EMAIL}
            </a>{" "}
            or use Help &amp; support in the app.
          </p>
        </article>
      </main>
    </div>
  );
}
