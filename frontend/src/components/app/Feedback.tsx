import { useEffect, useRef, useState, type ReactNode } from "react";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Clock, LockKeyhole, RefreshCw, WifiOff, X } from "lucide-react";
import { ApiError, SESSION_EXPIRED_EVENT } from "@/lib/api";
import { supabase, signOutIntent } from "@/lib/supabase";
import { ButtonSpinner } from "./Loader";

// ---------------------------------------------------------------------------
// Every error tells the user what happened and offers the one next step that helps.
// ---------------------------------------------------------------------------

type Action = { label: string; to?: string; href?: string; run?: "retry" | "signin" | "reload" };
type Resolved = {
  title: string;
  message: string;
  icon: typeof AlertTriangle;
  action?: Action;
  secondary?: Action;
};

const CODE_ACTIONS: Record<string, Action> = {
  PAYMENT_REQUIRED: { label: "Begin onboarding", to: "/begin" },
  GUARDIAN_REQUIRED: { label: "Get guardian consent", to: "/begin" },
  NOT_PAYMENT_PENDING: { label: "Go to dashboard", to: "/dashboard" },
  CONSENTS_REQUIRED: { label: "Review consents", to: "/begin" },
  LAPSED: { label: "Renew your plan", to: "/billing" },
  PROFILE_INCOMPLETE: { label: "Finish your profile", to: "/setup" },
  NO_FIELD: { label: "Choose your field", to: "/setup" },
  NO_ATTEMPTS_LEFT: { label: "See your results", to: "/results" },
  RETAKE_WAIT: { label: "See your results", to: "/results" },
  OUT_OF_ORDER: { label: "Back to your tests", to: "/tests" },
  DEADLINE_PASSED: { label: "Back to your tests", to: "/tests" },
  NOT_ELIGIBLE: { label: "Go to dashboard", to: "/dashboard" },
  MFA_REQUIRED: { label: "Verify with your authenticator", to: "/admin/login" },
  SUSPENDED: { label: "Contact support", href: `mailto:${SUPPORT_EMAIL}` },
  HINTS_FIRST: { label: "Unlock the hints", run: "reload" },
  PAYMENT_INIT_FAILED: { label: "Check your account details", to: "/profile" },
  INSUFFICIENT_TOKENS: { label: "Top up tokens", to: "/billing" },
  PAYMENT_PROVIDER_DOWN: { label: "Try again", run: "retry" },
};

export function resolveError(error: unknown): Resolved {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.code === "SESSION_EXPIRED") {
      return {
        title: "Your session has expired",
        message:
          "For your security we signed you out. Sign in again to pick up where you left off.",
        icon: LockKeyhole,
        action: { label: "Sign in again", run: "signin" },
      };
    }
    if (error.status === 0) {
      return {
        title: "You're offline",
        message: "We can't reach Huzzler right now. Check your data or Wi-Fi connection.",
        icon: WifiOff,
        action: { label: "Try again", run: "retry" },
      };
    }
    if (error.code === "MAINTENANCE") {
      return {
        title: "Huzzler is under maintenance",
        message: error.message,
        icon: Clock,
        action: { label: "Try again", run: "retry" },
      };
    }
    if (error.status === 429) {
      return {
        title: "Slow down a little",
        message: error.message,
        icon: Clock,
        action: { label: "Try again", run: "retry" },
      };
    }
    if (error.code && CODE_ACTIONS[error.code]) {
      return {
        title: "One more step",
        message: error.message,
        icon: AlertTriangle,
        action: CODE_ACTIONS[error.code],
      };
    }
    if (error.status >= 500) {
      return {
        title: "Something went wrong on our side",
        message: "It's not you. Give it a moment and try again.",
        icon: AlertTriangle,
        action: { label: "Try again", run: "retry" },
      };
    }
    if (error.status === 403)
      return {
        title: "Not available yet",
        message: error.message,
        icon: LockKeyhole,
        action: { label: "Go to dashboard", to: "/dashboard" },
      };
    if (error.status === 404)
      return {
        title: "We couldn't find that",
        message: error.message,
        icon: AlertTriangle,
        action: { label: "Go to dashboard", to: "/dashboard" },
      };
    return { title: "Please check and try again", message: error.message, icon: AlertTriangle };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    title: "Something went wrong",
    message,
    icon: AlertTriangle,
    action: { label: "Try again", run: "retry" },
  };
}

/** Signs out cleanly and sends the user to the right sign-in page, returning them here afterwards. */
export async function goToSignIn(
  currentPath = typeof window !== "undefined" ? window.location.pathname : "/dashboard",
) {
  signOutIntent.current = true;
  try {
    await supabase().auth.signOut({ scope: "local" });
  } catch {
    // already signed out
  }
  const staffLogin = currentPath.startsWith("/aipm")
    ? "/aipm/login"
    : currentPath.startsWith("/admin")
      ? "/admin/login"
      : null;
  window.location.href =
    staffLogin ?? `/auth?mode=login&reason=expired&next=${encodeURIComponent(currentPath)}`;
}

function ActionButton({
  action,
  onRetry,
  primary = true,
}: {
  action: Action;
  onRetry?: () => void;
  primary?: boolean;
}) {
  const cls = primary ? "btn-duo !py-2 !px-4 text-sm" : "btn-duo-outline !py-2 !px-4 text-sm";
  if (action.to)
    return (
      <Link to={action.to} className={cls}>
        {action.label} <ArrowRight className="h-4 w-4" />
      </Link>
    );
  if (action.href)
    return (
      <a href={action.href} className={cls}>
        {action.label}
      </a>
    );
  const run = () => {
    if (action.run === "signin") void goToSignIn();
    else if (action.run === "retry" && onRetry) onRetry();
    else window.location.reload();
  };
  return (
    <button type="button" onClick={run} className={cls}>
      {action.run === "signin" ? (
        <LockKeyhole className="h-4 w-4" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}{" "}
      {action.label}
    </button>
  );
}

/**
 * Inline error with a next-step action. Pass `onRetry` (e.g. a query's refetch or a mutation's
 * reset) so "Try again" re-runs the failed request instead of reloading the page.
 */
export function ErrorNote({
  error,
  onRetry,
  className = "",
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  if (!error) return null;
  const r = resolveError(error);
  const Icon = r.icon;
  return (
    <div
      role="alert"
      className={`hz-fade-up flex flex-col gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-4 sm:flex-row sm:items-center ${className}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-sm font-bold">{r.title}</div>
        <div className="text-sm text-muted-foreground">{r.message}</div>
      </div>
      {r.action && <ActionButton action={r.action} onRetry={onRetry} />}
    </div>
  );
}

/** Full-page version for when a whole screen can't load. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const r = resolveError(error);
  const Icon = r.icon;
  return (
    <div
      role="alert"
      className="hz-fade-up mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center"
    >
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-red-500/10 text-red-500 ring-4 ring-red-500/5">
        <Icon className="h-8 w-8" />
      </span>
      <div>
        <h2 className="font-display text-xl font-bold">{r.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{r.message}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {r.action && <ActionButton action={r.action} onRetry={onRetry} />}
        {r.action?.to !== "/dashboard" && r.action?.run !== "signin" && (
          <Link to="/dashboard" className="btn-duo-outline !py-2 !px-4 text-sm">
            Go to dashboard
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Two-step button: the first click asks "Are you sure?" inline; the second confirms.
// Replaces browser confirm() popups for anything hard to undo.
// ---------------------------------------------------------------------------
export function ConfirmButton({
  children,
  onConfirm,
  prompt = "Are you sure?",
  confirmLabel = "Yes, continue",
  cancelLabel = "Cancel",
  danger = false,
  pending = false,
  disabled = false,
  className = "btn-duo",
}: {
  children: ReactNode;
  onConfirm: () => void;
  prompt?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!armed) return;
    confirmRef.current?.focus();
    const t = setTimeout(() => setArmed(false), 8000);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setArmed(false);
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", esc);
    };
  }, [armed]);

  if (pending) {
    return (
      <button type="button" disabled className={`${className} opacity-80`}>
        <ButtonSpinner /> Working…
      </button>
    );
  }
  if (!armed) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setArmed(true)}
        className={`${className} disabled:opacity-50`}
      >
        {children}
      </button>
    );
  }
  return (
    <div
      className="hz-fade-up flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-1.5 pl-3 shadow-lg"
      role="group"
      aria-label={prompt}
    >
      <span className="text-sm font-semibold">{prompt}</span>
      <button
        ref={confirmRef}
        type="button"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        className={`rounded-xl px-3 py-1.5 text-sm font-bold text-white ${danger ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:brightness-110"}`}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" /> {cancelLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global "session expired" dialog: any API 401 or unexpected sign-out opens it.
// ---------------------------------------------------------------------------
const PUBLIC_PREFIXES = [
  "/auth",
  "/admin/login",
  "/aipm/login",
  "/callback",
  "/reset-password",
  "/guardian",
  "/verify",
  "/u/",
];

export function SessionExpiredDialog() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onExpired = () => {
      const p = window.location.pathname;
      if (p === "/" || PUBLIC_PREFIXES.some((x) => p.startsWith(x))) return;
      setOpen(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);
  useEffect(() => {
    if (open) btnRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
    >
      <div className="hz-fade-up card-duo w-full max-w-sm p-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-4 ring-primary/10">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <h2 id="session-expired-title" className="mt-4 font-display text-xl font-bold">
          Your session has expired
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          For your security we signed you out. Sign in again and we'll bring you right back here.
          Any test drafts are saved.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button ref={btnRef} onClick={() => void goToSignIn(pathname)} className="btn-duo w-full">
            <LockKeyhole className="h-4 w-4" /> Sign in again
          </button>
          <button
            onClick={() => {
              setOpen(false);
              navigate({ to: "/" });
            }}
            className="text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Go to the homepage
          </button>
        </div>
      </div>
    </div>
  );
}
