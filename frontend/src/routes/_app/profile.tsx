import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { FileText, Settings2, type LucideIcon } from "lucide-react";
import { roleName, STATUS_LABEL, useMe } from "@/lib/journey";
import { PageHeader } from "@/components/app/ui";
import { ResumeBuilder } from "@/components/app/ResumeBuilder";
import { AccountSettings } from "@/components/app/AccountSettings";

type Tab = "resume" | "account";

export const Route = createFileRoute("/_app/profile")({
  validateSearch: z.object({ tab: z.enum(["resume", "account"]).optional() }),
  head: () => ({ meta: [{ title: "Profile · Huzzler" }] }),
  component: Profile,
});

const TABS: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: "resume", label: "AI résumé", icon: FileText },
  { key: "account", label: "Account & privacy", icon: Settings2 },
];

/** Profile: the AI résumé builder and the account settings, in one place. */
function Profile() {
  const { data: me } = useMe();
  const tab = Route.useSearch().tab ?? "resume";
  const navigate = useNavigate({ from: "/profile" });
  if (!me) return null;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          chip={`${roleName(me.profile.role_id)} · ${STATUS_LABEL[me.journey.status]}`}
          title={me.profile.full_name ?? "Your profile"}
          body={
            me.profile.username
              ? `@${me.profile.username} · ${me.user.email ?? ""}`
              : (me.user.email ?? undefined)
          }
        />
      </div>
      <div
        className="flex w-fit gap-1 rounded-2xl border border-border bg-muted/50 p-1.5 print:hidden"
        role="tablist"
        aria-label="Profile"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => navigate({ search: { tab: t.key }, replace: true })}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-display text-sm font-bold transition-colors ${tab === t.key ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "resume" ? <ResumeBuilder /> : <AccountSettings />}
    </div>
  );
}
