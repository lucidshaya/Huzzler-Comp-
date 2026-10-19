import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Clock, RefreshCw, Wrench } from "lucide-react";
import { isStaffBrowser, useSiteStatus } from "@/lib/siteStatus";
import { AgentMark } from "./AgentMark";

// Staff tools and their sign-in pages stay reachable while the site is down.
const ALWAYS_OPEN = ["/admin", "/aipm"];

/** Shows the maintenance screen on learner and public pages while maintenance mode is on. */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const status = useSiteStatus();
  const [staff, setStaff] = useState(false);
  useEffect(() => setStaff(isStaffBrowser()), [pathname]);

  const m = status.data?.maintenance;
  if (!m?.enabled || ALWAYS_OPEN.some((p) => pathname.startsWith(p))) return <>{children}</>;
  if (staff)
    return (
      <>
        <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-[color:var(--gold)] px-4 py-1.5 text-center text-xs font-bold text-charcoal">
          <Wrench className="h-3.5 w-3.5" /> Maintenance mode is on. Learners see the maintenance page; you're previewing as staff.
        </div>
        {children}
      </>
    );
  return <MaintenanceScreen message={m.message} eta={m.eta} onRetry={() => status.refetch()} checking={status.isFetching} />;
}

function MaintenanceScreen({ message, eta, onRetry, checking }: { message: string; eta: string | null; onRetry: () => void; checking: boolean }) {
  const back = eta ? new Date(eta) : null;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-charcoal px-5 text-white" role="status" aria-live="polite">
      <div className="hz-fade-up flex w-full max-w-md flex-col items-center gap-6 text-center">
        <img src="/huzzler-logo-darkmode.svg" alt="Huzzler" className="h-8 w-auto" />
        <div className="relative">
          <AgentMark size={96} animated />
          <span className="absolute -bottom-2 -right-2 grid h-10 w-10 place-items-center rounded-2xl bg-[color:var(--gold)] text-charcoal shadow-lg">
            <Wrench className="h-5 w-5" />
          </span>
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">We'll be right back</h1>
          <p className="mt-3 text-base leading-relaxed text-white/70">{message}</p>
        </div>
        {back && back.getTime() > Date.now() && (
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80">
            <Clock className="h-4 w-4 text-primary" />
            Expected back {back.toLocaleString("en-NG", { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
          </div>
        )}
        <button type="button" onClick={onRetry} disabled={checking} className="btn-duo">
          <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} /> {checking ? "Checking…" : "Check again"}
        </button>
        <p className="text-xs text-white/40">
          Questions? <a href="mailto:support@huzzler.app" className="font-semibold text-white/60 underline hover:text-white">support@huzzler.app</a>
        </p>
      </div>
    </div>
  );
}
