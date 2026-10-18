import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { api, ApiError } from "@/lib/api";
import { ErrorNote, inputCls } from "@/components/app/ui";

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Staff sign in · Huzzler" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [mfa, setMfa] = useState<{ factorId: string; qr?: string; secret?: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const afterSession = async () => {
    try {
      await api("/admin/whoami");
      navigate({ to: "/admin" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "MFA_REQUIRED") await startMfa();
      else throw err;
    }
  };

  // TOTP two-factor via Supabase Auth MFA: enrol on first sign-in, then verify each session.
  const startMfa = async () => {
    const sb = supabase();
    const { data: factors } = await sb.auth.mfa.listFactors();
    const verified = factors?.totp.find((f) => f.status === "verified");
    if (verified) {
      setMfa({ factorId: verified.id });
    } else {
      const { data, error } = await sb.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Huzzler admin ${Date.now()}`,
      });
      if (error) throw error;
      setMfa({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    }
    setStep("mfa");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await api<{ access_token: string; refresh_token: string }>("/admin/auth/login", {
        body: { username, password },
        auth: false,
      });
      const { error } = await supabase().auth.setSession(s);
      if (error) throw error;
      await afterSession();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfa) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase().auth.mfa.challengeAndVerify({
        factorId: mfa.factorId,
        code,
      });
      if (error) throw new Error("That code didn't work.");
      await supabase().auth.refreshSession();
      await afterSession();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal px-5 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <img src="/huzzler-mark.svg" alt="Huzzler" className="h-10 w-10" />
          <div>
            <div className="font-display text-xl font-bold">Huzzler Admin</div>
            <div className="text-xs text-white/50">Staff only. Every action is audited.</div>
          </div>
        </div>
        {step === "credentials" ? (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <ErrorNote error={error} />
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Username
              <input
                className={`${inputCls} !bg-white/5 !text-white`}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Password
              <input
                type="password"
                className={`${inputCls} !bg-white/5 !text-white`}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button disabled={busy} className="btn-duo mt-2">
              {busy ? (
                "Signing in…"
              ) : (
                <>
                  <Lock className="h-4 w-4" /> Sign in
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 font-display text-lg font-bold">
              <ShieldCheck className="h-5 w-5 text-primary" /> Two-factor verification
            </div>
            {mfa?.qr && (
              <div className="rounded-xl bg-white p-3 text-charcoal">
                <p className="mb-2 text-xs">
                  Scan with Google Authenticator, Authy or 1Password, then enter the 6-digit code.
                </p>
                <img src={mfa.qr} alt="Authenticator QR code" className="mx-auto h-44 w-44" />
                <p className="mt-2 break-all text-center font-mono text-[10px]">{mfa.secret}</p>
              </div>
            )}
            <ErrorNote error={error} />
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-label="Authenticator code"
              className={`${inputCls} !bg-white/5 text-center font-mono text-xl tracking-[0.4em] !text-white`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button disabled={busy || code.length !== 6} className="btn-duo disabled:opacity-50">
              <KeyRound className="h-4 w-4" /> Verify
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
