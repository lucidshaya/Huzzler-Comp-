import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Activity, ChevronLeft, ChevronRight, FileText, Kanban, LayoutDashboard, LogOut, Menu, Users, X, type LucideIcon } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { signOut, supabase } from "@/lib/supabase";
import { ThemeToggle } from "@/lib/theme";
import { Spinner } from "@/components/app/ui";
import { AgentMark } from "@/components/app/AgentMark";
import { BoardView, BriefsView, ReportsView, TalentView, type AipmTab } from "@/components/aipm/Views";

export const Route = createFileRoute("/aipm/")({
  ssr: false,
  validateSearch: z.object({ tab: z.enum(["briefs", "talent", "board", "reports"]).optional() }),
  head: () => ({ meta: [{ title: "AI PM Portal · Huzzler" }, { name: "robots", content: "noindex" }] }),
  component: AipmPortal,
});

const NAV: { key: AipmTab; label: string; icon: LucideIcon }[] = [
  { key: "briefs", label: "Briefs & WBS", icon: FileText },
  { key: "talent", label: "Talent & Squads", icon: Users },
  { key: "board", label: "Sprint Board", icon: Kanban },
  { key: "reports", label: "Activity & Reports", icon: Activity },
];

type Overview = { active_teams: number; waiting_candidates: number; open_tasks: number; blocked_tasks: number; briefs: number; reports: number };

function AipmPortal() {
  const navigate = useNavigate({ from: "/aipm/" });
  const active = Route.useSearch().tab ?? "briefs";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const who = useQuery({ queryKey: ["aipm", "whoami"], queryFn: () => api<{ role: string }>("/aipm/whoami"), retry: false });
  const stats = useQuery({ queryKey: ["aipm", "overview"], queryFn: () => api<Overview>("/aipm/overview"), enabled: Boolean(who.data), refetchInterval: 60_000 });

  useEffect(() => {
    if (who.error) navigate({ to: "/aipm/login" });
  }, [who.error, navigate]);
  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) navigate({ to: "/aipm/login" });
      });
  }, [navigate]);

  const goTo = (tab: AipmTab) => {
    navigate({ search: { tab } });
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (who.isLoading || !who.data) return <Spinner fullScreen label={who.error instanceof ApiError ? who.error.message : "Opening the AI PM portal"} />;
  const s = stats.data;

  const nav = (mobile: boolean) =>
    NAV.map((n) => {
      const on = active === n.key;
      const Icon = n.icon;
      return (
        <button
          key={n.key}
          onClick={() => goTo(n.key)}
          title={collapsed && !mobile ? n.label : undefined}
          aria-current={on ? "page" : undefined}
          className={`flex items-center gap-3 rounded-xl border py-2.5 text-left font-display text-sm font-bold tracking-tight transition-colors ${collapsed && !mobile ? "justify-center px-2" : "px-3"} ${on ? "border-primary/40 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
        >
          <Icon className="h-5 w-5 shrink-0" />
          {(!collapsed || mobile) && n.label}
        </button>
      );
    });

  const signOutBtn = (
    <button
      onClick={async () => {
        await signOut();
        navigate({ to: "/aipm/login" });
      }}
      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground hover:text-red-500"
    >
      <LogOut className="h-4 w-4" /> Sign out
    </button>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className={`hidden shrink-0 flex-col border-r border-border bg-background py-6 transition-[width] duration-300 ease-out md:sticky md:top-0 md:z-30 md:flex md:h-screen md:overflow-y-auto ${collapsed ? "w-20 px-2" : "w-64 px-4"}`}>
          <div className={`mb-8 flex items-center ${collapsed ? "flex-col gap-3" : "justify-between"}`}>
            <Link to="/" className="flex items-center gap-2 px-2">
              <img src="/huzzler-mark.svg" alt="Huzzler" className="h-9 w-9" />
              {!collapsed && <span className="font-display text-sm font-bold leading-tight">AI PM<br /><span className="text-xs font-semibold text-muted-foreground">Portal</span></span>}
            </Link>
            <button
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="grid h-7 w-7 place-items-center rounded-full border border-primary/40 bg-gradient-to-b from-primary/20 to-primary/5 text-primary transition-all hover:scale-105 active:scale-95"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          <nav className="flex flex-col gap-1" aria-label="AI PM sections">{nav(false)}</nav>

          {!collapsed && (
            <div className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <AgentMark size={28} animated />
                <div className="font-display text-xs font-bold text-primary">AI Manager active</div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Tracking {s?.open_tasks ?? "…"} open tasks across {s?.active_teams ?? "…"} squads.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                <Stat value={s?.waiting_candidates} label="Waiting" />
                <Stat value={s?.blocked_tasks} label="Blocked" tone={s?.blocked_tasks ? "fire" : undefined} />
                <Stat value={s?.briefs} label="Briefs" />
                <Stat value={s?.reports} label="Reports" />
              </div>
            </div>
          )}

          {who.data.role === "admin" && (
            <Link to="/admin" title="Huzzler Admin" className={`mt-auto flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground ${collapsed ? "justify-center" : ""}`}>
              <LayoutDashboard className="h-5 w-5" /> {!collapsed && "Huzzler Admin"}
            </Link>
          )}
        </aside>

        <main className="min-w-0 flex-1">
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3.5 backdrop-blur md:px-8">
            <div className="flex items-center gap-3 md:hidden">
              <img src="/huzzler-mark.svg" alt="Huzzler" className="h-8 w-8" />
              <span className="font-display text-sm font-bold">AI PM</span>
            </div>
            <div className="hidden md:block">
              <div className="text-xs font-semibold capitalize text-muted-foreground">Project management · {who.data.role.replace("_", " ")}</div>
              <div className="font-display text-base font-bold tracking-tight">AI Sprint Command Center</div>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <ThemeToggle />
              {signOutBtn}
            </div>
            <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-full border border-border bg-muted text-foreground md:hidden">
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <div className="px-4 py-8 md:px-10">
            {active === "briefs" && <BriefsView onNext={() => goTo("talent")} />}
            {active === "talent" && <TalentView onNext={() => goTo("board")} />}
            {active === "board" && <BoardView />}
            {active === "reports" && <ReportsView />}
          </div>
        </main>
      </div>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="animate-slide-in-right fixed right-0 top-0 z-50 flex h-full w-[280px] max-w-[80vw] flex-col gap-6 border-l border-border bg-background p-5 md:hidden" role="dialog" aria-label="Menu">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold">AI PM Portal</span>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-1">{nav(true)}</nav>
            <div className="mt-auto flex items-center justify-between">
              <ThemeToggle />
              {signOutBtn}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value?: number; label: string; tone?: "fire" }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-2">
      <div className={`font-display font-bold ${tone === "fire" ? "text-[color:var(--fire)]" : "text-foreground"}`}>{value ?? "…"}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
