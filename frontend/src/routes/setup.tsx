import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { api, ApiError } from "@/lib/api";
import { ROLES, useMe, useRefreshMe, hasPaid } from "@/lib/journey";
import { ErrorNote, Field, inputCls, Notice, Spinner } from "@/components/app/ui";
import { ThemeToggle } from "@/lib/theme";
import { HzSelect } from "@/components/app/HzSelect";

export const Route = createFileRoute("/setup")({
  ssr: false,
  head: () => ({ meta: [{ title: "Set up your profile · Huzzler" }] }),
  component: Setup,
});

const TZ_DEFAULT =
  typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Africa/Lagos";

function ageFrom(dob: string) {
  const d = new Date(dob);
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate()))
    a--;
  return a;
}

function Setup() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) navigate({ to: "/auth", search: { mode: "login", next: "/setup" } });
        else setAuthed(true);
      });
  }, [navigate]);
  const { data: me, isLoading } = useMe(Boolean(authed));
  const [step, setStep] = useState<"profile" | "phone" | "field">("profile");

  useEffect(() => {
    if (!me) return;
    if (me.flags.profile_ready) setStep("field");
  }, [me]);

  if (!authed || isLoading || !me) return <Spinner fullScreen />;

  const steps = [
    { key: "profile", label: "Profile" },
    { key: "phone", label: "Phone" },
    { key: "field", label: "Field" },
  ] as const;
  const current = steps.findIndex((s) => s.key === step);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[640px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
        aria-hidden
      />
      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <img src="/huzzler-mark.svg" alt="Huzzler" className="h-9 w-9" />
        <ThemeToggle />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-5 pb-16 pt-4">
        <div className={`w-full ${step === "field" ? "max-w-3xl" : "max-w-xl"}`}>
          <ol className="mb-6 flex items-center gap-2" aria-label="Setup steps">
            {steps.map((s, i) => (
              <li
                key={s.key}
                className="flex flex-1 flex-col gap-1.5"
                aria-current={i === current ? "step" : undefined}
              >
                <span
                  className={`h-1.5 rounded-full transition-colors ${i <= current ? "bg-primary" : "bg-muted"}`}
                />
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider ${i === current ? "text-primary" : "text-muted-foreground"}`}
                >
                  {i + 1}. {s.label}
                </span>
              </li>
            ))}
          </ol>
          {step === "profile" && <ProfileStep onDone={() => setStep("phone")} />}
          {step === "phone" && <PhoneStep onDone={() => setStep("field")} />}
          {step === "field" && <FieldStep onDone={() => navigate({ to: "/dashboard" })} />}
        </div>
      </main>
    </div>
  );
}

function ProfileStep({ onDone }: { onDone: () => void }) {
  const { data: me } = useMe();
  const refresh = useRefreshMe();
  const p = me!.profile;
  const [form, setForm] = useState({
    full_name: p.full_name ?? "",
    username: p.username ?? "",
    dob: p.dob ?? "",
    phone: p.phone ?? "+234",
    timezone: p.timezone ?? TZ_DEFAULT,
    hours_per_week: p.hours_per_week ?? 10,
  });
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const age = form.dob ? ageFrom(form.dob) : null;
  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: k === "hours_per_week" ? Number(e.target.value) : e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api("/me/profile", { method: "PUT", body: form });
      await refresh();
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="card-duo flex flex-col gap-5 p-6 md:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Tell us about you</h1>
        <p className="text-sm text-muted-foreground">
          We use this to match you with a team in your time zone with similar availability.
        </p>
      </div>
      <ErrorNote error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input
            className={inputCls}
            value={form.full_name}
            onChange={set("full_name")}
            required
            autoComplete="name"
          />
        </Field>
        <Field label="Username" hint="Used for your public portfolio: huzzler.app/u/username">
          <input
            className={inputCls}
            value={form.username}
            onChange={set("username")}
            required
            pattern="[A-Za-z0-9_]{3,24}"
          />
        </Field>
        <Field
          label="Date of birth"
          error={age !== null && age < 17 ? "You must be at least 17 to join Huzzler." : undefined}
        >
          <input
            type="date"
            className={inputCls}
            value={form.dob}
            onChange={set("dob")}
            required
            max={new Date().toISOString().slice(0, 10)}
          />
        </Field>
        <Field label="Phone number" hint="International format, e.g. +2348012345678">
          <input
            type="tel"
            className={inputCls}
            value={form.phone}
            onChange={set("phone")}
            required
            autoComplete="tel"
          />
        </Field>
        <Field label="Time zone">
          <input className={inputCls} value={form.timezone} onChange={set("timezone")} required />
        </Field>
        <Field label="Hours you can give per week">
          <HzSelect
            size="lg"
            label="Hours you can give per week"
            value={String(form.hours_per_week)}
            onChange={(v) => setForm({ ...form, hours_per_week: Number(v) })}
            options={[5, 8, 10, 15, 20, 25, 30].map((h) => ({ value: String(h), label: `${h} hours`, hint: h >= 15 ? "Faster progress through projects" : undefined }))}
          />
        </Field>
      </div>
      {age === 17 && (
        <Notice tone="warn">
          Because you're 17, a parent or guardian will need to approve your account before you can
          pay. We'll guide you through it.
        </Notice>
      )}
      <button
        disabled={saving || (age !== null && age < 17)}
        className="btn-duo self-end disabled:opacity-50"
      >
        {saving ? "Saving…" : "Continue"} <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}

function PhoneStep({ onDone }: { onDone: () => void }) {
  const { data: me } = useMe();
  const refresh = useRefreshMe();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const phone = me!.profile.phone ?? "";
  const required = me!.flags.require_phone_otp;

  const verified = me!.profile.phone_verified;
  useEffect(() => {
    if (verified) onDone();
  }, [verified, onDone]);
  if (verified) return null;

  const send = async () => {
    setError(null);
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ phone });
    setBusy(false);
    if (error)
      setError(
        new Error(
          error.message.includes("provider")
            ? "SMS isn't set up yet. You can skip this for now."
            : error.message,
        ),
      );
    else setSent(true);
  };
  const verify = async () => {
    setError(null);
    setBusy(true);
    const { error } = await supabase().auth.verifyOtp({ phone, token: code, type: "phone_change" });
    if (error) {
      setBusy(false);
      setError(new Error("That code didn't work. Check it and try again."));
      return;
    }
    const r = await api<{ verified: boolean }>("/me/phone/sync", { method: "POST" });
    setBusy(false);
    await refresh();
    if (r.verified) onDone();
    else setError(new Error("We couldn't confirm your phone. Try again."));
  };

  return (
    <div className="card-duo flex flex-col gap-5 p-6 md:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Verify your phone</h1>
        <p className="text-sm text-muted-foreground">
          We'll text a 6-digit code to <b>{phone}</b>. Teammates never see your number.
        </p>
      </div>
      <ErrorNote error={error} />
      {!sent ? (
        <button onClick={send} disabled={busy} className="btn-duo self-start">
          {busy ? "Sending…" : "Send code"}
        </button>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-label="Verification code"
            className={`${inputCls} sm:max-w-[200px] text-center font-mono text-xl tracking-[0.4em]`}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button
            onClick={verify}
            disabled={busy || code.length !== 6}
            className="btn-duo disabled:opacity-50"
          >
            {busy ? "Checking…" : "Verify"}
          </button>
          <button
            onClick={send}
            disabled={busy}
            className="text-sm font-semibold text-muted-foreground hover:text-primary"
          >
            Resend
          </button>
        </div>
      )}
      {!required && (
        <button
          onClick={onDone}
          className="self-end text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          Skip for now →
        </button>
      )}
    </div>
  );
}

function FieldStep({ onDone }: { onDone: () => void }) {
  const { data: me } = useMe();
  const refresh = useRefreshMe();
  const [selected, setSelected] = useState<string | null>(me!.profile.role_id);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const paid = hasPaid(me!.journey.status);
  const switchesLeft = paid ? Math.max(0, 1 - me!.profile.field_switches_used) : null;

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      if (selected !== me!.profile.role_id) await api("/me/field", { body: { role_id: selected } });
      await refresh();
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err : new Error("Couldn't save your field"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
          Choose your field
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          {paid
            ? `You have ${switchesLeft} free switch left before you pass onboarding.`
            : "You can change this freely until you pay. After that, you get one free switch before passing onboarding."}
        </p>
      </div>
      <ErrorNote error={error} />
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Field">
        {ROLES.map((r) => {
          const Icon = r.icon;
          const on = selected === r.id;
          return (
            <button
              key={r.id}
              role="radio"
              aria-checked={on}
              onClick={() => setSelected(r.id)}
              className={`group flex items-center gap-4 rounded-2xl border-2 bg-card px-4 py-4 text-left transition-all ${on ? "border-primary ring-4 ring-primary/15" : "border-border hover:border-primary/60"}`}
            >
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-2 ${on ? "bg-primary/15 text-primary ring-primary/30" : "bg-muted text-foreground ring-border"}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base font-bold">{r.name}</span>
                <span className="block text-xs text-muted-foreground">{r.blurb}</span>
              </span>
              {on && <CheckCircle2 className="h-5 w-5 text-primary" />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <ShieldCheck className="h-4 w-4" /> Next you'll see a full preview of the dashboard — no
          payment needed.
        </span>
        <button
          disabled={
            !selected || saving || (paid && switchesLeft === 0 && selected !== me!.profile.role_id)
          }
          onClick={save}
          className="btn-duo disabled:opacity-50"
        >
          {saving ? "Saving…" : "Continue"} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
