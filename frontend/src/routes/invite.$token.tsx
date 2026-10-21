import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { ErrorNote, inputCls } from "@/components/app/ui";
import { ButtonSpinner, HuzzlerLoader } from "@/components/app/Loader";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Join the Huzzler team" }, { name: "robots", content: "noindex" }],
  }),
  component: AcceptInvite,
});

type Invite = {
  email: string;
  app_role: string;
  role_label: string;
  staff_title: string | null;
  has_account: boolean;
  portal: "/admin" | "/aipm";
};

/** Staff invite: set your name, username and password, then sign in to your own dashboard. */
function AcceptInvite() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const info = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api<Invite>(`/invites/${token}`, { auth: false }),
    retry: false,
  });
  const [f, setF] = useState({ full_name: "", username: "", password: "", confirm: "" });
  const accept = useMutation({
    mutationFn: () =>
      api<{ username: string; portal: "/admin" | "/aipm" }>(`/invites/${token}/accept`, {
        body: info.data?.has_account
          ? { password: f.password }
          : { full_name: f.full_name, username: f.username, password: f.password },
        auth: false,
      }),
  });
  const mismatch = f.confirm.length > 0 && f.password !== f.confirm;

  if (info.isLoading) return <HuzzlerLoader fullScreen label="Opening your invite" />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal px-5 py-10 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <img src="/huzzler-mark.svg" alt="Huzzler" className="h-10 w-10" />
          <div>
            <div className="font-display text-xl font-bold">Join the Huzzler team</div>
            <div className="text-xs text-white/50">Staff invite</div>
          </div>
        </div>

        {info.error ? (
          <ErrorNote error={info.error} />
        ) : accept.isSuccess ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-[color:var(--brand-green)]" />
            <div className="font-display text-xl font-bold">You're on the team</div>
            <p className="text-sm text-white/60">
              Sign in as <b className="text-white">@{accept.data.username}</b> to open your
              dashboard. You'll set up two-factor sign-in the first time if it's required.
            </p>
            <button
              onClick={() =>
                navigate({
                  to: accept.data.portal === "/aipm" ? "/aipm/login" : "/admin/login",
                  search: { username: accept.data.username },
                })
              }
              className="btn-duo mt-2 w-full"
            >
              <KeyRound className="h-4 w-4" /> Sign in
            </button>
          </div>
        ) : (
          info.data && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!mismatch) accept.mutate();
              }}
              className="flex flex-col gap-3"
            >
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
                <div className="flex items-center gap-2 font-display font-bold">
                  <ShieldCheck className="h-4 w-4 text-primary" /> {info.data.role_label}
                  {info.data.staff_title ? ` · ${info.data.staff_title}` : ""}
                </div>
                <div className="mt-1 text-white/60">{info.data.email}</div>
                {info.data.has_account && (
                  <p className="mt-2 text-xs text-white/60">
                    This email already has a Huzzler account. Enter its current password to add
                    staff access to it.
                  </p>
                )}
              </div>
              <ErrorNote error={accept.error} />
              {!info.data.has_account && (
                <>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">
                    Full name
                    <input
                      className={`${inputCls} !bg-white/5 !text-white`}
                      autoComplete="name"
                      required
                      minLength={2}
                      maxLength={80}
                      value={f.full_name}
                      onChange={(e) => setF({ ...f, full_name: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">
                    Username
                    <input
                      className={`${inputCls} !bg-white/5 !text-white`}
                      autoComplete="username"
                      required
                      pattern="[a-zA-Z0-9_]{3,24}"
                      title="3-24 letters, numbers or underscores"
                      value={f.username}
                      onChange={(e) => setF({ ...f, username: e.target.value.trim() })}
                    />
                  </label>
                </>
              )}
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                {info.data.has_account ? "Current password" : "Password"}
                <input
                  type="password"
                  className={`${inputCls} !bg-white/5 !text-white`}
                  autoComplete={info.data.has_account ? "current-password" : "new-password"}
                  required
                  minLength={info.data.has_account ? 1 : 8}
                  value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })}
                />
              </label>
              {!info.data.has_account && (
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Confirm password
                  <input
                    type="password"
                    className={`${inputCls} !bg-white/5 !text-white`}
                    autoComplete="new-password"
                    required
                    value={f.confirm}
                    onChange={(e) => setF({ ...f, confirm: e.target.value })}
                  />
                  {mismatch && (
                    <span className="text-xs font-normal text-red-400">Passwords don't match.</span>
                  )}
                </label>
              )}
              <button
                disabled={accept.isPending || mismatch}
                className="btn-duo mt-2 disabled:opacity-50"
              >
                {accept.isPending ? <ButtonSpinner /> : <CheckCircle2 className="h-4 w-4" />} Accept
                invite
              </button>
            </form>
          )
        )}
      </div>
    </div>
  );
}
