/* eslint-disable @typescript-eslint/no-explicit-any -- admin API payloads are loosely shaped JSON rendered read-only */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { api, naira } from "@/lib/api";
import { ROLES, roleName, STATUS_LABEL, type JourneyStatus } from "@/lib/journey";
import {
  Card,
  CardTitle,
  EmptyState,
  ErrorNote,
  fmtDate,
  fmtDateTime,
  inputCls,
  Pill,
  ScoreBadge,
  Spinner,
} from "@/components/app/ui";
import { HzSelect } from "@/components/app/HzSelect";
import { HzSwitch } from "@/components/app/HzSwitch";
import { hzForm, hzPrompt } from "@/components/app/Dialogs";
import { hzToast } from "@/components/app/Toast";
import { TableSkeleton } from "@/components/app/Skeleton";

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["admin"] });
};
/** Asks for the audit-log reason every sensitive admin action needs. */
const askReason = (title: string, confirmLabel = "Confirm") =>
  hzPrompt({
    title,
    label: "Reason (saved to the audit log)",
    type: "textarea",
    minLength: 3,
    maxLength: 500,
    confirmLabel,
  });

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
const Td = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-3 py-2 align-top ${className}`}>{children}</td>
);
const SmallBtn = ({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) => (
  <button
    disabled={disabled}
    onClick={onClick}
    className={`rounded-lg px-2.5 py-1 text-xs font-bold ring-1 disabled:opacity-40 ${danger ? "text-red-500 ring-red-500/30 hover:bg-red-500/10" : "text-primary ring-primary/30 hover:bg-primary/10"}`}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
export function UsersTab() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", q, status],
    queryFn: () => api<any[]>(`/admin/users?q=${encodeURIComponent(q)}&status=${status}`),
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search users"
            className={`${inputCls} !py-2 pl-9`}
            placeholder="Search name or username"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-56">
          <HzSelect
            label="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "All statuses" },
              ...Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v })),
            ]}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Learners only. Huzzler staff are managed in the Team tab.
      </p>
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <Table head={["Name", "Field", "Status", "Plan", "Joined", ""]}>
          {(data ?? []).map((u) => (
            <tr key={u.id}>
              <Td>
                <div className="font-semibold">{u.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  @{u.username ?? "—"}
                  {u.is_minor ? " · 17" : ""}
                </div>
              </Td>
              <Td>{roleName(u.role_id)}</Td>
              <Td>
                <Pill tone="primary">
                  {STATUS_LABEL[u.journey?.status as JourneyStatus] ?? "—"}
                </Pill>
              </Td>
              <Td>{u.journey?.plan_id ?? "—"}</Td>
              <Td>{fmtDate(u.created_at)}</Td>
              <Td>
                <SmallBtn onClick={() => setOpenId(u.id)}>Open</SmallBtn>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {openId && <UserDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function UserDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const inv = useInvalidate();
  const { data, error } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => api<any>(`/admin/users/${id}`),
  });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown; done: string }) =>
      api(path, { body }),
    onSuccess: (_d, v) => {
      inv();
      hzToast.success(v.done);
    },
    onError: hzToast.fromError,
  });
  const run = async (
    path: string,
    body: Record<string, unknown>,
    done: string,
    prompt?: string,
  ) => {
    if (prompt) {
      const reason = await askReason(prompt);
      if (!reason) return;
      body.reason = reason;
    }
    act.mutate({ path, body, done });
  };
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-[520px] max-w-full flex-col gap-4 overflow-y-auto border-l border-border bg-background p-5"
        role="dialog"
        aria-label="User details"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">{data?.profile.full_name ?? "User"}</h2>
          <button onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ErrorNote error={error ?? act.error} />
        {!data ? (
          <TableSkeleton />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Email</span>
                <div className="truncate font-semibold">{data.email}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                <div className="font-semibold">
                  {STATUS_LABEL[data.journey.status as JourneyStatus]}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Field</span>
                <div className="font-semibold">{roleName(data.profile.role_id)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Attempts used</span>
                <div className="font-semibold">{data.journey.attempts_used}</div>
              </div>
              <div>
                <span className="text-muted-foreground">DOB</span>
                <div className="font-semibold">
                  {data.profile.dob ?? "—"}
                  {data.profile.is_minor ? " (17)" : ""}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Identity</span>
                <div className="font-semibold">
                  {data.profile.identity_verified ? "Verified" : "Not verified"}
                </div>
              </div>
            </div>
            {data.identity_document_url && (
              <a
                href={data.identity_document_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-bold text-primary underline"
              >
                View uploaded ID (expires in 5 min)
              </a>
            )}
            {data.profile.is_protected && (
              <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
                <b>Protected admin account.</b> It always keeps the admin role and can't be
                suspended or deleted — enforced by the database.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <SmallBtn
                onClick={() =>
                  run(
                    `/admin/users/${id}/verify-identity`,
                    { verified: !data.profile.identity_verified },
                    data.profile.identity_verified
                      ? "Identity marked unverified"
                      : "Identity verified",
                  )
                }
              >
                {data.profile.identity_verified ? "Unverify ID" : "Verify ID"}
              </SmallBtn>
              {data.profile.is_protected ? null : data.journey.status === "SUSPENDED" ? (
                <SmallBtn
                  onClick={() =>
                    run(
                      `/admin/users/${id}/status`,
                      { to: "RESUME" },
                      "Suspension lifted",
                      "Lift the suspension",
                    )
                  }
                >
                  Lift suspension
                </SmallBtn>
              ) : (
                <SmallBtn
                  danger
                  onClick={() =>
                    run(
                      `/admin/users/${id}/status`,
                      { to: "SUSPENDED" },
                      "Account suspended",
                      "Suspend this account",
                    )
                  }
                >
                  Suspend
                </SmallBtn>
              )}
              <SmallBtn
                onClick={() =>
                  run(
                    `/admin/users/${id}/reset-attempts`,
                    {},
                    "Test attempts reset",
                    "Reset their test attempts",
                  )
                }
              >
                Reset attempts
              </SmallBtn>
              <div className="w-44">
                <HzSelect
                  size="sm"
                  label="Change field"
                  placeholder="Change field…"
                  value=""
                  onChange={(v) =>
                    v &&
                    run(
                      `/admin/users/${id}/role`,
                      { role_id: v },
                      `Field changed to ${roleName(v)}`,
                      `Change their field to ${roleName(v)}`,
                    )
                  }
                  options={ROLES.filter((r) => r.id !== data.profile.role_id).map((r) => ({
                    value: r.id,
                    label: r.name,
                  }))}
                />
              </div>
              <SmallBtn
                onClick={() =>
                  act.mutate({
                    path: `/admin/users/${id}/issue-certificate`,
                    body: {},
                    done: "Certificate check queued",
                  })
                }
              >
                Issue certificate
              </SmallBtn>
            </div>
            <Card>
              <CardTitle>Payments</CardTitle>
              {data.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">None</p>
              ) : (
                data.payments.map((p: any) => (
                  <div key={p.id} className="flex justify-between py-1 text-sm">
                    <span>{p.reference}</span>
                    <span>
                      {naira(p.amount_kobo)} <Pill>{p.status}</Pill>
                    </span>
                  </div>
                ))
              )}
            </Card>
            <Card>
              <CardTitle>Journey history</CardTitle>
              {data.events.map((e: any) => (
                <div key={e.id} className="py-1 text-xs">
                  <b>
                    {e.from_status ?? "—"} → {e.to_status}
                  </b>{" "}
                  <span className="text-muted-foreground">
                    {e.reason} · {fmtDateTime(e.created_at)}
                  </span>
                </div>
              ))}
            </Card>
            <p className="text-[11px] text-muted-foreground">
              Viewing a user is read-only and recorded in the audit log.
            </p>
          </>
        )}
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
export function PaymentsTab() {
  const inv = useInvalidate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "payments"],
    queryFn: () => api<any>("/admin/payments"),
  });
  const refund = useMutation({
    mutationFn: ({ id, reason, override }: { id: string; reason: string; override: boolean }) =>
      api(`/admin/payments/${id}/refund`, { body: { reason, override } }),
    onSuccess: () => {
      inv();
      hzToast.success(
        "Refund started",
        "Paystack will return the money to the original payment method.",
      );
    },
    onError: hzToast.fromError,
  });
  if (isLoading) return <TableSkeleton />;
  return (
    <div className="flex flex-col gap-4">
      <ErrorNote error={error ?? refund.error} />
      <Card>
        <CardTitle>Transactions</CardTitle>
        <Table head={["User", "Reference", "Plan", "Amount", "Status", "Via", "Paid", ""]}>
          {(data?.payments ?? []).map((p: any) => (
            <tr key={p.id}>
              <Td>{p.profile?.full_name ?? "—"}</Td>
              <Td className="font-mono text-xs">{p.reference}</Td>
              <Td>{p.plan_id}</Td>
              <Td>{naira(p.amount_kobo)}</Td>
              <Td>
                <Pill
                  tone={
                    p.status === "success" ? "green" : p.status === "pending" ? "gold" : "muted"
                  }
                >
                  {p.status}
                </Pill>
              </Td>
              <Td>{p.verified_via ?? "—"}</Td>
              <Td>{fmtDateTime(p.paid_at)}</Td>
              <Td>
                {p.status === "success" && (
                  <SmallBtn
                    danger
                    onClick={async () => {
                      const v = await hzForm({
                        title: `Refund ${naira(p.amount_kobo)}?`,
                        body: `${p.profile?.full_name ?? "This user"} · ${p.reference}`,
                        danger: true,
                        confirmLabel: "Refund payment",
                        fields: [
                          {
                            name: "reason",
                            label: "Reason (saved to the audit log)",
                            type: "textarea",
                            required: true,
                            minLength: 3,
                            maxLength: 500,
                          },
                          {
                            name: "override",
                            label: "Override the refund policy",
                            type: "checkbox",
                            hint: "Only if this is outside the 48-hour, no-test-started rule.",
                          },
                        ],
                      });
                      if (v)
                        refund.mutate({
                          id: p.id,
                          reason: String(v.reason).trim(),
                          override: Boolean(v.override),
                        });
                    }}
                  >
                    Refund
                  </SmallBtn>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card>
        <CardTitle>Subscriptions</CardTitle>
        <Table head={["User", "Status", "Next payment", "Code"]}>
          {(data?.subscriptions ?? []).map((s: any) => (
            <tr key={s.id}>
              <Td>{s.profile?.full_name}</Td>
              <Td>
                <Pill>{s.status}</Pill>
              </Td>
              <Td>{fmtDate(s.next_payment_date)}</Td>
              <Td className="font-mono text-xs">{s.paystack_subscription_code ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
      {(data?.failed_events ?? []).length > 0 && (
        <Card>
          <CardTitle>Webhook events with errors</CardTitle>
          {data.failed_events.map((e: any) => (
            <div key={e.id} className="py-1 text-xs">
              <b>{e.event_type}</b> {e.reference} — <span className="text-red-500">{e.error}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ContentTab() {
  const inv = useInvalidate();
  const [kind, setKind] = useState<"tests" | "projects" | "personas" | "faq">("tests");
  const [status, setStatus] = useState("draft");
  const [view, setView] = useState<any>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "content", kind, status],
    queryFn: () => api<any[]>(`/admin/content/${kind}?status=${status}`),
  });
  const set = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) =>
      api(`/admin/content/${kind}/${id}/status`, { body: { status: s } }),
    onSuccess: (_d, v) => {
      inv();
      hzToast.success(
        v.s === "approved" ? "Approved" : "Retired",
        v.s === "approved" ? "Learners will see it from now on." : "It's hidden from learners.",
      );
    },
    onError: hzToast.fromError,
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(["tests", "projects", "personas", "faq"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold capitalize ${kind === k ? "bg-primary text-primary-foreground" : "bg-muted"}`}
          >
            {k}
          </button>
        ))}
        <div className="ml-auto w-40">
          <HzSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "draft", label: "Draft" },
              { value: "approved", label: "Approved" },
              { value: "retired", label: "Retired" },
            ]}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        AI-generated (Batch API) content arrives as draft and must be approved before users see it.
        Editing an item returns it to draft.
      </p>
      <ErrorNote error={set.error} />
      {isLoading ? (
        <TableSkeleton />
      ) : (data ?? []).length === 0 ? (
        <EmptyState icon={Search} title={`No ${status} ${kind}`} />
      ) : (
        <Table head={["Item", "Details", "Updated", ""]}>
          {(data ?? []).map((it) => (
            <tr key={it.id}>
              <Td>
                <div className="font-semibold">{it.title ?? it.name ?? it.question}</div>
              </Td>
              <Td className="text-xs text-muted-foreground">
                {kind === "tests"
                  ? `${roleName(it.role_id)} · T${it.test_no} v${it.version} · ${it.kind}`
                  : kind === "projects"
                    ? `${it.archetype_id} · level ${it.level}`
                    : kind === "personas"
                      ? it.archetype_id
                      : (it.role_id ?? "all roles")}
              </Td>
              <Td>{fmtDate(it.updated_at)}</Td>
              <Td>
                <div className="flex gap-1.5">
                  <SmallBtn onClick={() => setView(it)}>View</SmallBtn>
                  {status !== "approved" && (
                    <SmallBtn onClick={() => set.mutate({ id: it.id, s: "approved" })}>
                      Approve
                    </SmallBtn>
                  )}
                  {status !== "retired" && (
                    <SmallBtn danger onClick={() => set.mutate({ id: it.id, s: "retired" })}>
                      Retire
                    </SmallBtn>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {view && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setView(null)} />
          <div className="fixed inset-4 z-50 overflow-auto rounded-xl border border-border bg-background p-4 md:inset-16">
            <button onClick={() => setView(null)} className="float-right" aria-label="Close">
              <X />
            </button>
            <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(view, null, 2)}</pre>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function GradingTab() {
  const inv = useInvalidate();
  const review = useQuery({
    queryKey: ["admin", "review"],
    queryFn: () => api<any>("/admin/grading/review"),
  });
  const appeals = useQuery({
    queryKey: ["admin", "appeals"],
    queryFn: () => api<any[]>("/admin/appeals"),
  });
  const calib = useQuery({
    queryKey: ["admin", "calibration"],
    queryFn: () =>
      api<Record<string, { n: number; within10: number; ran: number }>>("/admin/calibration"),
  });
  const resolve = useMutation({
    mutationFn: ({
      type,
      id,
      score,
      feedback,
      user_id,
    }: {
      type: string;
      id: string;
      score: number;
      feedback?: string;
      user_id?: string;
    }) => api(`/admin/grading/${type}/${id}/resolve`, { body: { score, feedback, user_id } }),
    onSuccess: () => {
      inv();
      hzToast.success("Grade saved", "The learner can see it now.");
    },
    onError: hzToast.fromError,
  });
  const answer = useMutation({
    mutationFn: ({
      id,
      ...b
    }: {
      id: string;
      status: string;
      response: string;
      new_score?: number;
    }) => api(`/admin/appeals/${id}`, { body: b }),
    onSuccess: () => {
      inv();
      hzToast.success("Appeal answered", "The learner has been notified.");
    },
    onError: hzToast.fromError,
  });
  const grade = async (type: string, id: string, user_id?: string) => {
    const v = await hzForm({
      title: "Record the final grade",
      confirmLabel: "Save grade",
      fields: [
        {
          name: "score",
          label: "Final score (0–100)",
          type: "number",
          required: true,
          min: 0,
          max: 100,
        },
        {
          name: "feedback",
          label: "Feedback for the learner (optional)",
          type: "textarea",
          maxLength: 4000,
        },
      ],
    });
    if (!v) return;
    resolve.mutate({
      type,
      id,
      score: Number(v.score),
      feedback: String(v.feedback).trim() || undefined,
      user_id,
    });
  };
  const respond = async (id: string, adjust: boolean) => {
    const v = await hzForm({
      title: adjust ? "Adjust the score" : "Uphold the grade",
      body: "Your response is sent to the learner.",
      confirmLabel: adjust ? "Adjust score" : "Uphold grade",
      fields: [
        ...(adjust
          ? [
              {
                name: "score",
                label: "New score (0–100)",
                type: "number" as const,
                required: true,
                min: 0,
                max: 100,
              },
            ]
          : []),
        {
          name: "response",
          label: "Response to the learner",
          type: "textarea",
          required: true,
          minLength: 10,
          maxLength: 4000,
        },
      ],
    });
    if (!v) return;
    answer.mutate({
      id,
      status: adjust ? "adjusted" : "upheld",
      response: String(v.response).trim(),
      ...(adjust ? { new_score: Number(v.score) } : {}),
    });
  };
  if (review.isLoading) return <TableSkeleton />;
  const r = review.data ?? { test_submissions: [], deliverables: [], flagged_grades: [] };
  return (
    <div className="flex flex-col gap-4">
      <ErrorNote error={resolve.error ?? answer.error} />
      <Card>
        <CardTitle>Test submissions needing a grade ({r.test_submissions.length})</CardTitle>
        {r.test_submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Queue is empty.</p>
        ) : (
          r.test_submissions.map((s: any) => (
            <details key={s.id} className="border-b border-border py-2">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                <b>{s.test_bank?.title}</b>{" "}
                <span className="text-muted-foreground">
                  {roleName(s.test_bank?.role_id)} · T{s.test_no}
                </span>{" "}
                <Pill tone="gold">{s.status.replace("_", " ")}</Pill>
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs">
                {typeof s.answers?.text === "string"
                  ? s.answers.text
                  : JSON.stringify(s.answers, null, 2)}
              </pre>
              <SmallBtn onClick={() => grade("test_submission", s.id)}>Grade</SmallBtn>
            </details>
          ))
        )}
      </Card>
      <Card>
        <CardTitle>Deliverables needing a grade ({r.deliverables.length})</CardTitle>
        {r.deliverables.length === 0 ? (
          <p className="text-sm text-muted-foreground">Queue is empty.</p>
        ) : (
          r.deliverables.map((d: any) => (
            <details key={d.id} className="border-b border-border py-2">
              <summary className="cursor-pointer text-sm">
                <b>{d.task?.title}</b>{" "}
                <span className="text-muted-foreground">{roleName(d.task?.role_id)}</span>{" "}
                <Pill tone="gold">{d.status.replace("_", " ")}</Pill>
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs">
                {d.content}
              </pre>
              <SmallBtn onClick={() => grade("deliverable", d.id)}>Grade</SmallBtn>
            </details>
          ))
        )}
      </Card>
      <Card>
        <CardTitle>Flagged AI grades ({r.flagged_grades.length})</CardTitle>
        {r.flagged_grades.map((g: any) => (
          <div
            key={g.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm"
          >
            <span>
              {g.subject_type} · <ScoreBadge score={g.score} />{" "}
              {g.flags?.possible_prompt_injection && <Pill tone="red">injection?</Pill>}{" "}
              {g.flags?.anomaly && <Pill tone="gold">{g.flags.anomaly}</Pill>}{" "}
              {g.subject_type === "demo" && <Pill>demo review</Pill>}
            </span>
            <SmallBtn onClick={() => grade(g.subject_type, g.subject_id, g.user_id)}>
              Confirm / override
            </SmallBtn>
          </div>
        ))}
      </Card>
      <Card>
        <CardTitle>Appeals</CardTitle>
        {(appeals.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No appeals.</p>
        ) : (
          (appeals.data ?? []).map((a) => (
            <div key={a.id} className="border-b border-border py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{a.profile?.full_name}</b>{" "}
                <Pill tone={a.status === "open" ? "gold" : "muted"}>{a.status}</Pill>{" "}
                <span className="text-xs text-muted-foreground">
                  due {fmtDateTime(a.due_at)} · score {a.grade?.score}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{a.reason}</p>
              {a.status === "open" && (
                <div className="mt-2 flex gap-2">
                  <SmallBtn onClick={() => respond(a.id, false)}>Uphold grade</SmallBtn>
                  <SmallBtn onClick={() => respond(a.id, true)}>Adjust score</SmallBtn>
                </div>
              )}
            </div>
          ))
        )}
      </Card>
      <Card>
        <CardTitle>Calibration (AI within 10 points of human)</CardTitle>
        <p className="mb-2 text-xs text-muted-foreground">
          Run <code>npm run calibrate</code> in the backend before any prompt or model change. Ship
          only if most grades land within 10 points.
        </p>
        {Object.entries(calib.data ?? {}).map(([k, v]) => (
          <div key={k} className="flex justify-between py-1 text-sm">
            <span>{k}</span>
            <span>
              {v.ran
                ? `${v.within10}/${v.ran} (${Math.round((v.within10 / v.ran) * 100)}%)`
                : `not run (${v.n} samples)`}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team: the people who work at Huzzler and what each role can do.
// ---------------------------------------------------------------------------
export const STAFF_ROLES = [
  { value: "admin", label: "Admin", hint: "Everything, including payments, settings and the team" },
  { value: "moderator", label: "Moderator", hint: "Users, grading & appeals, integrity" },
  {
    value: "content_reviewer",
    label: "Content reviewer",
    hint: "Approves tests, projects and personas",
  },
  { value: "partnerships", label: "Partnerships", hint: "Company requests and opportunities" },
  {
    value: "project_manager",
    label: "Project manager",
    hint: "AI PM portal: briefs, squads, sprint board, reports",
  },
];
const staffRoleLabel = (r: string) => STAFF_ROLES.find((s) => s.value === r)?.label ?? r;

export function StaffTab() {
  const inv = useInvalidate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: () => api<any[]>("/admin/staff"),
  });
  const me = useQuery({
    queryKey: ["admin", "whoami"],
    queryFn: () => api<{ id: string }>("/admin/whoami"),
  });
  const [form, setForm] = useState({ identifier: "", app_role: "moderator", staff_title: "" });
  const add = useMutation({
    mutationFn: () =>
      api("/admin/staff", { body: { ...form, staff_title: form.staff_title || undefined } }),
    onSuccess: () => {
      inv();
      hzToast.success(
        "Added to the team",
        `${form.identifier} is now a ${staffRoleLabel(form.app_role).toLowerCase()}.`,
      );
      setForm({ identifier: "", app_role: form.app_role, staff_title: "" });
    },
    onError: hzToast.fromError,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      app_role?: string;
      staff_title?: string | null;
      reason: string;
      done: string;
    }) => api(`/admin/staff/${id}`, { method: "PATCH", body }),
    onSuccess: (_d, v) => {
      inv();
      hzToast.success(v.done);
    },
    onError: hzToast.fromError,
  });
  const remove = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string; name: string }) =>
      api(`/admin/staff/${id}`, { method: "DELETE", body: { reason } }),
    onSuccess: (_d, v) => {
      inv();
      hzToast.success("Removed from the team", `${v.name} is now a regular account.`);
    },
    onError: hzToast.fromError,
  });

  const changeRole = async (s: any, role: string) => {
    if (role === s.app_role) return;
    const reason = await askReason(
      `Make ${s.full_name ?? "them"} a ${staffRoleLabel(role).toLowerCase()}?`,
      "Change role",
    );
    if (reason)
      update.mutate({
        id: s.id,
        app_role: role,
        reason,
        done: `${s.full_name ?? "Role"} is now ${staffRoleLabel(role).toLowerCase()}`,
      });
  };
  const editTitle = async (s: any) => {
    const v = await hzForm({
      title: `Job title for ${s.full_name ?? "this person"}`,
      confirmLabel: "Save title",
      fields: [
        {
          name: "title",
          label: "Job title (shown inside staff tools)",
          placeholder: "e.g. Head of Content",
          defaultValue: s.staff_title ?? "",
          maxLength: 80,
        },
        {
          name: "reason",
          label: "Reason (saved to the audit log)",
          required: true,
          minLength: 3,
          maxLength: 500,
          defaultValue: "Title update",
        },
      ],
    });
    if (v)
      update.mutate({
        id: s.id,
        staff_title: String(v.title).trim() || null,
        reason: String(v.reason).trim(),
        done: "Job title saved",
      });
  };
  const removeStaff = async (s: any) => {
    const reason = await hzPrompt({
      title: `Remove ${s.full_name ?? "this person"} from the team?`,
      body: "They keep their account but lose all staff access straight away.",
      label: "Reason (saved to the audit log)",
      type: "textarea",
      minLength: 3,
      maxLength: 500,
      danger: true,
      confirmLabel: "Remove access",
    });
    if (reason) remove.mutate({ id: s.id, reason, name: s.full_name ?? "They" });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle>Add a team member</CardTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            They need a Huzzler account first. Staff sign in at /admin/login (project managers at
            /aipm/login) with their username.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
            className="grid gap-2 sm:grid-cols-2"
          >
            <input
              className={`${inputCls} !py-2 text-sm sm:col-span-2`}
              placeholder="Username or email"
              aria-label="Username or email"
              required
              minLength={3}
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
            />
            <HzSelect
              label="Role"
              value={form.app_role}
              onChange={(v) => setForm({ ...form, app_role: v })}
              options={STAFF_ROLES}
            />
            <input
              className={`${inputCls} !py-2 text-sm`}
              placeholder="Job title (optional)"
              aria-label="Job title"
              maxLength={80}
              value={form.staff_title}
              onChange={(e) => setForm({ ...form, staff_title: e.target.value })}
            />
            <button disabled={add.isPending} className="btn-duo !py-2 text-sm sm:col-span-2">
              {add.isPending ? "Adding…" : "Add to the team"}
            </button>
          </form>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>What each role can do</CardTitle>
          <ul className="flex flex-col gap-2 text-sm">
            {STAFF_ROLES.map((r) => (
              <li
                key={r.value}
                className="flex flex-col rounded-xl border border-border bg-muted/30 px-3 py-2"
              >
                <span className="font-display font-bold">{r.label}</span>
                <span className="text-xs text-muted-foreground">{r.hint}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ErrorNote error={error} />
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <Table head={["Team member", "Role", "Job title", "Two-factor", "Last sign-in", ""]}>
          {(data ?? []).map((s) => {
            const self = s.id === me.data?.id;
            return (
              <tr key={s.id}>
                <Td>
                  <div className="font-semibold">
                    {s.full_name ?? "—"} {self && <Pill tone="primary">you</Pill>}{" "}
                    {s.is_protected && <Pill tone="gold">protected</Pill>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    @{s.username ?? "—"} · {s.email ?? "no email"}
                  </div>
                </Td>
                <Td>
                  <div className="w-48">
                    <HzSelect
                      size="sm"
                      label={`Role for ${s.full_name ?? "staff member"}`}
                      value={s.app_role}
                      onChange={(v) => changeRole(s, v)}
                      options={STAFF_ROLES}
                      disabled={update.isPending || s.is_protected || self}
                    />
                  </div>
                </Td>
                <Td>
                  <button
                    onClick={() => editTitle(s)}
                    className="text-left text-sm font-semibold hover:text-primary"
                  >
                    {s.staff_title ?? <span className="text-muted-foreground">Add title</span>}
                  </button>
                </Td>
                <Td>
                  {s.mfa ? <Pill tone="green">on</Pill> : <Pill tone="gold">not set up</Pill>}
                </Td>
                <Td className="whitespace-nowrap text-xs">{fmtDateTime(s.last_sign_in_at)}</Td>
                <Td>
                  {!self && !s.is_protected && (
                    <SmallBtn danger onClick={() => removeStaff(s)} disabled={remove.isPending}>
                      Remove
                    </SmallBtn>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function IntegrityTab() {
  const inv = useInvalidate();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "integrity"],
    queryFn: () => api<any>("/admin/integrity"),
  });
  const set = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/admin/integrity/${id}`, { body: { status } }),
    onSuccess: () => {
      inv();
      hzToast.success("Integrity flag updated");
    },
    onError: hzToast.fromError,
  });
  const rep = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/admin/reports/${id}`, { body: { status } }),
    onSuccess: () => {
      inv();
      hzToast.success("Report updated");
    },
    onError: hzToast.fromError,
  });
  if (isLoading) return <TableSkeleton />;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Integrity flags</CardTitle>
        {data.flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          data.flags.map((f: any) => (
            <div key={f.id} className="border-b border-border py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{f.profile?.full_name}</b>{" "}
                <Pill tone={f.status === "open" ? "gold" : "muted"}>{f.status}</Pill>{" "}
                <span className="text-muted-foreground">
                  {f.reason}
                  {f.similarity ? ` (${Math.round(f.similarity * 100)}% similar)` : ""}
                </span>
              </div>
              {f.follow_up_question && (
                <p className="mt-1 text-xs">
                  <b>Q:</b> {f.follow_up_question}
                  <br />
                  <b>A:</b> {f.follow_up_answer ?? <i>not answered yet</i>}
                </p>
              )}
              {f.status === "open" && (
                <div className="mt-1 flex gap-2">
                  <SmallBtn onClick={() => set.mutate({ id: f.id, status: "cleared" })}>
                    Clear
                  </SmallBtn>
                  <SmallBtn danger onClick={() => set.mutate({ id: f.id, status: "confirmed" })}>
                    Confirm
                  </SmallBtn>
                </div>
              )}
            </div>
          ))
        )}
      </Card>
      <Card>
        <CardTitle>Reports & identity checks</CardTitle>
        {data.reports.map((r: any) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm"
          >
            <span>
              {r.target_type === "identity_check" ? "Identity document uploaded" : r.reason}{" "}
              <span className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span>{" "}
              <Pill>{r.status}</Pill>
            </span>
            {r.status === "open" && (
              <div className="flex gap-2">
                <SmallBtn onClick={() => rep.mutate({ id: r.id, status: "actioned" })}>
                  Actioned
                </SmallBtn>
                <SmallBtn onClick={() => rep.mutate({ id: r.id, status: "dismissed" })}>
                  Dismiss
                </SmallBtn>
              </div>
            )}
          </div>
        ))}
        <p className="mt-2 text-xs text-muted-foreground">
          Open the user (Users tab) to view their ID and mark it verified.
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function OpportunitiesTab() {
  const inv = useInvalidate();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "opps"],
    queryFn: () => api<any[]>("/admin/opportunities"),
  });
  const [f, setF] = useState({
    company_name: "",
    role_id: "software_engineer",
    level: "",
    location: "",
    start_date: "",
  });
  const create = useMutation({
    mutationFn: () =>
      api("/admin/opportunities", {
        body: Object.fromEntries(Object.entries(f).filter(([, v]) => v)),
      }),
    onSuccess: () => {
      inv();
      hzToast.success("Company request logged");
    },
    onError: hzToast.fromError,
  });
  const shortlist = useMutation({
    mutationFn: (id: string) => api(`/admin/opportunities/${id}/shortlist`, { method: "POST" }),
    onSuccess: () => {
      inv();
      hzToast.success("Candidates ranked");
    },
    onError: hzToast.fromError,
  });
  const consent = useMutation({
    mutationFn: ({ id, fit_note }: { id: string; fit_note: string }) =>
      api(`/admin/candidates/${id}/request-consent`, { body: { fit_note } }),
    onSuccess: () => {
      inv();
      hzToast.success(
        "Consent requested",
        "We emailed the candidate to ask if we can share their profile.",
      );
    },
    onError: hzToast.fromError,
  });
  const outcome = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/admin/candidates/${id}/outcome`, { body: { status } }),
    onSuccess: () => {
      inv();
      hzToast.success("Candidate updated");
    },
    onError: hzToast.fromError,
  });
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Log a company request</CardTitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="grid gap-2 sm:grid-cols-3"
        >
          <input
            className={`${inputCls} !py-2`}
            placeholder="Company"
            required
            value={f.company_name}
            onChange={(e) => setF({ ...f, company_name: e.target.value })}
          />
          <HzSelect
            label="Role"
            size="lg"
            value={f.role_id}
            onChange={(v) => setF({ ...f, role_id: v })}
            options={ROLES.map((r) => ({ value: r.id, label: r.name }))}
          />
          <input
            className={`${inputCls} !py-2`}
            placeholder="Level"
            value={f.level}
            onChange={(e) => setF({ ...f, level: e.target.value })}
          />
          <input
            className={`${inputCls} !py-2`}
            placeholder="Location"
            value={f.location}
            onChange={(e) => setF({ ...f, location: e.target.value })}
          />
          <input
            type="date"
            className={`${inputCls} !py-2`}
            value={f.start_date}
            onChange={(e) => setF({ ...f, start_date: e.target.value })}
          />
          <button className="btn-duo !py-2 text-sm">Create</button>
        </form>
        <ErrorNote error={create.error ?? shortlist.error ?? consent.error ?? outcome.error} />
      </Card>
      {isLoading ? (
        <TableSkeleton />
      ) : (
        (data ?? []).map((o) => (
          <Card key={o.id}>
            <CardTitle
              aside={<SmallBtn onClick={() => shortlist.mutate(o.id)}>Rank candidates</SmallBtn>}
            >
              {o.company_name} · {roleName(o.role_id)} <Pill>{o.status}</Pill>
            </CardTitle>
            {(o.candidates ?? [])
              .sort((a: any, b: any) => (a.rank ?? 99) - (b.rank ?? 99))
              .map((c: any) => (
                <div key={c.id} className="border-b border-border py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>
                      #{c.rank} {c.profile?.full_name}
                    </b>{" "}
                    <Pill tone="primary">{c.status.replace("_", " ")}</Pill>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.fit_note}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.status === "proposed" && (
                      <SmallBtn
                        onClick={async () => {
                          const note = await hzPrompt({
                            title: `Ask ${c.profile?.full_name ?? "the candidate"} for consent`,
                            body: "They'll see this note explaining why they're a fit before agreeing to share their profile.",
                            label: "Fit note",
                            type: "textarea",
                            defaultValue: c.fit_note ?? "",
                            maxLength: 2000,
                            confirmLabel: "Send request",
                          });
                          if (note) consent.mutate({ id: c.id, fit_note: note });
                        }}
                      >
                        Ask for consent
                      </SmallBtn>
                    )}
                    {c.status === "consented" && (
                      <SmallBtn onClick={() => outcome.mutate({ id: c.id, status: "shared" })}>
                        Mark shared
                      </SmallBtn>
                    )}
                    {["shared", "interview", "offer"].includes(c.status) &&
                      ["interview", "offer", "hired", "not_selected"].map((s) => (
                        <SmallBtn key={s} onClick={() => outcome.mutate({ id: c.id, status: s })}>
                          {s.replace("_", " ")}
                        </SmallBtn>
                      ))}
                  </div>
                </div>
              ))}
          </Card>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function SystemTab() {
  const inv = useInvalidate();
  const flags = useQuery({
    queryKey: ["admin", "flags"],
    queryFn: () => api<any[]>("/admin/flags"),
  });
  const audit = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => api<any[]>("/admin/audit"),
  });
  const save = useMutation({
    mutationFn: ({ key, enabled, value }: { key: string; enabled: boolean; value: unknown }) =>
      api(`/admin/flags/${key}`, { method: "PUT", body: { enabled, value } }),
    onSuccess: () => {
      inv();
      hzToast.success("Setting saved");
    },
    onError: hzToast.fromError,
  });
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Feature flags & settings</CardTitle>
        <p className="mb-2 text-xs text-muted-foreground">
          Move a single AI feature to another model with key <code>ai_models</code>, e.g.{" "}
          {`{"mentor_chat":{"model":"claude-sonnet-5-5"}}`}.
        </p>
        <ErrorNote error={save.error} />
        {(flags.data ?? []).map((f) => (
          <div
            key={f.key}
            className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm"
          >
            <b className="w-48">{f.key}</b>
            <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <HzSwitch
                label={`${f.key} enabled`}
                checked={f.enabled}
                onChange={(on) => save.mutate({ key: f.key, enabled: on, value: f.value })}
              />
              {f.enabled ? "On" : "Off"}
            </span>
            <code className="flex-1 truncate text-xs text-muted-foreground">
              {JSON.stringify(f.value)}
            </code>
            <SmallBtn
              onClick={async () => {
                const v = await hzPrompt({
                  title: `Edit ${f.key}`,
                  label: "Value (JSON)",
                  type: "textarea",
                  defaultValue: JSON.stringify(f.value, null, 2),
                  confirmLabel: "Save",
                  validate: (s) => {
                    try {
                      JSON.parse(s);
                      return null;
                    } catch {
                      return "That isn't valid JSON. Check quotes, commas and brackets.";
                    }
                  },
                });
                if (v !== null)
                  save.mutate({ key: f.key, enabled: f.enabled, value: JSON.parse(v) });
              }}
            >
              Edit
            </SmallBtn>
          </div>
        ))}
        <SmallBtn
          onClick={async () => {
            const key = await hzPrompt({
              title: "Add a feature flag",
              label: "Flag key",
              placeholder: "e.g. ai_models",
              confirmLabel: "Add flag",
              validate: (s) =>
                /^[a-z0-9_]{2,60}$/.test(s)
                  ? null
                  : "Use lowercase letters, numbers and underscores.",
            });
            if (key) save.mutate({ key, enabled: true, value: {} });
          }}
        >
          Add flag
        </SmallBtn>
      </Card>
      <Card>
        <CardTitle>Audit log</CardTitle>
        <div className="max-h-[480px] overflow-y-auto">
          {(audit.data ?? []).map((a) => (
            <div key={a.id} className="border-b border-border py-1.5 text-xs">
              <b>{a.action}</b> by {a.actor?.username ?? a.actor?.full_name ?? "system"} ·{" "}
              {a.target_type} {a.target_id?.slice(0, 8)} ·{" "}
              <span className="text-muted-foreground">{fmtDateTime(a.created_at)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
