import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, type LucideIcon } from "lucide-react";
import { HuzzlerLoader } from "./Loader";

export function PageHeader({
  chip,
  title,
  body,
  actions,
}: {
  chip?: string;
  title: string;
  body?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-2">
        {chip && <span className="chip w-fit">{chip}</span>}
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {body && (
          <div className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{body}</div>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card-duo p-5 ${className}`}>{children}</div>;
}

export function CardTitle({
  icon: Icon,
  children,
  aside,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 font-display text-base font-bold">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        {children}
      </div>
      {aside}
    </div>
  );
}

/** Back-compat wrapper: full-screen uses the branded loader; prefer skeletons for page content. */
export function Spinner({ label, fullScreen }: { label?: string; fullScreen?: boolean }) {
  return <HuzzlerLoader label={label} fullScreen={fullScreen} />;
}

export { ErrorNote, ErrorState, ConfirmButton } from "./Feedback";

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "success";
  children: ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "border-[color:var(--gold)]/40 bg-[color:var(--gold)]/10"
      : tone === "success"
        ? "border-[color:var(--brand-green)]/40 bg-[color:var(--brand-green)]/10"
        : "border-primary/30 bg-primary/5";
  return <div className={`rounded-xl border p-4 text-sm ${cls}`}>{children}</div>;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
      <Icon className="h-8 w-8 text-muted-foreground opacity-60" />
      <p className="font-display text-sm font-bold">{title}</p>
      {body && <p className="max-w-sm text-xs text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Progress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-muted ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "gold" | "green" | "red";
}) {
  const cls = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/15 text-primary",
    gold: "bg-[color:var(--gold)]/15 text-[color:var(--gold)]",
    green:
      "bg-[color:var(--brand-green)]/15 text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]",
    red: "bg-red-500/15 text-red-500",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${cls}`}
    >
      {children}
    </span>
  );
}

export function ScoreBadge({
  score,
  pass = 70,
}: {
  score: number | null | undefined;
  pass?: number;
}) {
  if (score === null || score === undefined) return <Pill>Pending</Pill>;
  const s = Number(score);
  return <Pill tone={s >= pass ? "green" : s >= 50 ? "gold" : "red"}>{Math.round(s)}%</Pill>;
}

/** Wraps preview content: shows a lock and routes every action to "Begin onboarding". */
export function Locked({
  children,
  label = "Unlocks after onboarding",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-60 blur-[1px]" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <Link to="/begin" className="btn-duo !py-2 !px-4 text-sm">
          <Lock className="h-4 w-4" /> {label}
        </Link>
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="text-xs font-semibold text-red-500">{error}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60";

export function Countdown({ to, onExpire }: { to: string; onExpire?: () => void }) {
  const [left, setLeft] = useState(() => new Date(to).getTime() - Date.now());
  useEffect(() => {
    const t = setInterval(() => {
      const l = new Date(to).getTime() - Date.now();
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [to, onExpire]);
  const s = Math.max(0, Math.floor(left / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <span
      className={`font-mono font-bold tabular-nums ${s < 300 ? "text-[color:var(--fire)]" : ""}`}
    >
      {mm}:{ss}
    </span>
  );
}

export const fmtDate = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
    : "—";
export const fmtDateTime = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("en-NG", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
