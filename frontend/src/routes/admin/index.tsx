import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookCheck,
  CreditCard,
  Gavel,
  LogOut,
  Settings2,
  ShieldAlert,
  Handshake,
  Kanban,
  Mail,
  Users,
  LifeBuoy,
  Bot,
  UsersRound,
  Home,
  Coins,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { signOut, supabase } from "@/lib/supabase";
import { markStaffBrowser } from "@/lib/siteStatus";
import { ThemeToggle } from "@/lib/theme";
import { Spinner } from "@/components/app/ui";
import { OverviewTab } from "@/components/admin/Overview";
import { MaintenanceToggle } from "@/components/admin/MaintenanceToggle";
import { EmailsTab } from "@/components/admin/Emails";
import { SupportTab, HelpBotTab } from "@/components/admin/SupportTabs";
import {
  UsersTab,
  PaymentsTab,
  ContentTab,
  GradingTab,
  StaffTab,
  IntegrityTab,
  SystemTab,
} from "@/components/admin/Tabs";
import { OpportunitiesTab } from "@/components/admin/Opportunities";
import { TokensTab } from "@/components/admin/Tokens";
import { HomeTab } from "@/components/admin/Home";
import { RefreshButton } from "@/components/app/RefreshButton";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin · Huzzler" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

// Which staff roles see which tabs (the API enforces the same rules).
const ALL_STAFF = ["admin", "moderator", "content_reviewer", "partnerships"];
const TABS: Array<{
  key: string;
  label: string;
  icon: typeof Home;
  roles: string[];
  el: (p: { go: (tab: string) => void }) => React.ReactNode;
}> = [
  { key: "home", label: "My dashboard", icon: Home, roles: ALL_STAFF, el: HomeTab },
  {
    key: "overview",
    label: "Overview",
    icon: BarChart3,
    roles: ["admin", "moderator", "content_reviewer", "partnerships"],
    el: OverviewTab,
  },
  {
    key: "users",
    label: "Users",
    icon: Users,
    roles: ["admin", "moderator", "content_reviewer", "partnerships"],
    el: UsersTab,
  },
  {
    key: "support",
    label: "Support inbox",
    icon: LifeBuoy,
    roles: ["admin", "moderator"],
    el: SupportTab,
  },
  { key: "payments", label: "Payments", icon: CreditCard, roles: ["admin"], el: PaymentsTab },
  { key: "tokens", label: "Tokens", icon: Coins, roles: ["admin"], el: TokensTab },
  {
    key: "content",
    label: "Content bank",
    icon: BookCheck,
    roles: ["admin", "content_reviewer"],
    el: ContentTab,
  },
  {
    key: "grading",
    label: "Onboarding grading",
    icon: Gavel,
    roles: ["admin", "moderator"],
    el: GradingTab,
  },
  // Huzzler staff and their roles. Learner squads live in the AI PM portal (/aipm).
  { key: "team", label: "Team", icon: UsersRound, roles: ["admin"], el: StaffTab },
  {
    key: "integrity",
    label: "Integrity",
    icon: ShieldAlert,
    roles: ["admin", "moderator"],
    el: IntegrityTab,
  },
  {
    key: "opportunities",
    label: "Opportunities",
    icon: Handshake,
    roles: ["admin", "partnerships", "content_reviewer"],
    el: OpportunitiesTab,
  },
  { key: "emails", label: "Emails", icon: Mail, roles: ["admin"], el: EmailsTab },
  {
    key: "helpbot",
    label: "Help bot",
    icon: Bot,
    roles: ["admin", "content_reviewer"],
    el: HelpBotTab,
  },
  { key: "system", label: "Flags & audit", icon: Settings2, roles: ["admin"], el: SystemTab },
];

function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("home");
  const who = useQuery({
    queryKey: ["admin", "whoami"],
    queryFn: () =>
      api<{ role: string; full_name: string | null; staff_title: string | null }>("/admin/whoami"),
    retry: false,
  });

  useEffect(() => {
    if (who.error) navigate({ to: "/admin/login" });
  }, [who.error, navigate]);
  useEffect(() => {
    if (who.data) markStaffBrowser();
  }, [who.data]);
  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) navigate({ to: "/admin/login" });
      });
  }, [navigate]);

  if (who.isLoading || !who.data)
    return (
      <Spinner fullScreen label={who.error instanceof ApiError ? who.error.message : undefined} />
    );
  const tabs = TABS.filter((t) => t.roles.includes(who.data.role));
  const Active = (tabs.find((t) => t.key === tab) ?? tabs[0]).el;
  const go = (k: string) => {
    setTab(k);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <img src="/huzzler-mark.svg" alt="" className="h-8 w-8" />
            <div>
              <div className="font-display font-bold">
                {who.data.full_name ? who.data.full_name.split(" ")[0] : "Huzzler"}'s dashboard
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="capitalize">{who.data.role.replace("_", " ")}</span>
                {who.data.staff_title ? ` · ${who.data.staff_title}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton label="Refresh admin dashboard" done="Admin dashboard is up to date" />
            {who.data.role === "admin" && <MaintenanceToggle />}
            {who.data.role === "admin" && (
              <Link
                to="/aipm"
                className="hidden items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/15 sm:inline-flex"
              >
                <Kanban className="h-4 w-4" /> AI PM portal
              </Link>
            )}
            <ThemeToggle />
            <button
              onClick={() => void signOut("/admin/login")}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground hover:text-red-500"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
        <nav
          className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 pb-2 md:px-8"
          aria-label="Admin sections"
        >
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${tab === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">
        <Active go={go} />
      </main>
    </div>
  );
}
