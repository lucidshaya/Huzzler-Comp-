import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Mail,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import { api, naira } from "@/lib/api";
import { hasPaid, roleName, useMe, useRefreshMe } from "@/lib/journey";
import {
  Card,
  CardTitle,
  ErrorNote,
  Field,
  inputCls,
  Notice,
  PageHeader,
} from "@/components/app/ui";

export const Route = createFileRoute("/_app/begin")({
  head: () => ({ meta: [{ title: "Begin onboarding · Huzzler" }] }),
  component: Begin,
});

const TESTS = [
  { no: 1, name: "Fundamentals", how: "Multiple choice, auto-graded", weight: 10, mins: 20 },
  {
    no: 2,
    name: "Practical check",
    how: "Hands-on task checked against an answer key or sandbox",
    weight: 20,
    mins: 45,
  },
  {
    no: 3,
    name: "Core task",
    how: "The main deliverable of your role, graded against a rubric (AI-assisted)",
    weight: 25,
    mins: 90,
  },
  {
    no: 4,
    name: "Applied scenario",
    how: "A realistic workplace problem, rubric-graded (AI-assisted)",
    weight: 25,
    mins: 60,
  },
  {
    no: 5,
    name: "Teamwork judgement",
    how: "Situational questions, auto-scored",
    weight: 20,
    mins: 20,
  },
];

const CONSENTS: Array<{ type: string; label: string; detail: string; required: boolean }> = [
  {
    type: "terms",
    label: "I accept the Terms of Service",
    detail: "How Huzzler works, payments, refunds and conduct.",
    required: true,
  },
  {
    type: "privacy",
    label: "I accept the Privacy Policy",
    detail: "What data we collect and why, under Nigeria's NDPA.",
    required: true,
  },
  {
    type: "ai_grading",
    label: "I understand some of my work is graded with AI assistance",
    detail:
      "Open-ended work (tests 3–4 and project deliverables) is scored against a rubric with AI help. The platform, not the AI, applies the pass mark. Every grade can be appealed to a human once.",
    required: true,
  },
  {
    type: "cross_border",
    label: "I agree my data may be processed outside Nigeria",
    detail:
      "Our AI grading and hosting providers run outside Nigeria. We never send your name, email or phone number to the AI.",
    required: true,
  },
  {
    type: "marketing",
    label: "Send me product news and tips (optional)",
    detail: "You can turn this off any time in Settings.",
    required: false,
  },
];

function Begin() {
  const { data: me } = useMe();
  const refresh = useRefreshMe();
  if (!me) return null;
  const s = me.journey.status;

  if (hasPaid(s)) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <PageHeader chip="Onboarding" title="You're all set." body="Your plan is active." />
        <Link to="/tests" className="btn-duo self-start">
          Go to your tests
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        chip={`${roleName(me.profile.role_id)} · Onboarding`}
        title="Begin onboarding"
        body="Read how onboarding works, accept the consents, then choose a plan."
      />
      <BeginSteps status={s} minor={me.profile.is_minor} />
      <RulesCard />
      {(s === "REGISTERED" ||
        s === "FIELD_CHOSEN" ||
        s === "PREVIEW" ||
        s === "ONBOARDING_STARTED") && <ConsentsStep onDone={refresh} />}
      {s === "GUARDIAN_PENDING" && <GuardianStep />}
      {(s === "PAYMENT_PENDING" || s === "LAPSED") && <PlanStep />}
    </div>
  );
}

function BeginSteps({ status, minor }: { status: string; minor: boolean }) {
  const steps = [
    { label: "Consents", done: ["GUARDIAN_PENDING", "PAYMENT_PENDING", "LAPSED"].includes(status) },
    ...(minor
      ? [{ label: "Guardian approval", done: ["PAYMENT_PENDING", "LAPSED"].includes(status) }]
      : []),
    { label: "Payment", done: false },
  ];
  const current = steps.findIndex((x) => !x.done);
  return (
    <ol className="flex items-center gap-2" aria-label="Onboarding steps">
      {steps.map((x, i) => (
        <li
          key={x.label}
          className="flex flex-1 items-center gap-2"
          aria-current={i === current ? "step" : undefined}
        >
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-sm font-bold ${
              x.done
                ? "bg-primary text-primary-foreground"
                : i === current
                  ? "bg-primary/15 text-primary ring-2 ring-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {x.done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
          </span>
          <span
            className={`hidden text-sm font-semibold sm:inline ${i === current ? "text-foreground" : "text-muted-foreground"}`}
          >
            {x.label}
          </span>
          {i < steps.length - 1 && (
            <span className={`h-0.5 flex-1 rounded-full ${x.done ? "bg-primary" : "bg-muted"}`} />
          )}
        </li>
      ))}
    </ol>
  );
}

function RulesCard() {
  return (
    <Card>
      <CardTitle icon={ClipboardList}>How onboarding works</CardTitle>
      <div className="grid gap-2">
        {TESTS.map((t) => (
          <div key={t.no} className="flex items-start gap-3 rounded-xl border border-border p-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-display text-sm font-bold text-primary">
              T{t.no}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-display text-sm font-bold">{t.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t.weight}% · <Timer className="inline h-3 w-3" /> {t.mins} min
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t.how}</p>
            </div>
          </div>
        ))}
      </div>
      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <li className="flex gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Pass: 70% weighted average and
          no test below 50%.
        </li>
        <li className="flex gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> 3 attempts included.
          Retake the tests under 70% right away, then once more after 7 days.
        </li>
        <li className="flex gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> Tests are timed and save drafts
          as you go.
        </li>
        <li className="flex gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> AI tools are fine for learning;
          submitted work must be your own.
        </li>
      </ul>
    </Card>
  );
}

function ConsentsStep({ onDone }: { onDone: () => void }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const allRequired = CONSENTS.filter((c) => c.required).every((c) => checked[c.type]);
  const m = useMutation({
    mutationFn: async () => {
      await api("/me/consents", {
        body: { items: CONSENTS.map((c) => ({ type: c.type, granted: Boolean(checked[c.type]) })) },
      });
      await api("/me/begin-onboarding", { method: "POST" });
    },
    onSuccess: onDone,
  });
  return (
    <Card>
      <CardTitle icon={ShieldCheck}>Your consents</CardTitle>
      <p className="mb-3 text-sm text-muted-foreground">
        Each consent is recorded separately with the date and version. You can review them any time
        in Settings.
      </p>
      <div className="flex flex-col gap-2">
        {CONSENTS.map((c) => (
          <label
            key={c.type}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${checked[c.type] ? "border-primary/50 bg-primary/5" : "border-border"}`}
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[color:var(--primary)]"
              checked={Boolean(checked[c.type])}
              onChange={(e) => setChecked({ ...checked, [c.type]: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-semibold">
                {c.label}
                {c.required && <span className="text-red-500"> *</span>}
              </span>
              <span className="block text-xs text-muted-foreground">{c.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <ErrorNote error={m.error} />
        <button
          disabled={!allRequired || m.isPending}
          onClick={() => m.mutate()}
          className="btn-duo self-end disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : "Continue"}
        </button>
      </div>
    </Card>
  );
}

function GuardianStep() {
  const { data: me } = useMe();
  const [form, setForm] = useState({
    guardian_name: "",
    guardian_email: "",
    guardian_phone: "",
    relationship: "Parent",
  });
  const [devLink, setDevLink] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      api<{ sent: boolean; devLink?: string }>("/me/guardian", {
        body: { ...form, guardian_phone: form.guardian_phone || undefined },
      }),
    onSuccess: (r) => setDevLink(r.devLink ?? null),
  });
  const pending = me?.guardian?.status === "pending";
  return (
    <Card>
      <CardTitle icon={Users}>Parent or guardian consent</CardTitle>
      <p className="mb-4 text-sm text-muted-foreground">
        Because you're 17, a parent or guardian must approve your account before you can pay. We'll
        email them a secure link.
      </p>
      {(pending || m.isSuccess) && (
        <Notice tone="success">
          <span className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> We've sent the request
            {me?.guardian?.guardian_email ? ` to ${me.guardian.guardian_email}` : ""}. This page
            updates once they approve.
          </span>
          {devLink && (
            <a className="mt-2 block break-all text-xs text-primary underline" href={devLink}>
              Development only: open the guardian link
            </a>
          )}
        </Notice>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="mt-4 grid gap-4 sm:grid-cols-2"
      >
        <Field label="Guardian's full name">
          <input
            className={inputCls}
            required
            value={form.guardian_name}
            onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
          />
        </Field>
        <Field label="Relationship">
          <select
            className={inputCls}
            value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
          >
            {["Parent", "Guardian", "Other relative"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Guardian's email">
          <input
            type="email"
            className={inputCls}
            required
            value={form.guardian_email}
            onChange={(e) => setForm({ ...form, guardian_email: e.target.value })}
          />
        </Field>
        <Field label="Guardian's phone (optional)">
          <input
            type="tel"
            className={inputCls}
            value={form.guardian_phone}
            onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
          />
        </Field>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <ErrorNote error={m.error} />
          <button disabled={m.isPending} className="btn-duo self-end">
            {m.isPending ? "Sending…" : pending ? "Send again" : "Send request"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function PlanStep() {
  const [plan, setPlan] = useState<"one_time" | "monthly">("one_time");
  const m = useMutation({
    mutationFn: () => api<{ authorization_url: string }>("/billing/initialize", { body: { plan } }),
    // Paystack's hosted checkout supports card, bank transfer and USSD; the server verifies on return.
    onSuccess: (r) => (window.location.href = r.authorization_url),
  });
  const plans = [
    {
      id: "one_time" as const,
      name: "One-time",
      kobo: 500000,
      per: "once",
      note: "Full journey to certification. 6 months of access.",
      badge: "Best value",
    },
    {
      id: "monthly" as const,
      name: "Monthly",
      kobo: 250000,
      per: "/ month",
      note: "Same features while active. Cancel any time.",
    },
  ];
  return (
    <Card>
      <CardTitle icon={CreditCard}>Choose your plan</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Plan">
        {plans.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={plan === p.id}
            onClick={() => setPlan(p.id)}
            className={`relative rounded-2xl border-2 p-5 text-left transition-all ${plan === p.id ? "border-primary ring-4 ring-primary/15" : "border-border hover:border-primary/60"}`}
          >
            {p.badge && <span className="chip absolute right-4 top-4">{p.badge}</span>}
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {p.name}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-3xl font-bold">{naira(p.kobo)}</span>
              <span className="text-sm text-muted-foreground">{p.per}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{p.note}</p>
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Pay securely with Paystack by card, bank transfer or USSD. Refunds: full refund within 48
        hours if you haven't started a test.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <ErrorNote error={m.error} />
        <button disabled={m.isPending} onClick={() => m.mutate()} className="btn-duo self-end">
          {m.isPending
            ? "Opening Paystack…"
            : `Pay ${naira(plans.find((p) => p.id === plan)!.kobo)}`}
        </button>
      </div>
    </Card>
  );
}
