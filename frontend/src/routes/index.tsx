import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import heroImg from "@/assets/hero.png";
import gatewayImg from "@/assets/gateway.png";
import studioImg from "@/assets/studio.png";
import identityImg from "@/assets/identity.png";
import {
  Code2,
  Palette,
  ClipboardList,
  BarChart3,
  Cpu,
  Wrench,
  Bug,
  Smartphone,
  Zap,
  Users,
  Trophy,
  Target,
  CheckCircle2,
  Dna,
  Rocket,
  GraduationCap,
  UserCircle2,
  Flame,
  MapPin,
  Check,
  Twitter,
  Linkedin,
  Github,
  Instagram,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Huzzler | Experience as a Software for African Builders" },
      {
        name: "description",
        content:
          "Huzzler is an AI platform that helps African builders at every level earn real cross-functional product experience by shipping real products with real teams.",
      },
      { property: "og:title", content: "Huzzler | Experience as a Software for African Builders" },
      {
        property: "og:description",
        content:
          "Break the no-experience loop. Get verified by AI, join real product teams, and build the portfolio that gets you hired.",
      },
      { property: "og:url", content: "/" },
      { property: "og:image", content: "/og-image.png" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Huzzler | Experience as a Software for African Builders" },
      {
        name: "twitter:description",
        content:
          "Break the no-experience loop. Get verified by AI, join real product teams, and build the portfolio that gets you hired.",
      },
      { name: "twitter:image", content: "/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Index,
});

const roles: { label: string; Icon: LucideIcon }[] = [
  { label: "Frontend Engineer", Icon: Code2 },
  { label: "UI / UX Designer", Icon: Palette },
  { label: "Product Manager", Icon: ClipboardList },
  { label: "Data Analyst", Icon: BarChart3 },
  { label: "AI / ML Engineer", Icon: Cpu },
  { label: "Backend Engineer", Icon: Wrench },
  { label: "QA Tester", Icon: Bug },
  { label: "Mobile Developer", Icon: Smartphone },
];

// 2D styled icon tile - soft square in brand sky blue
function IconTile({ Icon, size = "md" }: { Icon: LucideIcon; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-7 w-7 rounded-lg",
    md: "h-10 w-10 rounded-xl",
    lg: "h-12 w-12 rounded-2xl",
  } as const;
  const icon = {
    sm: 14,
    md: 20,
    lg: 24,
  } as const;
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${sizes[size]} bg-[color-mix(in_oklab,var(--primary)_12%,white)] text-[var(--primary)] ring-1 ring-[color-mix(in_oklab,var(--primary)_22%,white)]`}
    >
      <Icon size={icon[size]} strokeWidth={2.25} />
    </span>
  );
}

function Heatmap() {
  const weeks = 17;
  const days = 7;
  const levels = ["#eef2f7", "#bfe8ff", "#66d4ff", "#00bfff", "#0090c4"];
  const cells: number[] = [];
  let seed = 42;
  for (let i = 0; i < weeks * days; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const r = seed / 233280;
    cells.push(r < 0.35 ? 0 : r < 0.55 ? 1 : r < 0.78 ? 2 : r < 0.93 ? 3 : 4);
  }
  return (
    <div
      className="grid gap-[3px]"
      style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: weeks }).map((_, w) => (
        <div
          key={w}
          className="grid gap-[3px]"
          style={{ gridTemplateRows: `repeat(${days}, 1fr)` }}
        >
          {Array.from({ length: days }).map((_, d) => (
            <div
              key={d}
              className="aspect-square rounded-[3px]"
              style={{ backgroundColor: levels[cells[w * days + d]] }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return <img src="/huzzler-logo.svg" alt="Huzzler" className={className} />;
}

function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const island =
    "mx-auto max-w-3xl px-5 py-2 bg-white/95 rounded-full shadow-xl shadow-black/10 ring-1 ring-black/5 backdrop-blur";
  const full = "mx-auto max-w-6xl px-5 py-3.5 bg-white/85 border-b border-border backdrop-blur";

  return (
    <header
      className={`sticky top-0 z-30 ${scrolled ? "pt-3 px-4" : "pt-0 px-0"}`}
      style={{ transition: "padding 250ms ease" }}
    >
      <div
        className={`flex items-center justify-between ${scrolled ? island : full}`}
        style={{
          transition:
            "max-width 250ms ease, padding 250ms ease, border-radius 250ms ease, box-shadow 250ms ease, background-color 250ms ease",
        }}
      >
        <a href="#top" className="flex items-center gap-2">
          <Logo className={`w-auto ${scrolled ? "h-6" : "h-8"}`} />
        </a>
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-charcoal/75">
          <a href="#loop" className="hover:text-primary transition-colors">
            How it works
          </a>
          <a href="#pillars" className="hover:text-primary transition-colors">
            Pillars
          </a>
          <a href="#profile" className="hover:text-primary transition-colors">
            Your profile
          </a>
          <a href="#roles" className="hover:text-primary transition-colors">
            Roles
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="/auth?mode=signup"
            className={`hidden md:inline-flex btn-duo ${scrolled ? "!py-2 !px-3.5 text-xs" : "!py-2.5 !px-4"}`}
          >
            Get started
          </a>
          <button
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-muted text-foreground md:hidden hover:border-primary/40 hover:text-primary transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function Index() {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Landing page is always light. Remove the `dark` class if user navigated
  // here from a dark-mode surface (dashboard/auth/onboarding). Restore on unmount.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    if (wasDark) root.classList.remove("dark");
    return () => {
      if (wasDark) root.classList.add("dark");
    };
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => document.body.classList.remove("overflow-hidden");
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ overflowX: "clip" }}>
      {/* Top roles marquee */}
      <div id="roles" className="bg-primary text-white overflow-hidden py-2">
        <div className="flex w-max marquee-track">
          {[...roles, ...roles, ...roles, ...roles].map((r, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-6 text-[11px] font-semibold uppercase tracking-[0.18em] shrink-0"
            >
              <r.Icon size={12} strokeWidth={2.75} />
              {r.label}
            </div>
          ))}
        </div>
      </div>

      {/* Nav */}
      <Header onOpenMenu={() => setMobileOpen(true)} />

      {/* Mobile menu drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed left-0 top-0 z-50 h-full w-[280px] max-w-[80vw] border-r border-border bg-background p-5 md:hidden">
            <div className="mb-8 flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <img src="/huzzler-logo.svg" alt="Huzzler" className="h-7 w-auto" />
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              <a
                href="#loop"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left font-display text-sm font-bold tracking-tight text-charcoal/75 hover:text-primary transition-colors"
              >
                How it works
              </a>
              <a
                href="#pillars"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left font-display text-sm font-bold tracking-tight text-charcoal/75 hover:text-primary transition-colors"
              >
                Pillars
              </a>
              <a
                href="#profile"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left font-display text-sm font-bold tracking-tight text-charcoal/75 hover:text-primary transition-colors"
              >
                Your profile
              </a>
              <a
                href="#roles"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left font-display text-sm font-bold tracking-tight text-charcoal/75 hover:text-primary transition-colors"
              >
                Roles
              </a>
            </nav>

            <div className="mt-8 flex flex-col gap-3">
              <a
                href="/auth?mode=signup"
                onClick={() => setMobileOpen(false)}
                className="btn-duo w-full justify-center text-sm"
              >
                Get started
              </a>
              <a
                href="/auth"
                onClick={() => setMobileOpen(false)}
                className="btn-duo-outline w-full justify-center text-sm"
              >
                Log in
              </a>
            </div>
          </div>
        </>
      )}

      {/* Hero */}
      <section id="top" className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-5 pt-16 pb-16 md:grid-cols-2 md:pt-24 md:pb-24">
          <div className="order-2 md:order-1">
            <span className="chip">
              <MapPin size={12} strokeWidth={2.5} /> Built for Africa
            </span>
            <h1 className="mt-5 text-5xl leading-[1.02] md:text-6xl md:leading-[1.02]">
              <span className="text-charcoal">Experience</span>{" "}
              <span className="text-primary">as a service.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-charcoal/70 leading-relaxed">
              Prove your skills, join a real team of real people, ship five projects of rising
              difficulty and earn a verifiable certificate. Built for young African tech talent,
              mobile-first.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="/auth?mode=signup" className="btn-duo">
                Get started
              </a>
              <a href="#pricing" className="btn-duo-outline">
                See pricing
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-5 text-sm text-charcoal/75 font-semibold">
              <div className="flex items-center gap-2">
                <IconTile Icon={Zap} size="sm" /> AI-verified skills
              </div>
              <div className="flex items-center gap-2">
                <IconTile Icon={Users} size="sm" /> Real team projects
              </div>
              <div className="flex items-center gap-2">
                <IconTile Icon={Trophy} size="sm" /> Verifiable certificate
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2 relative">
            <img
              src={heroImg}
              alt="Diverse African tech team collaborating"
              width={1200}
              height={1000}
              className="mx-auto w-full max-w-[560px] animate-float"
            />
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <div className="grid gap-10 md:grid-cols-2 md:gap-16 items-start">
          <div>
            <span className="chip">The problem</span>
            <h2 className="mt-4 text-4xl md:text-5xl leading-[1.05]">
              You can't get a job <span className="text-primary">without experience</span>. You
              can't get experience <span className="text-primary">without a job</span>.
            </h2>
          </div>
          <p className="text-lg md:text-xl leading-relaxed text-charcoal/75 md:mt-14">
            Bootcamps teach syntax. Tutorials teach patterns. Neither teaches you how to ship a
            feature with a PM setting scope, a designer iterating on Figma, and a QA logging bugs.
            <br />
            <br />
            <span className="text-primary font-bold">
              Huzzler puts you on real product teams.
            </span>{" "}
            Five onboarding tests verify your skills. You're matched into a squad of real people in
            other roles. Together you ship five projects, from a warm-up feature to a full product,
            with AI-assisted grading and a mentor when you're stuck. You leave with a certificate
            and a portfolio that prove you can ship.
          </p>
        </div>
      </section>

      {/* The Loop */}
      <section
        id="loop"
        className="bg-gradient-to-b from-white to-[oklch(0.98_0.015_235)] border-y border-border"
      >
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <div className="max-w-2xl">
            <span className="chip">The experience loop</span>
            <h2 className="mt-4 text-4xl md:text-5xl leading-[1.05]">
              From zero to certified in four steps.
            </h2>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-4">
            {[
              {
                n: "01",
                title: "Pick your role",
                body: "Choose one of 8 roles, explore the full dashboard preview, then begin onboarding.",
                Icon: Target,
              },
              {
                n: "02",
                title: "Pass 5 tests",
                body: "Fundamentals, a practical task, a core deliverable, a workplace scenario and teamwork judgement. Pass mark 70%.",
                Icon: CheckCircle2,
              },
              {
                n: "03",
                title: "Join a real team",
                body: "Accept a simulated internship offer and get matched with real people in the other roles.",
                Icon: Dna,
              },
              {
                n: "04",
                title: "Ship 5 projects",
                body: "From a warm-up feature to a full product your team builds and demos. Then get certified.",
                Icon: Rocket,
              },
            ].map((s) => (
              <div key={s.n} className="card-duo p-6 relative">
                <div className="text-xs font-semibold text-primary tracking-[0.15em]">
                  STEP {s.n}
                </div>
                <div className="mt-3">
                  <IconTile Icon={s.Icon} size="lg" />
                </div>
                <h3 className="mt-3 text-xl">{s.title}</h3>
                <p className="mt-2 text-charcoal/70 text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section
        id="pillars"
        className="mx-auto max-w-6xl px-5 py-20 md:py-28 space-y-24 md:space-y-32"
      >
        <div className="grid gap-10 md:grid-cols-2 items-center">
          <div>
            <span className="chip">
              <GraduationCap size={12} strokeWidth={2.5} /> Pillar 01 - The Gateway
            </span>
            <h2 className="mt-4 text-4xl md:text-5xl text-primary leading-[1.05]">
              AI that knows if you can actually do the job.
            </h2>
            <p className="mt-5 text-lg text-charcoal/75 leading-relaxed">
              Every user faces a role-based evaluation task. Our AI evaluation engine parses your
              submission against a strict rubric and returns a score from 0 to 100 with qualitative
              feedback, like a senior manager reviewing your first deliverable.
            </p>
            <ul className="mt-6 space-y-3 font-semibold text-charcoal">
              {[
                "Real-world tasks per discipline (Frontend, UI/UX, PM, Data, AI)",
                "Structured JSON rubric scoring with no vibes-based grading",
                "Badge celebrations when you pass",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white shrink-0">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <img
              src={gatewayImg}
              alt="AI evaluator grading a submission"
              width={900}
              height={900}
              loading="lazy"
              className="mx-auto w-full max-w-[420px] animate-float"
            />
          </div>
        </div>

        <div className="grid gap-10 md:grid-cols-2 items-center">
          <div className="order-2 md:order-1 relative">
            <img
              src={studioImg}
              alt="Collaboration tree of a cross-functional Huzzler team"
              width={900}
              height={900}
              loading="lazy"
              className="mx-auto w-full max-w-[460px] animate-float"
            />
          </div>
          <div className="order-1 md:order-2">
            <span className="chip">
              <Users size={12} strokeWidth={2.5} /> Pillar 02 - The Studio
            </span>
            <h2 className="mt-4 text-4xl md:text-5xl text-primary leading-[1.05]">
              Dropped into a real team. In minutes.
            </h2>
            <p className="mt-5 text-lg text-charcoal/75 leading-relaxed">
              When a product team needs talent, the AI autonomously drafts a verified crew: 1 PM, 2
              React engineers, 1 designer, 1 data analyst. You drop into a shared workspace with a
              visual collaboration tree showing how everyone connects and ships live features.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                { k: "Auto-planned", v: "Tailored timelines & sprints" },
                { k: "Role-specific", v: "Digestible mini-tasks per role" },
                { k: "Visual", v: "Collaboration tree diagram" },
                { k: "Live", v: "Real-time progress milestones" },
              ].map((f) => (
                <div key={f.k} className="card-duo p-4">
                  <div className="text-[10px] font-bold text-primary uppercase tracking-[0.15em]">
                    {f.k}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-charcoal/80">{f.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-10 md:grid-cols-2 items-center">
          <div>
            <span className="chip">
              <UserCircle2 size={12} strokeWidth={2.5} /> Pillar 03 - Developer Identity
            </span>
            <h2 className="mt-4 text-4xl md:text-5xl text-primary leading-[1.05]">
              A living portfolio that proves you ship.
            </h2>
            <p className="mt-5 text-lg text-charcoal/75 leading-relaxed">
              Every task you complete feeds your contribution heatmap, your Trophy Room of skill
              badges, and your public profile: the receipts that get you hired.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {["React", "Figma", "Product", "SQL", "TypeScript", "Tailwind", "AI Prompting"].map(
                (b) => (
                  <span key={b} className="chip !bg-white !text-charcoal !border-border">
                    {b}
                  </span>
                ),
              )}
            </div>
          </div>
          <div className="relative">
            <img
              src={identityImg}
              alt="Developer identity profile card with heatmap and badges"
              width={900}
              height={900}
              loading="lazy"
              className="mx-auto w-full max-w-[440px] animate-float"
            />
          </div>
        </div>
      </section>

      {/* Heatmap Preview */}
      <section id="profile" className="border-y border-border bg-white">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
          <div className="grid gap-10 md:grid-cols-[1fr_1.3fr] items-center">
            <div>
              <span className="chip">Contribution heatmap</span>
              <h2 className="mt-4 text-4xl md:text-5xl leading-[1.05]">
                Consistency, <span className="text-primary">visualized.</span>
              </h2>
              <p className="mt-4 text-lg text-charcoal/75 leading-relaxed">
                Employers don't want a resume. They want proof. Your Huzzler heatmap shows exactly
                how often you show up and ship.
              </p>
              <div className="mt-6 flex items-center gap-4 text-sm font-semibold text-charcoal/60">
                <span>Less</span>
                <div className="flex gap-1">
                  {["#eef2f7", "#bfe8ff", "#66d4ff", "#00bfff", "#0090c4"].map((c) => (
                    <span
                      key={c}
                      className="h-4 w-4 rounded-[3px]"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <span>More</span>
              </div>
            </div>
            <div className="card-duo p-6 md:p-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.15em] text-charcoal/50">
                    Chidi O.
                  </div>
                  <div className="text-xl font-bold text-primary mt-0.5">
                    247 contributions this year
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="chip">
                    <Flame size={12} strokeWidth={2.5} /> 12-day streak
                  </span>
                </div>
              </div>
              <Heatmap />
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { k: "Projects", v: "8" },
                  { k: "Tasks shipped", v: "162" },
                  { k: "Badges", v: "17" },
                ].map((s) => (
                  <div key={s.k} className="rounded-xl bg-secondary p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{s.v}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-charcoal/60 mt-1">
                      {s.k}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { n: "8", l: "Roles to choose from" },
            { n: "5", l: "Team projects, ending in a full product" },
            { n: "1", l: "Verifiable certificate" },
          ].map((s) => (
            <div key={s.l} className="card-duo p-8 text-center">
              <div className="text-5xl font-bold text-primary">{s.n}</div>
              <div className="mt-2 font-semibold text-charcoal/60">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 pb-24">
        <div className="max-w-2xl">
          <span className="chip">Pricing</span>
          <h2 className="mt-4 text-4xl md:text-5xl leading-[1.05]">
            One price. <span className="text-primary">The whole journey.</span>
          </h2>
          <p className="mt-4 text-lg text-charcoal/70">
            Sign up and explore the full dashboard preview free. Pay when you begin onboarding, by
            card, bank transfer or USSD through Paystack.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {[
            {
              name: "One-time",
              price: "₦5,000",
              per: "once",
              note: "Best value. 6 months of access to finish the full journey.",
              featured: true,
            },
            {
              name: "Monthly",
              price: "₦2,500",
              per: "/ month",
              note: "Same features while your subscription is active. Cancel any time.",
            },
          ].map((p) => (
            <div
              key={p.name}
              className={`card-duo relative p-8 ${p.featured ? "ring-2 ring-primary" : ""}`}
            >
              {p.featured && <span className="chip absolute right-6 top-6">Most popular</span>}
              <div className="text-sm font-bold uppercase tracking-[0.15em] text-charcoal/60">
                {p.name}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-5xl font-bold text-charcoal">{p.price}</span>
                <span className="font-semibold text-charcoal/60">{p.per}</span>
              </div>
              <p className="mt-3 text-charcoal/70">{p.note}</p>
              <ul className="mt-6 space-y-2.5 text-sm font-semibold text-charcoal/80">
                {[
                  "5 onboarding tests, 2 attempts",
                  "Simulated internship offers",
                  "A real team and 5 projects",
                  "Hints and AI mentor chat",
                  "Verifiable certificate and portfolio",
                ].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-primary shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <a
                href="/auth?mode=signup"
                className={`${p.featured ? "btn-duo" : "btn-duo-outline"} mt-8 w-full`}
              >
                Get started
              </a>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-charcoal/60">
          Ages 17+. Users aged 17 need a parent or guardian's consent before paying. Offers are
          simulated internships, not job offers.
        </p>
      </section>

      {/* CTA */}
      <section id="cta" className="mx-auto max-w-6xl px-5 pb-24">
        <div className="card-duo relative overflow-hidden p-10 md:p-16 text-center">
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-accent/40 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
          <h2 className="text-4xl md:text-5xl relative leading-[1.05]">
            Ready to earn your <span className="text-primary">first real experience?</span>
          </h2>
          <p className="mt-4 text-lg text-charcoal/70 max-w-xl mx-auto relative">
            Explore the full dashboard preview free. When you're ready, the whole journey is ₦5,000
            one-time or ₦2,500 a month.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3 relative">
            <a href="/auth?mode=signup" className="btn-duo">
              Get started
            </a>
            <a href="#loop" className="btn-duo-outline">
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="text-white skew-y-1 origin-bottom-left"
        style={{ backgroundColor: "#00bfff" }}
      >
        <div className="mx-auto max-w-6xl px-5 py-16 -skew-y-1">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-1">
              <img src="/huzzler-logo-inverted.svg" alt="Huzzler" className="h-9 w-auto" />
              <p className="mt-4 text-sm text-white/85 leading-relaxed max-w-xs">
                Experience as a software. The AI-powered launchpad for African tech talent.
              </p>
              <div className="mt-5 flex gap-3">
                {[
                  { label: "Twitter", Icon: Twitter },
                  { label: "LinkedIn", Icon: Linkedin },
                  { label: "GitHub", Icon: Github },
                  { label: "Instagram", Icon: Instagram },
                ].map((s) => (
                  <a
                    key={s.label}
                    href="#"
                    className="h-9 w-9 rounded-full border border-white/30 hover:border-white hover:bg-white/10 flex items-center justify-center transition-colors"
                    aria-label={s.label}
                  >
                    <s.Icon size={16} strokeWidth={2.25} />
                  </a>
                ))}
              </div>
            </div>

            {[
              {
                title: "Product",
                links: ["How it works", "Roles", "Pricing", "Verify a certificate"],
              },
              {
                title: "Company",
                links: ["About", "Careers", "Blog", "Press", "Contact"],
              },
              {
                title: "Resources",
                links: ["Docs", "Help center", "Community", "Changelog", "Status"],
              },
            ].map((col) => (
              <div key={col.title}>
                <div className="text-xs font-bold uppercase tracking-[0.15em] text-white/70">
                  {col.title}
                </div>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a
                        href="#"
                        className="text-sm font-semibold text-white/90 hover:text-white transition-colors"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-14 pt-6 border-t border-white/20 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-white/80">
            <div>
              © {new Date().getFullYear()} Huzzler · Built for the AI for Africa Innovation
              Hackathon
            </div>
            <div className="flex gap-6 font-semibold">
              <a href="#" className="hover:text-white">
                Privacy
              </a>
              <a href="#" className="hover:text-white">
                Terms
              </a>
              <a href="#" className="hover:text-white">
                Cookies
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
