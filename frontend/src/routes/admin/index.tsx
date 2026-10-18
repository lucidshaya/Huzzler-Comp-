import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  Users,
  UsersRound,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { signOut, supabase } from "@/lib/supabase";
import { ThemeToggle } from "@/lib/theme";
import { Spinner } from "@/components/app/ui";
import { OverviewTab } from "@/components/admin/Overview";
import {
  UsersTab,
  PaymentsTab,
  ContentTab,
  GradingTab,
  TeamsTab,
  IntegrityTab,
  OpportunitiesTab,
  SystemTab,
} from "@/components/admin/Tabs";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin · Huzzler" }, { name: "robots", content: "noindex" }] }),
  component: Admin,
});

// Which staff roles see which tabs (the API enforces the same rules).
const TABS = [
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
  { key: "payments", label: "Payments", icon: CreditCard, roles: ["admin"], el: PaymentsTab },
  {
    key: "content",
    label: "Content bank",
    icon: BookCheck,
    roles: ["admin", "content_reviewer"],
    el: ContentTab,
  },
  {
    key: "grading",
    label: "Grading & appeals",
    icon: Gavel,
    roles: ["admin", "moderator"],
    el: GradingTab,
  },
  {
    key: "teams",
    label: "Teams",
    icon: UsersRound,
    roles: ["admin", "moderator", "content_reviewer", "partnerships"],
    el: TeamsTab,
  },
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
    roles: ["admin", "partnerships"],
    el: OpportunitiesTab,
  },
  { key: "system", label: "Flags & audit", icon: Settings2, roles: ["admin"], el: SystemTab },
];

function Admin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const who = useQuery({
    queryKey: ["admin", "whoami"],
    queryFn: () => api<{ role: string }>("/admin/whoami"),
    retry: false,
  });

  useEffect(() => {
    if (who.error) navigate({ to: "/admin/login" });
  }, [who.error, navigate]);
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <img src="/huzzler-mark.svg" alt="" className="h-8 w-8" />
            <div>
              <div className="font-display font-bold">Huzzler Admin</div>
              <div className="text-xs capitalize text-muted-foreground">
                {who.data.role.replace("_", " ")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={async () => {
                await signOut();
                navigate({ to: "/admin/login" });
              }}
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
        <Active />
      </main>
    </div>
  );
}
