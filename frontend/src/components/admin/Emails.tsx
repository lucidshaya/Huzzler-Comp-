/* eslint-disable @typescript-eslint/no-explicit-any -- admin API payloads are loosely shaped JSON */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, CheckCircle2, Mail, Send, Users } from "lucide-react";
import { api } from "@/lib/api";
import { ROLES, roleName } from "@/lib/journey";
import { Card, CardTitle, EmptyState, fmtDateTime, inputCls, Pill, Progress, Spinner } from "@/components/app/ui";
import { HzSelect } from "@/components/app/HzSelect";
import { hzConfirm } from "@/components/app/Dialogs";
import { hzToast } from "@/components/app/Toast";

type Draft = { id: string | null; subject: string; body: string; segment: string; role_id: string };
const EMPTY: Draft = { id: null, subject: "", body: "Hi {{first_name}},\n\n", segment: "all", role_id: "" };

const STATUS_TONE: Record<string, "muted" | "primary" | "gold" | "green" | "red"> = { draft: "muted", sending: "primary", sent: "green", failed: "red", cancelled: "gold" };

export function EmailsTab() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["admin", "emails"] });
  const list = useQuery({
    queryKey: ["admin", "emails"],
    queryFn: () => api<{ configured: boolean; from: string; segments: Array<{ value: string; label: string }>; campaigns: any[] }>("/admin/emails"),
    refetchInterval: (q) => ((q.state.data?.campaigns ?? []).some((c: any) => c.status === "sending") ? 4000 : false),
  });
  const [d, setD] = useState<Draft>(EMPTY);
  const audience = { segment: d.segment, role_id: d.role_id || null };

  const count = useQuery({
    queryKey: ["admin", "emails", "audience", d.segment, d.role_id],
    queryFn: () => api<{ count: number }>(`/admin/emails/audience?segment=${d.segment}&role_id=${d.role_id}`),
  });

  // Live preview, debounced.
  const [preview, setPreview] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ html: string }>("/admin/emails/preview", { body: { subject: d.subject, body: d.body } })
        .then((r) => setPreview(r.html))
        .catch(() => {});
    }, 450);
    return () => clearTimeout(t);
  }, [d.subject, d.body]);

  const save = useMutation({
    mutationFn: async () => {
      const body = { subject: d.subject, body: d.body, audience };
      const row = d.id ? await api<any>(`/admin/emails/${d.id}`, { method: "PUT", body }) : await api<any>("/admin/emails", { body });
      setD((x) => ({ ...x, id: row.id }));
      return row;
    },
    onSuccess: inv,
  });
  const test = useMutation({
    mutationFn: async () => {
      const row = await save.mutateAsync();
      return api<{ to: string }>(`/admin/emails/${row.id}/test`, { method: "POST" });
    },
    onSuccess: (r) => hzToast.success("Test email sent", `Check ${r.to}. It's marked [Test] in the subject.`),
    onError: hzToast.fromError,
  });
  const send = useMutation({
    mutationFn: async () => {
      const row = await save.mutateAsync();
      return api<{ recipients: number }>(`/admin/emails/${row.id}/send`, { method: "POST" });
    },
    onSuccess: (r) => {
      inv();
      setD(EMPTY);
      hzToast.success("Sending started", `${r.recipients} email${r.recipients === 1 ? "" : "s"} are going out in batches. Progress shows below.`);
    },
    onError: hzToast.fromError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/emails/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      inv();
      hzToast.success("Draft deleted");
    },
    onError: hzToast.fromError,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/admin/emails/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      inv();
      hzToast.info("Sending cancelled", "Emails already delivered can't be recalled.");
    },
    onError: hzToast.fromError,
  });

  const valid = d.subject.trim().length >= 3 && d.body.trim().length >= 10;
  const n = count.data?.count ?? 0;
  const segLabel = list.data?.segments.find((s) => s.value === d.segment)?.label ?? "All learners";
  const busy = save.isPending || test.isPending || send.isPending;

  if (list.isLoading) return <Spinner />;
  const configured = list.data?.configured;

  return (
    <div className="flex flex-col gap-5">
      {!configured && <SetupSteps from={list.data?.from} />}
      <HowTo />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle icon={Mail} aside={d.id ? <Pill>editing draft</Pill> : undefined}>
            Write an announcement
          </CardTitle>
          <div className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Who gets it</span>
                <HzSelect label="Audience" value={d.segment} onChange={(v) => setD({ ...d, segment: v })} options={list.data?.segments ?? []} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Field</span>
                <HzSelect label="Field" value={d.role_id} onChange={(v) => setD({ ...d, role_id: v })} options={[{ value: "", label: "All fields" }, ...ROLES.map((r) => ({ value: r.id, label: r.name }))]} />
              </label>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
              <Users className="h-4 w-4 text-primary" />
              {count.isFetching ? "Counting…" : (
                <span>
                  <b>{n}</b> learner{n === 1 ? "" : "s"} will get this <span className="text-muted-foreground">(opted-out, suspended and staff accounts are always excluded)</span>
                </span>
              )}
            </div>
            <input className={`${inputCls} !py-2.5 text-sm`} placeholder="Subject line" aria-label="Subject" maxLength={150} value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} />
            <textarea className={`${inputCls} min-h-[220px] resize-y font-mono text-sm leading-relaxed`} aria-label="Message" maxLength={20000} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              <code>{"{{first_name}}"}</code> inserts each person's first name · <code>**bold**</code> · lines starting with <code>- </code> become a list · leave a blank line between paragraphs · links work as-is or as <code>[text](https://…)</code>
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!valid || busy} onClick={() => save.mutate(undefined, { onSuccess: () => hzToast.success("Draft saved"), onError: hzToast.fromError })} className="btn-duo-outline !py-2 !px-4 text-sm disabled:opacity-50">
                Save draft
              </button>
              <button type="button" disabled={!valid || busy || !configured} onClick={() => test.mutate()} className="btn-duo-outline !py-2 !px-4 text-sm disabled:opacity-50">
                {test.isPending ? "Sending test…" : "Send test to me"}
              </button>
              <button
                type="button"
                disabled={!valid || busy || !configured || n === 0}
                onClick={async () => {
                  const ok = await hzConfirm({
                    title: `Send to ${n} learner${n === 1 ? "" : "s"}?`,
                    body: `"${d.subject}" goes to ${segLabel.toLowerCase()}${d.role_id ? ` in ${roleName(d.role_id)}` : ""}. Emails can't be recalled once delivered.`,
                    confirmLabel: `Send ${n} email${n === 1 ? "" : "s"}`,
                    danger: true,
                  });
                  if (ok) send.mutate();
                }}
                className="btn-duo !py-2 !px-4 text-sm disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> {send.isPending ? "Starting…" : `Send to ${n}`}
              </button>
              {d.id && (
                <button type="button" onClick={() => setD(EMPTY)} className="px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
                  New email
                </button>
              )}
            </div>
            {!configured && <p className="text-xs font-semibold text-[color:var(--gold)]">Sending is disabled until email is set up (see the steps above). You can still write and save drafts.</p>}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardTitle>Preview</CardTitle>
          <p className="mb-2 text-xs text-muted-foreground">Shown with "Ada" as the first name. Every email ends with an unsubscribe link.</p>
          <iframe title="Email preview" sandbox="" srcDoc={preview} className="min-h-[480px] w-full flex-1 rounded-xl border border-border bg-white" />
        </Card>
      </div>

      <Card>
        <CardTitle>Sent and draft emails</CardTitle>
        {(list.data?.campaigns ?? []).length === 0 ? (
          <EmptyState icon={Mail} title="No emails yet" body="Drafts you save and announcements you send appear here with their delivery progress." />
        ) : (
          <div className="divide-y divide-border">
            {list.data!.campaigns.map((c) => {
              const seg = list.data!.segments.find((s) => s.value === c.audience?.segment)?.label ?? "All learners";
              const pct = c.recipients_total ? Math.round(((c.sent_count + c.failed_count) / c.recipients_total) * 100) : 0;
              return (
                <div key={c.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-bold">{c.subject}</span>
                      <Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {seg}
                      {c.audience?.role_id ? ` · ${roleName(c.audience.role_id)}` : ""} · {c.creator?.full_name ?? "staff"} · {fmtDateTime(c.started_at ?? c.created_at)}
                    </div>
                    {c.status !== "draft" && (
                      <div className="mt-2 max-w-md">
                        <Progress value={pct} />
                        <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-primary" /> {c.sent_count}/{c.recipients_total} sent
                          </span>
                          {c.failed_count > 0 && <span className="font-semibold text-red-500">{c.failed_count} failed</span>}
                        </div>
                        {c.last_error && c.status !== "sent" && <div className="mt-1 text-[11px] text-red-500">{c.last_error}</div>}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {c.status === "draft" && (
                      <>
                        <button onClick={() => setD({ id: c.id, subject: c.subject, body: c.body, segment: c.audience?.segment ?? "all", role_id: c.audience?.role_id ?? "" })} className="rounded-lg px-2.5 py-1 text-xs font-bold text-primary ring-1 ring-primary/30 hover:bg-primary/10">
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (await hzConfirm({ title: "Delete this draft?", body: c.subject, confirmLabel: "Delete draft", danger: true })) remove.mutate(c.id);
                          }}
                          className="rounded-lg px-2.5 py-1 text-xs font-bold text-red-500 ring-1 ring-red-500/30 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {c.status === "sending" && (
                      <button
                        onClick={async () => {
                          if (await hzConfirm({ title: "Stop sending?", body: "People who already got it keep it. The rest won't be emailed.", confirmLabel: "Stop sending", danger: true })) cancel.mutate(c.id);
                        }}
                        className="rounded-lg px-2.5 py-1 text-xs font-bold text-red-500 ring-1 ring-red-500/30 hover:bg-red-500/10"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function SetupSteps({ from }: { from?: string }) {
  return (
    <Card className="border-[color:var(--gold)]/40 bg-[color:var(--gold)]/5">
      <CardTitle icon={AlertTriangle}>Set up email sending (one time)</CardTitle>
      <p className="mb-3 text-sm text-muted-foreground">Huzzler sends email through Resend. Until it's connected you can write drafts, but nothing is sent.</p>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
        <li>
          Create a free account at <a className="font-bold text-primary underline" href="https://resend.com" target="_blank" rel="noreferrer">resend.com</a>.
        </li>
        <li>
          In Resend → <b>Domains</b>, add the domain you send from (currently <code>{from ?? "EMAIL_FROM"}</code>) and add the DNS records it shows at your domain provider. Wait until it says <b>Verified</b>.
        </li>
        <li>
          In Resend → <b>API Keys</b>, create a key with <b>Sending access</b>.
        </li>
        <li>
          In Vercel → project <b>huzzler-api</b> → Settings → Environment Variables, add <code>RESEND_API_KEY</code> (the key) and check <code>EMAIL_FROM</code> uses the verified domain, e.g. <code>Huzzler &lt;hello@yourdomain.com&gt;</code>.
        </li>
        <li>Redeploy huzzler-api (Deployments → ⋯ → Redeploy). This banner disappears once it's connected.</li>
      </ol>
    </Card>
  );
}

function HowTo() {
  return (
    <details className="card-duo group p-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-base font-bold">
        <BookOpen className="h-4 w-4 text-primary" /> How to send a bulk email
        <span className="ml-auto text-xs font-semibold text-muted-foreground group-open:hidden">Show steps</span>
      </summary>
      <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
        <li><b className="text-foreground">Pick the audience</b>: a journey stage (e.g. "Verified, waiting for a team") and optionally one field. The count updates as you choose.</li>
        <li><b className="text-foreground">Write it</b>: a clear subject, then the message. Use <code>{"{{first_name}}"}</code> to personalise. Check the preview on the right.</li>
        <li><b className="text-foreground">Save draft</b> if you want someone to review it first. Drafts can be edited or deleted.</li>
        <li><b className="text-foreground">Send test to me</b>: it arrives in your staff inbox marked [Test]. Check links and wording on your phone.</li>
        <li><b className="text-foreground">Send</b>: confirm the number of recipients. Emails go out in batches of 100; watch progress in the list below. You can cancel while it's sending.</li>
        <li>Everyone gets an unsubscribe link (required by the NDPA). People who unsubscribe are skipped automatically next time; payment and consent emails still reach them.</li>
      </ol>
    </details>
  );
}
