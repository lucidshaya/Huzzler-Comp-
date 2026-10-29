import { useEffect, useRef, useState, type ReactNode } from "react";
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
  UserRound,
  Menu,
  X,
  Bell,
  LogOut,
  Lock,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Coins,
  LifeBuoy,
  Compass,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/lib/theme";
import { signOut as doSignOut } from "@/lib/supabase";
import { api } from "@/lib/api";
import { hasPaid, onTeam, roleName, STATUS_LABEL, type Me } from "@/lib/journey";
import { fmtTokens, useWallet } from "@/lib/tokens";
import { HuzzlerLoader } from "./Loader";
import { HelpWidget } from "./Support";
import { GuidedTour, startTour } from "./GuidedTour";
import { PlatformTourPopup, TutorialVideoButton } from "./TutorialVideos";
import { fmtDateTime } from "./ui";

type NavItem = { to: string; label: string; short: string; icon: LucideIcon; locked?: boolean };

const VERIFIED = [
  "TESTS_PASSED",
  "OFFER_PENDING",
  "PLACED",
  "PROJECT_1",
  "PROJECT_2",
  "PROJECT_3",
  "PROJECT_4",
  "PROJECT_5",
  "CERTIFIED",
];

function navFor(me: Me): NavItem[] {
  const s = me.journey.status;
  const paid = hasPaid(s) || s === "LAPSED";
  return [
    { to: "/dashboard", label: "Overview", short: "Home", icon: LayoutDashboard },
    ...(!paid ? [{ to: "/begin", label: "Begin onboarding", short: "Begin", icon: Rocket }] : []),
    {
      to: "/tests",
      label: "Onboarding tests",
      short: "Tests",
      icon: ClipboardCheck,
      locked: !paid,
    },
    {
      to: "/opportunities",
      label: "Opportunities",
      short: "Jobs",
      icon: Briefcase,
      locked: !VERIFIED.includes(s),
    },
    {
      to: "/workspace",
      label: "Team workspace",
      short: "Team",
      icon: Users,
      locked: !(onTeam(s) || s === "CERTIFIED" || s === "LAPSED"),
    },
    { to: "/certificate", label: "Certificate", short: "Certificate", icon: Award, locked: !paid },
    { to: "/billing", label: "Billing", short: "Billing", icon: Wallet },
    { to: "/tutorial", label: "Platform tutorial", short: "Tutorial", icon: GraduationCap },
    { to: "/support", label: "Help & support", short: "Help", icon: LifeBuoy },
    { to: "/profile", label: "Profile", short: "Profile", icon: UserRound },
  ];
}

const initials = (me: Me) =>
  (me.profile.full_name ?? me.user.email ?? "?")
    .split(/[\s@]/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = navFor(me);
  const isActive = (to: string) =>
    pathname === to || (to !== "/dashboard" && pathname.startsWith(to));

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", mobileOpen);
    return () => document.body.classList.remove("overflow-hidden");
  }, [mobileOpen]);

  const signOut = () => {
    setSigningOut(true);
    void doSignOut("/auth?mode=login");
  };

  if (signingOut) return <HuzzlerLoader fullScreen label="Signing you out…" />;

  const NavList = ({ compact }: { compact?: boolean }) => (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {nav.map((n) => {
        const active = isActive(n.to);
        const Icon = n.icon;
        return (
          <Link
            key={n.to}
            to={n.locked ? "/begin" : n.to}
            data-tour={`nav-${n.to.slice(1)}`}
            title={compact ? n.label : undefined}
            aria-current={active ? "page" : undefined}
            className={`group flex min-h-11 items-center gap-3 rounded-xl py-2.5 font-display text-[15px] font-semibold tracking-tight transition-all ${compact ? "justify-center px-2" : "px-3"} ${
              active
                ? "bg-primary text-primary-foreground shadow-[0_6px_20px_-8px_var(--primary)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            } ${n.locked ? "opacity-55" : ""}`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!compact && <span className="flex-1 truncate">{n.label}</span>}
            {!compact && n.locked && <Lock className="h-3.5 w-3.5" aria-label="Locked" />}
          </Link>
        );
      })}
    </nav>
  );

  // Phones: the four most-used sections in a bottom bar; everything else in the drawer.
  const tabs = [
    nav[0],
    nav.find((n) => n.to === "/begin") ?? nav.find((n) => n.to === "/tests")!,
    nav.find((n) => n.to === "/workspace")!,
    nav.find((n) => n.to === "/profile")!,
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      {/* The sidebar sits flush with the left edge of the screen; pages get the rest of the width. */}
      <div className="flex min-h-screen">
        <aside
          className={`hidden shrink-0 flex-col border-r border-border bg-card/40 py-6 transition-[width] duration-300 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto ${collapsed ? "w-[84px] px-3" : "w-64 px-4"}`}
        >
          <div
            className={`mb-8 flex items-center ${collapsed ? "flex-col gap-3" : "justify-between px-1"}`}
          >
            <Link to="/dashboard" className="flex items-center" aria-label="Huzzler dashboard">
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
              className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground hover:border-primary hover:text-primary"
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>
          <NavList compact={collapsed} />
          <button
            onClick={signOut}
            title={collapsed ? "Sign out" : undefined}
            className={`mt-auto flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 ${collapsed ? "justify-center px-2" : ""}`}
          >
            <LogOut className="h-5 w-5" /> {!collapsed && "Sign out"}
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
            <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-8">
              <div className="flex items-center gap-3 md:hidden">
                <button
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open menu"
                  className="grid h-11 w-11 place-items-center rounded-full border border-border bg-card"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <img src="/huzzler-mark.svg" alt="Huzzler" className="h-8 w-8" />
              </div>
              <div className="hidden min-w-0 md:block">
                <div className="text-xs font-semibold text-muted-foreground">
                  Welcome back
                  {me.profile.full_name ? `, ${me.profile.full_name.split(" ")[0]}` : ""} 👋
                </div>
                <div className="truncate font-display text-lg font-bold tracking-tight">
                  Let's ship something today.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TutorialVideoButton />
                {(hasPaid(me.journey.status) || me.journey.status === "LAPSED") && <TokenChip />}
                <Notifications unread={me.unread_notifications} />
                <ThemeToggle />
                <AccountMenu me={me} onSignOut={signOut} />
              </div>
            </div>
          </header>
          {me.journey.status === "LAPSED" && (
            <Banner>
              Your plan has lapsed — your work is saved and read-only.{" "}
              <Link to="/billing" className="font-bold text-primary underline">
                Renew now
              </Link>
            </Banner>
          )}
          {me.journey.grace_until && me.journey.status !== "LAPSED" && (
            <Banner>
              Your last payment didn't go through. Renew by {fmtDateTime(me.journey.grace_until)} to
              keep your place.{" "}
              <Link to="/billing" className="font-bold text-primary underline">
                Billing
              </Link>
            </Banner>
          )}
          <main
            id="main"
            className="mx-auto w-full max-w-[1360px] flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10"
          >
            {/* Re-keyed per section (first path segment) so each section eases in, without
                remounting a section's own sub-pages (e.g. workspace tabs) and losing their state. */}
            <div key={pathname.split("/")[1] ?? ""} className="hz-page">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* The Help & support page is the support centre itself; a second floating form would cover it. */}
      {!pathname.startsWith("/support") && <HelpWidget />}
      <GuidedTour me={me} />
      <PlatformTourPopup me={me} />

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label="Quick navigation"
      >
        <div className="grid grid-cols-4">
          {tabs.map((n) => {
            const Icon = n.icon;
            const active = isActive(n.to);
            return (
              <Link
                key={n.to}
                to={n.locked ? "/begin" : n.to}
                data-tour={`nav-${n.to.slice(1)}`}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-bold ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <span
                  className={`grid h-8 w-12 place-items-center rounded-full transition-colors ${active ? "bg-primary/15" : ""}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {n.short}
              </Link>
            );
          })}
        </div>
      </nav>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            className="hz-fade-up fixed left-0 top-0 z-50 flex h-full w-[300px] max-w-[86vw] flex-col border-r border-border bg-background p-5 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="mb-6 flex items-center justify-between">
              <img src="/huzzler-mark.svg" alt="Huzzler" className="h-9 w-9" />
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="grid h-11 w-11 place-items-center rounded-full border border-border"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-5 flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-primary font-display font-bold text-primary-foreground">
                {initials(me)}
              </span>
              <div className="min-w-0">
                <div className="truncate font-display font-bold">
                  {me.profile.full_name ?? me.user.email}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {roleName(me.profile.role_id)} · {STATUS_LABEL[me.journey.status]}
                </div>
              </div>
            </div>
            <NavList />
            <button
              onClick={signOut}
              className="mt-auto flex min-h-12 items-center gap-2 rounded-xl px-3 text-[15px] font-bold text-red-500 hover:bg-red-500/10"
            >
              <LogOut className="h-5 w-5" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Token balance in the header; opens Billing where tokens are bought. */
function TokenChip() {
  const { data } = useWallet();
  return (
    <Link
      to="/billing"
      hash="tokens"
      aria-label={`Token balance: ${fmtTokens(data?.balance ?? 0)}`}
      data-tour="tokens"
      className="hidden h-11 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-sm font-bold text-primary hover:bg-primary/15 sm:inline-flex"
    >
      <Coins className="h-4 w-4" /> {data ? fmtTokens(data.balance) : "—"}
    </Link>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-[color:var(--gold)]/40 bg-[color:var(--gold)]/10 px-4 py-2.5 text-center text-sm font-semibold md:px-8">
      {children}
    </div>
  );
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function AccountMenu({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        data-tour="account-menu"
        className="flex h-11 items-center gap-1.5 rounded-full border border-border bg-card pl-1 pr-2 hover:border-primary"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground">
          {initials(me)}
        </span>
        <ChevronDown
          className={`hidden h-4 w-4 text-muted-foreground transition-transform sm:block ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div role="menu" className="hz-fade-up card-duo absolute right-0 top-14 z-40 w-64 p-2">
          <div className="border-b border-border px-3 pb-3 pt-2">
            <div className="truncate font-display font-bold">
              {me.profile.full_name ?? "Your account"}
            </div>
            <div className="truncate text-xs text-muted-foreground">{me.user.email}</div>
          </div>
          <Link
            role="menuitem"
            to="/profile"
            onClick={() => setOpen(false)}
            className="mt-1 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-muted"
          >
            <UserRound className="h-4 w-4" /> Profile & résumé
          </Link>
          <Link
            role="menuitem"
            to="/billing"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-muted"
          >
            <Wallet className="h-4 w-4" /> Billing
          </Link>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              startTour();
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-muted"
          >
            <Compass className="h-4 w-4" /> Take the tour
          </button>
          <button
            role="menuitem"
            onClick={onSignOut}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-bold text-red-500 hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Notifications({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const ref = useClickOutside(open, () => setOpen(false));
  const { data, isLoading } = useQuery({
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
      await api("/me/notifications/read", { method: "POST" }).catch(() => {});
      qc.invalidateQueries({ queryKey: ["me"] });
    }
  };
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative grid h-11 w-11 place-items-center rounded-full border border-border bg-card hover:border-primary hover:text-primary"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--fire)] px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="hz-fade-up card-duo fixed inset-x-3 top-[4.5rem] z-40 max-h-[70vh] overflow-y-auto p-2 sm:absolute sm:inset-x-auto sm:right-0 sm:top-14 sm:w-[340px]">
          <div className="px-3 pb-2 pt-1 font-display text-sm font-bold">Notifications</div>
          {isLoading && (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-12" />
              ))}
            </div>
          )}
          {!isLoading && (data ?? []).length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              You're all caught up ✨
            </div>
          )}
          {(data ?? []).map((n) => (
            <div key={n.id} className="rounded-xl p-3 hover:bg-muted">
              <div className="font-display text-sm font-bold">{n.title}</div>
              <div className="text-sm text-muted-foreground">{n.body}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                {fmtDateTime(n.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
