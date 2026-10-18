import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Rocket,
  ClipboardCheck,
  Briefcase,
  Users,
  Award,
  Wallet,
  Settings,
  Menu,
  X,
  Bell,
  LogOut,
  Lock,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/lib/theme";
import { signOut } from "@/lib/supabase";
import { api } from "@/lib/api";
import { hasPaid, onTeam, roleName, STATUS_LABEL, type Me } from "@/lib/journey";
import { fmtDateTime } from "./ui";

type NavItem = { to: string; label: string; icon: LucideIcon; locked?: boolean };

function navFor(me: Me): NavItem[] {
  const s = me.journey.status;
  const paid = hasPaid(s) || s === "LAPSED";
  const verified = [
    "TESTS_PASSED",
    "OFFER_PENDING",
    "PLACED",
    "PROJECT_1",
    "PROJECT_2",
    "PROJECT_3",
    "PROJECT_4",
    "PROJECT_5",
    "CERTIFIED",
  ].includes(s);
  return [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    ...(!paid ? [{ to: "/begin", label: "Begin onboarding", icon: Rocket }] : []),
    { to: "/tests", label: "Onboarding tests", icon: ClipboardCheck, locked: !paid },
    { to: "/offers", label: "Offers", icon: Briefcase, locked: !verified },
    {
      to: "/workspace",
      label: "Team workspace",
      icon: Users,
      locked: !(onTeam(s) || s === "CERTIFIED" || s === "LAPSED"),
    },
    { to: "/certificate", label: "Certificate", icon: Award, locked: !paid },
    { to: "/billing", label: "Billing", icon: Wallet },
    { to: "/settings", label: "Settings", icon: Settings },
  ];
}

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = navFor(me);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", mobileOpen);
    return () => document.body.classList.remove("overflow-hidden");
  }, [mobileOpen]);

  const signOut = async () => {
    await signOut();
    window.location.href = "/auth?mode=login";
  };

  const NavList = ({ compact }: { compact?: boolean }) => (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {nav.map((n) => {
        const active = pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
        const Icon = n.icon;
        return (
          <Link
            key={n.to}
            to={n.locked ? "/begin" : n.to}
            title={compact ? n.label : undefined}
            className={`flex items-center gap-3 rounded-lg border py-2.5 font-display text-sm font-bold tracking-tight transition-colors ${compact ? "justify-center px-2" : "px-3"} ${
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            } ${n.locked ? "opacity-60" : ""}`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!compact && <span className="flex-1">{n.label}</span>}
            {!compact && n.locked && <Lock className="h-3.5 w-3.5" />}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <div className="mx-auto flex min-h-screen max-w-[1400px]">
        <aside
          className={`hidden shrink-0 flex-col border-r border-border py-6 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto transition-[width] duration-300 ${collapsed ? "w-20 px-2" : "w-64 px-4"}`}
        >
          <div
            className={`mb-8 flex items-center ${collapsed ? "flex-col gap-3" : "justify-between"}`}
          >
            <Link to="/" className="flex items-center px-2" aria-label="Huzzler home">
              {collapsed ? (
                <img src="/huzzler-mark.svg" alt="" className="h-9 w-9" />
              ) : (
                <>
                  <img src="/huzzler-logo.svg" alt="Huzzler" className="h-8 w-auto dark:hidden" />
                  <img
                    src="/huzzler-logo-darkmode.svg"
                    alt="Huzzler"
                    className="hidden h-8 w-auto dark:block"
                  />
                </>
              )}
            </Link>
            <button
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="grid h-7 w-7 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>
          <NavList compact={collapsed} />
          {!collapsed && (
            <div className="mt-auto rounded-xl border border-border bg-muted/40 p-3">
              <div className="truncate font-display text-sm font-bold">
                {me.profile.full_name ?? me.user.email}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {roleName(me.profile.role_id)} · {STATUS_LABEL[me.journey.status]}
              </div>
              <button
                onClick={signOut}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-red-500"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8">
            <div className="flex items-center gap-3 md:hidden">
              <button
                onClick={() => setMobileOpen(true)}
                aria-label="Open menu"
                className="grid h-10 w-10 place-items-center rounded-full border border-border bg-muted"
              >
                <Menu className="h-5 w-5" />
              </button>
              <img src="/huzzler-mark.svg" alt="Huzzler" className="h-8 w-8" />
            </div>
            <div className="hidden md:block">
              <div className="text-xs font-semibold text-muted-foreground">
                Welcome back{me.profile.full_name ? `, ${me.profile.full_name.split(" ")[0]}` : ""}
              </div>
              <div className="font-display text-base font-bold tracking-tight">
                Let's ship something today.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Notifications unread={me.unread_notifications} />
              <ThemeToggle />
            </div>
          </div>
          {me.journey.status === "LAPSED" && (
            <div className="border-b border-[color:var(--gold)]/40 bg-[color:var(--gold)]/10 px-4 py-2 text-center text-sm font-semibold md:px-8">
              Your plan has lapsed — your work is saved and read-only.{" "}
              <Link to="/billing" className="text-primary underline">
                Renew
              </Link>
            </div>
          )}
          {me.journey.grace_until && me.journey.status !== "LAPSED" && (
            <div className="border-b border-[color:var(--gold)]/40 bg-[color:var(--gold)]/10 px-4 py-2 text-center text-sm font-semibold md:px-8">
              Your last payment didn't go through. Renew by {fmtDateTime(me.journey.grace_until)} to
              keep your place.{" "}
              <Link to="/billing" className="text-primary underline">
                Billing
              </Link>
            </div>
          )}
          <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
            {children}
          </main>
        </div>
      </div>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            className="fixed left-0 top-0 z-50 flex h-full w-[280px] max-w-[85vw] flex-col border-r border-border bg-background p-5 md:hidden"
            role="dialog"
            aria-label="Menu"
          >
            <div className="mb-6 flex items-center justify-between">
              <img src="/huzzler-mark.svg" alt="Huzzler" className="h-8 w-8" />
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="grid h-9 w-9 place-items-center rounded-full border border-border"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavList />
            <button
              onClick={signOut}
              className="mt-auto inline-flex items-center gap-2 rounded-lg px-3 py-3 text-sm font-bold text-muted-foreground hover:text-red-500"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Notifications({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          title: string;
          body: string;
          created_at: string;
          read_at: string | null;
        }>
      >("/me/notifications"),
    enabled: open,
  });
  const toggle = async () => {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      await api("/me/notifications/read", { method: "POST" });
      qc.invalidateQueries({ queryKey: ["me"] });
    }
  };
  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-border bg-muted hover:text-primary"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--fire)] px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="card-duo absolute right-0 top-12 z-30 max-h-[70vh] w-[320px] max-w-[90vw] overflow-y-auto p-2">
          {(data ?? []).length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications yet.
            </div>
          )}
          {(data ?? []).map((n) => (
            <div key={n.id} className="rounded-lg p-3 hover:bg-muted">
              <div className="font-display text-sm font-bold">{n.title}</div>
              <div className="text-xs text-muted-foreground">{n.body}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {fmtDateTime(n.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
