import { useEffect, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Award,
  Bot,
  Briefcase,
  CalendarCheck,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Lightbulb,
  LifeBuoy,
  NotebookPen,
  TimerReset,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { hasPaid, useMe, type JourneyStatus } from "@/lib/journey";
import { markTutorialSeen } from "@/lib/tutorial";
import { VideoCard } from "@/components/app/TutorialVideos";
import { GUIDES, PLATFORM_TOUR } from "@/lib/tutorials";
import { ListPageSkeleton } from "@/components/app/Skeleton";

export const Route = createFileRoute("/_app/tutorial")({
  validateSearch: z.object({ welcome: z.boolean().optional() }),
  head: () => ({ meta: [{ title: "Platform tutorial · Huzzler" }] }),
  component: Tutorial,
});

type Step = { icon: LucideIcon; title: string; body: string; to: string; cta: string };

const STEPS: Step[] = [
  {
    icon: UserRound,
    title: "Set up your profile",
    body: "Your name, phone number and field. You can switch field for free until you pay, and once more before you pass onboarding.",
    to: "/profile",
    cta: "Your profile",
  },
  {
    icon: Wallet,
    title: "Choose a plan",
    body: "₦5,000 once for the full journey with 6 months of access, or ₦2,500 a month. You pay through Paystack by card, transfer or USSD. If you're under 18, a parent or guardian approves your account first.",
    to: "/begin",
    cta: "Begin onboarding",
  },
  {
    icon: ClipboardCheck,
    title: "Pass the onboarding tests",
    body: "Five timed tests in your field. Answers save as you go, and you can take breaks between tests. You need 70% overall with no test under 50%, and you get two attempts.",
    to: "/tests",
    cta: "Onboarding tests",
  },
  {
    icon: Briefcase,
    title: "Choose an opportunity",
    body: "Once you pass, you get one to three practice internship offers from fictional companies. Accept one within 72 hours and you're matched into a squad.",
    to: "/opportunities",
    cta: "Opportunities",
  },
  {
    icon: Users,
    title: "Ship five projects with your squad",
    body: "You work with people in other roles on five projects, each harder than the last, ending with a demo day. You need 70% to pass each project.",
    to: "/workspace",
    cta: "Team workspace",
  },
  {
    icon: Award,
    title: "Get certified",
    body: "Pass all five projects with at least two peer reviews each and verify your ID. Your certificate comes with a public link that employers can check.",
    to: "/certificate",
    cta: "Certificate",
  },
];

/** Which step someone is on, from their journey status (-1: none, e.g. a paused account). */
function currentStep(s: JourneyStatus): number {
  if (
    [
      "REGISTERED",
      "FIELD_CHOSEN",
      "PREVIEW",
      "ONBOARDING_STARTED",
      "GUARDIAN_PENDING",
      "PAYMENT_PENDING",
    ].includes(s)
  )
    return 1;
  if (["PAID", "TESTING", "TESTS_FAILED"].includes(s)) return 2;
  if (["TESTS_PASSED", "OFFER_PENDING"].includes(s)) return 3;
  if (s === "PLACED" || s.startsWith("PROJECT_")) return 4;
  if (s === "CERTIFIED") return STEPS.length;
  return -1;
}

const SQUAD: Array<{ icon: LucideIcon; title: string; body: string; warn?: boolean }> = [
  {
    icon: CalendarCheck,
    title: "Daily check-ins",
    body: "Each working day, post a short update: what you did, what's next and what's blocking you. Check-ins count toward your reliability score.",
  },
  {
    icon: FileText,
    title: "Tasks and deliverables",
    body: "Each task has a brief and a due date. Submit your work on the task page. It's graded against a rubric, and you can appeal any grade once.",
  },
  {
    icon: Lightbulb,
    title: "Hints and the mentor",
    body: "Every task has three hints that unlock one at a time. After the third, mentor chat opens with up to 10 messages a day.",
  },
  {
    icon: Bot,
    title: "AI stand-ins",
    body: "If a role stays empty for 24 hours, a labelled Huzzler AI stand-in does that role's tasks so you aren't blocked. Its work is never graded, and it steps aside when a real person joins. Mention it in chat, for example @designer.",
  },
  {
    icon: NotebookPen,
    title: "Meeting notes",
    body: "Paste or upload notes from your squad's meetings. The AI PM suggests task changes, and your PM decides which ones are applied.",
  },
  {
    icon: TimerReset,
    title: "Stay active",
    body: "During a project, if you go 3 days without a check-in, a deliverable or a message, an AI stand-in takes your seat and you'll need to choose a new opportunity. You get a warning by email after 2 days.",
    warn: true,
  },
];

const SCORE = [
  { label: "Your deliverables", pct: 50, cls: "bg-primary" },
  { label: "Team acceptance tests", pct: 25, cls: "bg-primary/60" },
  { label: "Peer reviews", pct: 15, cls: "bg-[color:var(--gold)]" },
  { label: "Reliability", pct: 10, cls: "bg-[color:var(--fire)]" },
];

const FAQS: Array<{ q: string; a: ReactNode }> = [
  {
    q: "How much does Huzzler cost?",
    a: "₦5,000 once for the full journey with 6 months of access, or ₦2,500 a month. Signing up and looking around is free. You pay when you begin onboarding.",
  },
  {
    q: "Can I get a refund?",
    a: "Yes, a full refund within 48 hours of paying, as long as you haven't started a test. Report an issue in the Payment category with your payment reference.",
  },
  {
    q: "I paid but my account is still locked.",
    a: "Bank transfers and USSD can take a few minutes. Refresh Billing after 5 minutes. If it still shows unpaid, report an issue with your payment reference (it starts with hz_).",
  },
  {
    q: "What if I fail the onboarding tests?",
    a: "Your plan includes two full attempts. After 7 days you retake only the tests you scored under 70% on; passing scores carry over. Your results page shows feedback for every gap.",
  },
  {
    q: "What happens if the timer runs out?",
    a: "Your last saved draft is submitted automatically. Drafts save every 15 seconds and whenever you switch tabs.",
  },
  {
    q: "Are the internship offers real jobs?",
    a: "No. They're practice internships at fictional companies, each tied to a real squad of Huzzler members. The work, the teammates and the grades are real.",
  },
  {
    q: "How long until I join a squad?",
    a: "Usually by the next cohort start on Monday. If a role on your squad is still empty after 24 hours, an AI stand-in covers it so your squad can start.",
  },
  {
    q: "Can I use AI tools?",
    a: "Yes, for learning and research. What you submit must be your own work, and you confirm that when you submit. Flagged work gets a follow-up question.",
  },
  {
    q: "What happens if I fail a project?",
    a: "You get a remediation task and stay with your squad. If you fail two projects you leave the squad, but you can join a new one. Your work is saved.",
  },
  {
    q: "What if I'm busy for a few days?",
    a: "Tell your squad early in chat. A short check-in or message keeps your seat. After 3 days with no check-in, deliverable or message during a project, an AI stand-in takes your seat and you'll need to choose a new opportunity.",
  },
  {
    q: "What are tokens for?",
    a: "Tokens pay for the optional AI tools in your workspace. Billing lists what each tool costs, and you can buy more there. Your balance shows at the top of every page.",
  },
  {
    q: "How can an employer check my certificate?",
    a: "Share your verify link (huzzler.tech/verify/ followed by your certificate ID) or your public portfolio. Anyone can open it to see your name, role, projects and scores.",
  },
];

function Tutorial() {
  const { welcome } = Route.useSearch();
  const { data: me } = useMe();
  useEffect(() => markTutorialSeen(), []);
  if (!me) return <ListPageSkeleton rows={4} label="Loading the tutorial" />;

  const first = me.profile.full_name?.split(" ")[0];
  const step = currentStep(me.journey.status);
  const next = hasPaid(me.journey.status)
    ? { to: "/dashboard", label: "Go to my dashboard" }
    : { to: "/begin", label: "Begin onboarding" };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-20 pb-8 md:gap-24">
      <header className="flex flex-col gap-4">
        <span className="chip w-fit">Platform tutorial</span>
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          {welcome ? `Welcome to Huzzler${first ? `, ${first}` : ""}` : "How Huzzler works"}
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          {welcome
            ? "Before you start, take a few minutes to see how everything fits together. You can come back to this page any time from the menu."
            : "Everything you need to know about getting from your first test to a certificate, in one place."}
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <a href="#journey" className="btn-duo-outline !px-4 !py-2 text-sm">
            Your path
          </a>
          <a href="#squad" className="btn-duo-outline !px-4 !py-2 text-sm">
            Working in a squad
          </a>
          <a href="#faq" className="btn-duo-outline !px-4 !py-2 text-sm">
            Questions
          </a>
        </div>
      </header>

      <section
        id="video"
        aria-labelledby="video-title"
        className="flex scroll-mt-24 flex-col gap-8"
      >
        <SectionHeading id="video" eyebrow="Watch" title="The platform tour">
          Start here. The full walkthrough, then a short guide for each part of the platform. Every
          page also has a <b className="font-semibold text-foreground">Tutorial video</b> button at
          the top for the part you're on.
        </SectionHeading>
        <VideoCard video={PLATFORM_TOUR} large />
        <div>
          <h3 className="mb-4 font-display text-base font-bold">Short guides</h3>
          <ul className="grid gap-5 sm:grid-cols-2">
            {GUIDES.map((g) => (
              <li key={g.id}>
                <VideoCard video={g} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="journey"
        aria-labelledby="journey-title"
        className="flex scroll-mt-24 flex-col gap-8"
      >
        <SectionHeading id="journey" eyebrow="Step by step" title="Your path through Huzzler">
          Six stages, in order. Each one unlocks the next.
        </SectionHeading>
        <ol className="flex flex-col">
          {STEPS.map((s, i) => {
            const done = i < step || i === 0;
            const here = i === step;
            const Icon = s.icon;
            return (
              <li key={s.title} className="relative flex gap-5 pb-10 last:pb-0">
                {i < STEPS.length - 1 && (
                  <span
                    className={`absolute left-5 top-12 bottom-1 w-px ${done ? "bg-primary/50" : "bg-border"}`}
                    aria-hidden
                  />
                )}
                <span
                  className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full border ${
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : here
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {done ? (
                    <Check className="h-5 w-5" aria-label="Done" />
                  ) : (
                    <Icon className="h-5 w-5" aria-hidden />
                  )}
                </span>
                <div
                  className={`flex-1 rounded-xl pt-1.5 ${here ? "-mx-1 border border-primary/40 bg-primary/5 p-5 md:-mx-2" : ""}`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Step {i + 1}
                    </span>
                    {here && <span className="chip !py-0.5 text-xs">You're here</span>}
                  </div>
                  <h3 className="mt-1 font-display text-lg font-bold tracking-tight">{s.title}</h3>
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                  {here && (
                    <Link to={s.to} className="btn-duo mt-4 !px-4 !py-2 text-sm">
                      {s.cta} <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section
        id="squad"
        aria-labelledby="squad-title"
        className="flex scroll-mt-24 flex-col gap-8"
      >
        <SectionHeading id="squad" eyebrow="Projects" title="Working in your squad">
          What a normal project week looks like once you've joined a squad.
        </SectionHeading>
        <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {SQUAD.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                className={
                  s.warn
                    ? "rounded-xl border border-[color:var(--gold)]/50 bg-[color:var(--gold)]/10 p-5 sm:col-span-2"
                    : ""
                }
              >
                <Icon
                  className={`h-5 w-5 ${s.warn ? "text-foreground" : "text-primary"}`}
                  aria-hidden
                />
                <h3 className="mt-3 font-display text-base font-bold">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-border p-6">
          <h3 className="font-display text-base font-bold">How each project is scored</h3>
          <p className="mt-1 text-sm text-muted-foreground">You need 70 out of 100 to pass.</p>
          <div className="mt-5 flex h-3 overflow-hidden rounded-full" aria-hidden>
            {SCORE.map((s) => (
              <span key={s.label} className={s.cls} style={{ width: `${s.pct}%` }} />
            ))}
          </div>
          <ul className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            {SCORE.map((s) => (
              <li key={s.label} className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.cls}`} aria-hidden />
                <span className="flex-1">{s.label}</span>
                <span className="font-semibold tabular-nums">{s.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-title" className="flex scroll-mt-24 flex-col gap-8">
        <SectionHeading id="faq" eyebrow="FAQ" title="Questions people ask">
          Can't find yours? The help bubble on every page answers questions too.
        </SectionHeading>
        <div className="divide-y divide-border border-y border-border">
          {FAQS.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="max-w-2xl pb-5 text-[15px] leading-relaxed text-muted-foreground">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-start gap-6 rounded-2xl border border-border bg-card p-8 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">Ready when you are</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            If something isn't clear, our team replies to every report.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/support" className="btn-duo-outline !px-4 !py-2 text-sm">
            <LifeBuoy className="h-4 w-4" /> Help & support
          </Link>
          <Link to={next.to} className="btn-duo !px-4 !py-2 text-sm">
            {next.label} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-widest text-primary">{eyebrow}</span>
      <h2 id={`${id}-title`} className="font-display text-2xl font-bold tracking-tight">
        {title}
      </h2>
      <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
