import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { hasPaid, type Me } from "@/lib/journey";

// First-run guided tour: a spotlight glides from one part of the app to the next with a short note.
// Shown once per browser on the first visit; "Take the tour" in the account menu replays it.
// Targets are elements with data-tour="…"; a step whose target isn't visible (e.g. a sidebar item
// on a phone) is shown centred instead.

const SEEN_KEY = "hz-tour-v1";
export const START_TOUR_EVENT = "hz:start-tour";
export const startTour = () => window.dispatchEvent(new Event(START_TOUR_EVENT));

type Step = { target?: string; title: string; body: string };

function stepsFor(me: Me): Step[] {
  const paid = hasPaid(me.journey.status) || me.journey.status === "LAPSED";
  const first = me.profile.full_name?.split(" ")[0];
  return [
    {
      title: `Welcome to Huzzler${first ? `, ${first}` : ""}`,
      body: "You'll prove your skills with 5 short tests, join a squad, and ship 5 real projects for a verified certificate. Here's a 30-second look around.",
    },
    {
      target: "nav-dashboard",
      title: "Overview",
      body: "Your home base. It always shows the one next step to take, so you never have to guess.",
    },
    paid
      ? {
          target: "nav-tests",
          title: "Onboarding tests",
          body: "Five timed tests in your field. Answers autosave, and you can take breaks between tests. Pass with 70% overall.",
        }
      : {
          target: "nav-begin",
          title: "Begin onboarding",
          body: "Start here: pick a plan and unlock your 5 onboarding tests. You can preview everything first.",
        },
    {
      target: "nav-opportunities",
      title: "Opportunities",
      body: "After you pass, companies' projects appear here. Accept one and we match you into a squad.",
    },
    {
      target: "nav-workspace",
      title: "Team workspace",
      body: "Your squad's board, chat, stand-ups and deliverables live here. Each project is graded, then counts toward your certificate.",
    },
    {
      target: "tokens",
      title: "Tokens",
      body: "Tokens pay for extra AI tools like the résumé builder. Your balance is always up here; top up from Billing.",
    },
    {
      target: "nav-profile",
      title: "Profile",
      body: "Your badges, activity and the ATS résumé builder, all made from your verified work.",
    },
    {
      target: "nav-support",
      title: "Help & support",
      body: "Stuck? Search the help centre or talk to a person. The help button at the bottom right works on every page.",
    },
  ];
}

const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export function GuidedTour({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const steps = stepsFor(me);
  const step = steps[i];

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* storage blocked: don't auto-open */
    }
    const t = seen ? null : setTimeout(() => setOpen(true), 900);
    const replay = () => {
      setI(0);
      setOpen(true);
    };
    window.addEventListener(START_TOUR_EVENT, replay);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener(START_TOUR_EVENT, replay);
    };
  }, []);

  const measure = useCallback(() => {
    const el = step?.target
      ? Array.from(document.querySelectorAll(`[data-tour="${step.target}"]`)).find(visible)
      : undefined;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step?.target]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, steps.length]);

  if (!open || !step) return null;

  const pad = 8;
  const last = i === steps.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(340, vw - 32);
  // Card goes to the right of a sidebar item, above a bottom-bar item, or below anything else.
  let cardStyle: React.CSSProperties;
  if (!rect) cardStyle = { left: (vw - cardW) / 2, top: Math.max(16, vh / 2 - 120) };
  else if (rect.right + cardW + 24 < vw && rect.left < vw / 3)
    cardStyle = { left: rect.right + 20, top: Math.min(Math.max(16, rect.top - 12), vh - 240) };
  else if (rect.top > vh / 2)
    cardStyle = {
      left: Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 16),
      bottom: vh - rect.top + 16,
    };
  else
    cardStyle = {
      left: Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 16),
      top: rect.bottom + 16,
    };

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Guided tour">
      <button aria-label="Close tour" className="absolute inset-0 cursor-default" onClick={close} />
      {/* The spotlight glides between targets; its huge shadow dims everything else. */}
      <div
        className="hz-tour-spot pointer-events-none fixed rounded-2xl ring-2 ring-primary"
        style={
          rect
            ? {
                left: rect.left - pad,
                top: rect.top - pad,
                width: rect.width + pad * 2,
                height: rect.height + pad * 2,
              }
            : { left: vw / 2, top: vh / 2, width: 0, height: 0, opacity: 0 }
        }
      />
      {!rect && <div className="pointer-events-none fixed inset-0 bg-black/60" />}
      <div
        key={i}
        className="hz-tour-card card-duo fixed p-5 shadow-2xl"
        style={{ ...cardStyle, width: cardW }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="chip inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> {i + 1} of {steps.length}
          </span>
          <button
            onClick={close}
            aria-label="Skip tour"
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="font-display text-lg font-bold">{step.title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1" aria-hidden="true">
            {steps.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all duration-300 ${n === i ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="btn-duo-outline !py-1.5 !px-3 text-xs">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
            )}
            <button
              onClick={() => (last ? close() : setI(i + 1))}
              className="btn-duo !py-1.5 !px-4 text-xs"
              autoFocus
            >
              {last ? "Let's go" : i === 0 ? "Show me" : "Next"}
              {!last && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
