import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowLeft,
  Award,
  FileText,
  Flame,
  Pencil,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { roleName, STATUS_LABEL, useMe } from "@/lib/journey";
import { ResumeBuilder } from "@/components/app/ResumeBuilder";
import { AccountSettings } from "@/components/app/AccountSettings";
import { IdentityPortfolio, type Identity } from "@/components/app/IdentityPortfolio";
import { ErrorNote } from "@/components/app/ui";

type Tab = "profile" | "resume" | "account";

export const Route = createFileRoute("/_app/profile")({
  validateSearch: z.object({ tab: z.enum(["profile", "resume", "account"]).optional() }),
  head: () => ({ meta: [{ title: "Profile · Huzzler" }] }),
  component: Profile,
});

const TABS: Array<{ key: Exclude<Tab, "account">; label: string; icon: LucideIcon }> = [
  { key: "profile", label: "Profile & Badges", icon: UserRound },
  { key: "resume", label: "ATS Resume Builder", icon: FileText },
];

/** Profile: badges and activity, the ATS résumé builder, and (via Edit profile) account settings. */
function Profile() {
  const { data: me } = useMe();
  const tab = Route.useSearch().tab ?? "profile";
  const navigate = useNavigate({ from: "/profile" });
  const go = (t: Tab) => navigate({ search: { tab: t }, replace: true });
  if (!me) return null;
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="flex flex-col gap-2">
          <span className="chip w-fit">
            {roleName(me.profile.role_id)} · {STATUS_LABEL[me.journey.status]}
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
            Your builder identity.
          </h1>
          <p className="text-sm text-muted-foreground">
            Badges, activity, and ATS-ready résumé in one place.
          </p>
        </div>
        {tab !== "account" ? (
          <div
            className="flex gap-1 rounded-full border border-border bg-muted/50 p-1.5"
            role="tablist"
            aria-label="Profile"
          >
            {TABS.map((t) => {
              const Icon = t.icon;
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => go(t.key)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-display text-sm font-bold transition-all duration-300 ${on ? "bg-primary text-primary-foreground shadow-[0_6px_20px_-8px_var(--primary)]" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
          </div>
        ) : (
          <button onClick={() => go("profile")} className="btn-duo-outline !py-2 !px-4 text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to profile
          </button>
        )}
      </div>
      <div key={tab} className="hz-page">
        {tab === "resume" ? (
          <ResumeBuilder />
        ) : tab === "account" ? (
          <div className="mx-auto w-full max-w-4xl">
            <AccountSettings />
          </div>
        ) : (
          <ProfileBadges onResume={() => go("resume")} onEdit={() => go("account")} />
        )}
      </div>
    </div>
  );
}

function ProfileBadges({ onResume, onEdit }: { onResume: () => void; onEdit: () => void }) {
  const { data: me } = useMe();
  const identity = useQuery({
    queryKey: ["identity"],
    queryFn: () => api<Identity>("/me/identity"),
  });
  if (!me) return null;
  const d = identity.data;
  const name = me.profile.full_name ?? "Your profile";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const unlocked = d?.badges.filter((b) => b.unlocked).length ?? 0;
  const stats: Array<{ icon: LucideIcon; value: string; label: string }> = [
    { icon: Sparkles, value: d ? d.xp.toLocaleString() : "—", label: "XP" },
    { icon: Flame, value: d ? String(d.streak) : "—", label: "Day streak" },
    { icon: Award, value: d ? String(unlocked) : "—", label: "Badges" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <section className="card-duo flex flex-col gap-6 p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-5">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-primary font-display text-2xl font-bold text-primary-foreground shadow-[0_10px_30px_-10px_var(--primary)]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-2xl font-bold">{name}</div>
            <div className="text-sm text-muted-foreground">
              {[me.profile.username && `@${me.profile.username}`, roleName(me.profile.role_id)]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {me.profile.bio && <p className="mt-2 max-w-2xl text-sm">{me.profile.bio}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onResume} className="btn-duo !py-2.5 !px-5 text-sm">
              <FileText className="h-4 w-4" /> Build ATS Resume
            </button>
            <button onClick={onEdit} className="btn-duo-outline !py-2.5 !px-5 text-sm">
              <Pencil className="h-4 w-4" /> Edit profile
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="hz-fade-up flex flex-col items-center gap-1 rounded-2xl border border-border p-5"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <Icon className="h-5 w-5 text-primary" />
                <div className="font-display text-3xl font-bold">{s.value}</div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <ErrorNote error={identity.error} />
      {d ? <IdentityPortfolio data={d} /> : <div className="skeleton h-80 rounded-3xl" />}
    </div>
  );
}
