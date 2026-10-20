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
import { TableSkeleton } from "@/components/app/Skeleton";

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["admin"] });
};
const ask = (msg: string) => window.prompt(msg)?.trim() || null;

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
        <select
          aria-label="Filter by status"
          className="rounded-xl border border-border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
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
                  {u.app_role !== "user" ? ` · ${u.app_role}` : ""}
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
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api(path, { body }),
    onSuccess: inv,
  });
  const run = (path: string, body: Record<string, unknown>, prompt?: string) => {
    if (prompt) {
      const reason = ask(prompt);
      if (!reason) return;
      body.reason = reason;
    }
    act.mutate({ path, body });
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
                  run(`/admin/users/${id}/verify-identity`, {
                    verified: !data.profile.identity_verified,
                  })
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
                      "Reason for lifting suspension",
                    )
                  }
                >
                  Lift suspension
                </SmallBtn>
              ) : (
                <SmallBtn
                  danger
                  onClick={() =>
                    run(`/admin/users/${id}/status`, { to: "SUSPENDED" }, "Reason for suspension")
                  }
                >
                  Suspend
                </SmallBtn>
              )}
              <SmallBtn
                onClick={() =>
                  run(`/admin/users/${id}/reset-attempts`, {}, "Reason for resetting attempts")
                }
              >
                Reset attempts
              </SmallBtn>
              <select
                aria-label="Change field"
                className="rounded-lg border border-border bg-background px-2 text-xs"
                defaultValue=""
                onChange={(e) =>
                  e.target.value &&
                  run(
                    `/admin/users/${id}/role`,
                    { role_id: e.target.value },
                    "Reason for changing field",
                  )
                }
              >
                <option value="">Change field…</option>
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {!data.profile.is_protected && (
                <select
                  aria-label="Staff role"
                  className="rounded-lg border border-border bg-background px-2 text-xs"
                  defaultValue=""
                  onChange={(e) =>
                    e.target.value &&
                    run(
                      `/admin/users/${id}/role`,
                      { app_role: e.target.value },
                      "Reason for staff role change",
                    )
                  }
                >
                  <option value="">Staff role…</option>
                  {["user", "moderator", "content_reviewer", "partnerships", "admin"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
              <SmallBtn
                onClick={() =>
                  act.mutate({ path: `/admin/users/${id}/issue-certificate`, body: {} })
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
    onSuccess: inv,
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
                    onClick={() => {
                      const reason = ask("Refund reason");
                      if (reason)
                        refund.mutate({
                          id: p.id,
                          reason,
                          override: confirm(
                            "Override the refund policy if this is outside it? (Cancel = enforce policy)",
                          ),
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
    onSuccess: inv,
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
        <select
          aria-label="Status"
          className="ml-auto rounded-xl border border-border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {["draft", "approved", "retired"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
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
    onSuccess: inv,
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
    onSuccess: inv,
  });
  const grade = (type: string, id: string, user_id?: string) => {
    const s = ask("Final score (0-100)");
    if (s === null || Number.isNaN(Number(s))) return;
    resolve.mutate({
      type,
      id,
      score: Number(s),
      feedback: ask("Feedback for the user (optional)") ?? undefined,
      user_id,
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
                  <SmallBtn
                    onClick={() => {
                      const response = ask("Response to the user (10+ chars)");
                      if (response) answer.mutate({ id: a.id, status: "upheld", response });
                    }}
                  >
                    Uphold grade
                  </SmallBtn>
                  <SmallBtn
                    onClick={() => {
                      const s = ask("New score (0-100)");
                      const response = s && ask("Response to the user");
                      if (s && response)
                        answer.mutate({
                          id: a.id,
                          status: "adjusted",
                          response,
                          new_score: Number(s),
                        });
                    }}
                  >
                    Adjust score
                  </SmallBtn>
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
export function TeamsTab() {
  const inv = useInvalidate();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => api<any>("/admin/teams"),
  });
  const match = useMutation({
    mutationFn: () => api<{ formed: number }>("/admin/teams/run-matching", { method: "POST" }),
    onSuccess: inv,
  });
  if (isLoading) return <TableSkeleton />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => match.mutate()}
          disabled={match.isPending}
          className="btn-duo !py-2 !px-4 text-sm"
        >
          {match.isPending ? "Matching…" : "Run squad matching now"}
        </button>
        {match.data && <span className="text-sm">Formed {match.data.formed} team(s).</span>}
        <span className="text-sm text-muted-foreground">
          {data.waiting.length} accepted candidates waiting for a team
        </span>
      </div>
      <ErrorNote error={match.error} />
      <Table head={["Team", "Archetype", "Status", "Level", "Members", "Created"]}>
        {data.teams.map((t: any) => (
          <tr key={t.id}>
            <Td className="font-semibold">{t.name}</Td>
            <Td>{t.archetype_id}</Td>
            <Td>
              <Pill>{t.status}</Pill>
            </Td>
            <Td>P{t.current_level}</Td>
            <Td>
              <div className="flex flex-wrap gap-1">
                {t.members
                  .filter((m: any) => m.status === "active")
                  .map((m: any) => (
                    <Pill key={m.id} tone={m.is_standin ? "gold" : "primary"}>
                      {m.is_standin ? "stand-in" : m.profile?.full_name?.split(" ")[0]} ·{" "}
                      {roleName(m.role_id).split(" ")[0]}
                    </Pill>
                  ))}
              </div>
            </Td>
            <Td>{fmtDate(t.created_at)}</Td>
          </tr>
        ))}
      </Table>
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
    onSuccess: inv,
  });
  const rep = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/admin/reports/${id}`, { body: { status } }),
    onSuccess: inv,
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
    onSuccess: inv,
  });
  const shortlist = useMutation({
    mutationFn: (id: string) => api(`/admin/opportunities/${id}/shortlist`, { method: "POST" }),
    onSuccess: inv,
  });
  const consent = useMutation({
    mutationFn: ({ id, fit_note }: { id: string; fit_note: string }) =>
      api(`/admin/candidates/${id}/request-consent`, { body: { fit_note } }),
    onSuccess: inv,
  });
  const outcome = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/admin/candidates/${id}/outcome`, { body: { status } }),
    onSuccess: inv,
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
          <select
            className={`${inputCls} !py-2`}
            value={f.role_id}
            onChange={(e) => setF({ ...f, role_id: e.target.value })}
          >
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
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
                        onClick={() => {
                          const note = window.prompt(
                            "Edit the fit note, then ask for consent",
                            c.fit_note,
                          );
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
    onSuccess: inv,
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
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={(e) =>
                  save.mutate({ key: f.key, enabled: e.target.checked, value: f.value })
                }
              />{" "}
              enabled
            </label>
            <code className="flex-1 truncate text-xs text-muted-foreground">
              {JSON.stringify(f.value)}
            </code>
            <SmallBtn
              onClick={() => {
                const v = window.prompt("JSON value", JSON.stringify(f.value));
                if (v !== null) {
                  try {
                    save.mutate({ key: f.key, enabled: f.enabled, value: JSON.parse(v) });
                  } catch {
                    alert("Invalid JSON");
                  }
                }
              }}
            >
              Edit
            </SmallBtn>
          </div>
        ))}
        <SmallBtn
          onClick={() => {
            const key = ask("New flag key (e.g. ai_models)");
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
