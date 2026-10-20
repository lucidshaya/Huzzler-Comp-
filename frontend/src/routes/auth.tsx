import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, Github, MailCheck } from "lucide-react";
import { ButtonSpinner } from "@/components/app/Loader";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { safeNext } from "@/lib/api";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({
    mode: z.enum(["signup", "login", "reset"]).optional(),
    next: z.string().optional(),
    reason: z.enum(["expired"]).optional(),
  }),
  ssr: false,
  head: () => ({
    meta: [
      { title: "Get started · Huzzler" },
      {
        name: "description",
        content:
          "Create your Huzzler account or sign in. Prove your skills, join a real team and earn a verifiable certificate.",
      },
      { property: "og:title", content: "Get started · Huzzler" },
      { property: "og:image", content: "/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "/auth" }],
  }),
  component: AuthPage,
});

type Mode = "signup" | "login" | "reset";

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(search.mode ?? "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  useEffect(() => setMode(search.mode ?? "login"), [search.mode]);

  // Already signed in? Go straight in.
  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) window.location.replace(safeNext(search.next));
      });
  }, [navigate, search.next]);

  const switchMode = (m: Mode) => {
    setError("");
    setInfo("");
    navigate({ to: "/auth", search: { mode: m }, replace: true });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    const sb = supabase();
    try {
      if (mode === "signup") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${window.location.origin}/callback`,
          },
        });
        if (error) throw error;
        // Supabase returns a user with no identities when the email is already registered.
        if (data.user && data.user.identities?.length === 0)
          throw new Error("An account with this email already exists. Sign in instead.");
        if (data.session) navigate({ to: "/setup" });
        else setVerifyEmail(email);
      } else if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          if (/not confirmed/i.test(error.message)) {
            setNeedsConfirm(true);
            throw new Error("Please verify your email first. We can send the link again.");
          }
          throw new Error(
            error.message === "Invalid login credentials"
              ? "Wrong email or password."
              : error.message,
          );
        }
        window.location.assign(safeNext(search.next));
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/callback?next=/reset-password`,
        });
        if (error) throw error;
        setInfo("If that email has an account, we've sent a reset link.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const [oauthBusy, setOauthBusy] = useState<"google" | "github" | null>(null);
  const oauth = async (provider: "google" | "github") => {
    setError("");
    setOauthBusy(provider);
    const { error } = await supabase().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/callback${search.next ? `?next=${encodeURIComponent(safeNext(search.next))}` : ""}`,
        ...(provider === "github"
          ? { scopes: "read:user user:email" }
          : { queryParams: { prompt: "select_account" } }),
      },
    });
    if (error) {
      setOauthBusy(null);
      setError(
        /provider is not enabled|Unsupported provider/i.test(error.message)
          ? `${provider === "google" ? "Google" : "GitHub"} sign-in isn't switched on yet. Use email for now.`
          : error.message,
      );
    }
  };

  if (verifyEmail)
    return (
      <CheckInbox
        email={verifyEmail}
        onBack={() => {
          setVerifyEmail(null);
          switchMode("login");
        }}
      />
    );

  return (
    <div
      className="flex min-h-screen flex-col bg-charcoal text-white"
      style={{ overflowX: "clip" }}
    >
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" aria-label="Huzzler home">
          <img
            src="/huzzler-mark.svg"
            alt="Huzzler"
            className="h-10 w-auto transition-transform hover:-rotate-3"
          />
        </Link>
        <Link to="/" className="text-sm font-semibold text-white/60 hover:text-white">
          Back to site
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          {mode !== "reset" && (
            <div
              className="inline-flex w-full rounded-full bg-white/5 p-1 ring-2 ring-white/20"
              role="tablist"
            >
              {(["signup", "login"] as Mode[]).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition-all ${mode === m ? "bg-white text-charcoal" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
                >
                  {m === "signup" ? "Create account" : "Sign in"}
                </button>
              ))}
            </div>
          )}

          <h1 className="mt-8 text-center font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {mode === "signup"
              ? "Let's get you shipping."
              : mode === "login"
                ? "Welcome back, huzzler."
                : "Reset your password"}
          </h1>
          {mode === "signup" && (
            <p className="mt-3 text-center text-sm text-white/60">
              Free to sign up and explore. You must be 17 or older.
            </p>
          )}

          {search.reason === "expired" && mode === "login" && (
            <div
              role="status"
              className="hz-fade-up mt-6 flex items-start gap-3 rounded-2xl bg-primary/10 p-4 text-sm ring-1 ring-primary/30"
            >
              <span className="mt-0.5 text-lg" aria-hidden>
                🔒
              </span>
              <span>
                <b className="block">Your session expired</b>
                <span className="text-white/70">
                  Sign in again and we'll take you back to where you were. Your drafts are saved.
                </span>
              </span>
            </div>
          )}

          {mode !== "reset" && (
            <>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => oauth("google")}
                  disabled={oauthBusy !== null}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/5 text-sm font-semibold ring-2 ring-white/20 transition-all hover:bg-white/10 disabled:opacity-60"
                >
                  {oauthBusy === "google" ? <ButtonSpinner /> : <GoogleIcon />} Continue with Google
                </button>
                <button
                  type="button"
                  onClick={() => oauth("github")}
                  disabled={oauthBusy !== null}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/5 text-sm font-semibold ring-2 ring-white/20 transition-all hover:bg-white/10 disabled:opacity-60"
                >
                  {oauthBusy === "github" ? <ButtonSpinner /> : <Github size={16} />} Continue with
                  GitHub
                </button>
              </div>
              <div className="my-6 flex items-center gap-3 text-xs font-semibold text-white/40">
                <div className="h-px flex-1 bg-white/10" /> or{" "}
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}

          {needsConfirm && mode === "login" && <ResendLink email={email} />}

          <form onSubmit={onSubmit} className={`space-y-3 ${mode === "reset" ? "mt-8" : ""}`}>
            {error && (
              <div
                role="alert"
                className="rounded-xl bg-red-500/10 p-3 text-sm font-semibold text-red-400 ring-1 ring-red-500/30"
              >
                {error}
              </div>
            )}
            {info && (
              <div
                role="status"
                className="rounded-xl bg-green-500/10 p-3 text-sm font-semibold text-green-400 ring-1 ring-green-500/30"
              >
                {info}
              </div>
            )}
            {mode === "signup" && (
              <BoldInput
                aria-label="Your name"
                placeholder="Your name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <BoldInput
              aria-label="Email address"
              placeholder="Email address"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {mode !== "reset" && (
              <div className="relative">
                <BoldInput
                  aria-label="Password"
                  placeholder="Password"
                  type={showPw ? "text" : "password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
                >
                  {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            )}
            {mode === "login" && (
              <div className="pt-1 text-right">
                <button
                  type="button"
                  onClick={() => switchMode("reset")}
                  className="text-sm font-semibold text-white/70 hover:text-white"
                >
                  Forgot password?
                </button>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-duo mt-4 flex w-full items-center justify-center gap-2 !py-3.5 !text-base disabled:opacity-50"
            >
              {loading
                ? "Please wait…"
                : mode === "signup"
                  ? "Create my account"
                  : mode === "login"
                    ? "Sign in"
                    : "Send reset link"}
              {!loading && <ArrowRight size={18} strokeWidth={2.75} />}
            </button>
            {mode === "reset" && (
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="w-full pt-2 text-center text-sm font-semibold text-white/70 hover:text-white"
              >
                Back to sign in
              </button>
            )}
          </form>

          {mode === "signup" && (
            <p className="mt-5 text-center text-[11px] leading-relaxed text-white/40">
              You'll review our Terms, Privacy Policy and AI grading notice before you pay.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function BoldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-2xl bg-white/5 px-5 py-4 text-base font-semibold text-white ring-1 ring-white/10 transition-all placeholder:text-white/40 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary"
    />
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#fff"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.75-6-6.15S8.7 5.9 12 5.9c1.88 0 3.14.8 3.86 1.5l2.63-2.53C16.83 3.3 14.65 2.4 12 2.4 6.98 2.4 2.9 6.48 2.9 11.5S6.98 20.6 12 20.6c6.93 0 9.2-4.87 9.2-7.35 0-.5-.06-.9-.14-1.25H12z"
      />
    </svg>
  );
}

function useCooldown(seconds: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, start: () => setLeft(seconds) };
}

function ResendLink({ email }: { email: string }) {
  const { left, start } = useCooldown(60);
  const [msg, setMsg] = useState("");
  const resend = async () => {
    const { error } = await supabase().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });
    setMsg(error ? error.message : "Verification email sent. Check your inbox and spam folder.");
    if (!error) start();
  };
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/5 p-3 text-sm ring-1 ring-white/15">
      <span className="text-white/70">
        {msg || `Didn't get the email for ${email || "your account"}?`}
      </span>
      <button
        type="button"
        disabled={left > 0 || !email}
        onClick={resend}
        className="font-bold text-primary disabled:text-white/40"
      >
        {left > 0 ? `Resend in ${left}s` : "Resend email"}
      </button>
    </div>
  );
}

/** Shown after email sign-up until the user clicks the link we sent. */
function CheckInbox({ email, onBack }: { email: string; onBack: () => void }) {
  const { left, start } = useCooldown(60);
  const [sent, setSent] = useState("");
  useEffect(() => start(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const resend = async () => {
    const { error } = await supabase().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/callback` },
    });
    setSent(error ? error.message : "Sent again. It can take a minute to arrive.");
    if (!error) start();
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal px-5 text-white">
      <div className="hz-fade-up w-full max-w-md text-center">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-primary/15 text-primary ring-8 ring-primary/10">
          <MailCheck className="h-10 w-10" />
        </span>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">Check your inbox</h1>
        <p className="mt-3 text-white/70">
          We sent a verification link to <b className="text-white">{email}</b>. Click it to activate
          your account — it comes from <b className="text-white">fourtechonoliges@gmail.com</b>.
        </p>
        <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm text-white/60">
          <li>• Not there? Check your Spam or Promotions folder.</li>
          <li>• The link opens Huzzler and signs you in automatically.</li>
        </ul>
        {sent && (
          <p role="status" className="mt-4 text-sm font-semibold text-green-400">
            {sent}
          </p>
        )}
        <div className="mt-8 flex flex-col gap-3">
          <a
            href={`https://mail.google.com/mail/u/0/#search/from%3Afourtechonoliges%40gmail.com`}
            target="_blank"
            rel="noreferrer"
            className="btn-duo"
          >
            Open Gmail
          </a>
          <button
            type="button"
            onClick={resend}
            disabled={left > 0}
            className="btn-duo-outline !text-white disabled:opacity-50"
          >
            {left > 0 ? `Resend in ${left}s` : "Resend email"}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-semibold text-white/60 hover:text-white"
          >
            Wrong email? Go back
          </button>
        </div>
      </div>
    </div>
  );
}
