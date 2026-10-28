/* eslint-disable @typescript-eslint/no-explicit-any -- test content is loosely shaped JSON per test kind */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, ErrorNote, Field, fmtDate, inputCls, Notice, Pill } from "@/components/app/ui";
import { CardSkeleton } from "@/components/app/Skeleton";
import { HzSelect } from "@/components/app/HzSelect";
import { hzConfirm, hzForm } from "@/components/app/Dialogs";
import { hzToast } from "@/components/app/Toast";

const KIND_LABEL: Record<string, string> = {
  mcq: "Multiple choice",
  sjt: "Teamwork judgement",
  ranking: "Ranking",
  numeric: "Numbers from data",
  seeded_issues: "Spot the issues",
  ai_rubric: "Written task (AI-graded)",
  code_sandbox: "Code (sandbox)",
  sql_result: "SQL (sandbox)",
};
const STATUS_TONE: Record<string, "green" | "gold" | "muted"> = {
  approved: "green",
  draft: "gold",
  retired: "muted",
};

type Pool = {
  ai: boolean;
  generatable: string[];
  roles: Array<{
    id: string;
    name: string;
    tests: Array<{
      test_no: number;
      kind: string | null;
      approved: number;
      drafts: number;
      versions: any[];
    }>;
  }>;
};

export function TestPoolView() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["aipm", "test-pool"],
    queryFn: () => api<Pool>("/aipm/test-pool"),
  });
  const [roleId, setRoleId] = useState("");
  const [testNo, setTestNo] = useState("1");
  const [brief, setBrief] = useState("");
  const [count, setCount] = useState("2");
  const [difficulty, setDifficulty] = useState("standard");
  const [open, setOpen] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["aipm", "test-pool"] });
  const generate = useMutation({
    mutationFn: () =>
      api<{ drafts: any[]; dropped: number }>("/aipm/test-pool/generate", {
        body: {
          role_id: role!.id,
          test_no: Number(testNo),
          brief: brief.trim(),
          count: Number(count),
          difficulty,
        },
      }),
    onSuccess: (r) => {
      void refresh();
      setBrief("");
      hzToast.success(
        `${r.drafts.length} draft${r.drafts.length === 1 ? "" : "s"} ready for review${r.dropped ? ` (${r.dropped} dropped by the checks)` : ""}.`,
      );
    },
    onError: hzToast.fromError,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/aipm/test-pool/${id}/status`, { body: { status } }),
    onSuccess: (_r, v) => {
      void refresh();
      void qc.invalidateQueries({ queryKey: ["aipm", "test-version", v.id] });
      hzToast.success(
        v.status === "approved"
          ? "Approved. New learners can now be served this version."
          : v.status === "retired"
            ? "Retired. Learners won't be served it any more."
            : "Moved back to draft.",
      );
    },
    onError: hzToast.fromError,
  });

  if (isLoading) return <CardSkeleton />;
  const roles = data?.roles ?? [];
  const role = roles.find((r) => r.id === roleId) ?? roles[0];
  const slot = role?.tests.find((t) => t.test_no === Number(testNo));
  const canGenerate = Boolean(data?.ai && slot?.kind && data.generatable.includes(slot.kind));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="chip w-fit">Test pool</span>
          <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
            Vary the onboarding tests.
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Describe what a test should assess and the AI drafts new versions in the same format.
            Nothing reaches learners until you approve it. Each learner is served one approved
            version per test, rotated so retakes get a different one.
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-duo-outline !py-2 !px-4 text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>
      <ErrorNote error={error ?? setStatus.error} />

      {!data?.ai && (
        <Notice tone="warn">
          Connect the AI key to generate tests. The existing bank keeps working, and you can still
          review, edit, approve and retire versions here.
        </Notice>
      )}

      {role && (
        <section className="card-duo flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2 font-display text-base font-bold">
            <Sparkles className="h-4 w-4 text-primary" /> Generate new versions
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Field">
              <HzSelect
                value={role.id}
                onChange={setRoleId}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
              />
            </Field>
            <Field label="Test">
              <HzSelect
                value={testNo}
                onChange={setTestNo}
                options={role.tests.map((t) => ({
                  value: String(t.test_no),
                  label: `Test ${t.test_no} · ${KIND_LABEL[t.kind ?? ""] ?? "—"}`,
                }))}
              />
            </Field>
            <Field label="Versions">
              <HzSelect
                value={count}
                onChange={setCount}
                options={["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n }))}
              />
            </Field>
            <Field label="Difficulty">
              <HzSelect
                value={difficulty}
                onChange={setDifficulty}
                options={[
                  { value: "easier", label: "Easier" },
                  { value: "standard", label: "Standard" },
                  { value: "harder", label: "Harder" },
                ]}
              />
            </Field>
          </div>
          <Field
            label="What should this test assess?"
            hint="For example: 'prioritising under a tight deadline for a fintech serving market traders'. 10–2,000 characters."
          >
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              maxLength={2000}
              className={inputCls}
              placeholder="The skills, setting and situations you want covered"
            />
          </Field>
          {slot?.kind && !data?.generatable.includes(slot.kind) && (
            <p className="text-xs text-muted-foreground">
              This test runs code in a sandbox, so new versions are written by hand for now.
            </p>
          )}
          <button
            disabled={!canGenerate || brief.trim().length < 10 || generate.isPending}
            onClick={() => generate.mutate()}
            className="btn-duo w-fit !py-2 !px-5 text-sm disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {generate.isPending ? "Drafting… (up to a minute)" : "Draft versions"}
          </button>
        </section>
      )}

      {roles.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No fields yet" />
      ) : (
        roles.map((r) => (
          <section key={r.id} className="card-duo p-6">
            <div className="mb-4 font-display text-base font-bold">{r.name}</div>
            <div className="divide-y divide-border">
              {r.tests.map((t) => (
                <div key={t.test_no} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <b>Test {t.test_no}</b>
                    <span className="text-muted-foreground">{KIND_LABEL[t.kind ?? ""] ?? "—"}</span>
                    <Pill tone={t.approved ? "green" : "red"}>{t.approved} approved</Pill>
                    {t.drafts > 0 && <Pill tone="gold">{t.drafts} to review</Pill>}
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    {t.versions.map((v) => (
                      <div key={v.id}>
                        <button
                          onClick={() => setOpen(open === v.id ? null : v.id)}
                          className="flex w-full flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                        >
                          <span className="font-mono text-muted-foreground">v{v.version}</span>
                          <span className="font-semibold">{v.title}</span>
                          <Pill tone={STATUS_TONE[v.status] ?? "muted"}>{v.status}</Pill>
                          {v.source === "ai" && <Pill tone="primary">AI</Pill>}
                          {v.difficulty && v.difficulty !== "standard" && (
                            <Pill>{v.difficulty}</Pill>
                          )}
                          <span className="text-muted-foreground">
                            served {v.served}
                            {v.pass_rate != null && ` · ${v.pass_rate}% pass`} ·{" "}
                            {fmtDate(v.created_at)}
                          </span>
                        </button>
                        {open === v.id && (
                          <VersionDetail
                            id={v.id}
                            onStatus={(status) => setStatus.mutate({ id: v.id, status })}
                            busy={setStatus.isPending}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function VersionDetail({
  id,
  onStatus,
  busy,
}: {
  id: string;
  onStatus: (s: string) => void;
  busy: boolean;
}) {
  const qc = useQueryClient();
  const { data: v, isLoading } = useQuery({
    queryKey: ["aipm", "test-version", id],
    queryFn: () => api<any>(`/aipm/test-pool/${id}`),
  });
  const edit = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/aipm/test-pool/${id}`, { method: "PUT", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["aipm", "test-pool"] });
      void qc.invalidateQueries({ queryKey: ["aipm", "test-version", id] });
      hzToast.success("Saved as a draft. Approve it again when you're happy.");
    },
    onError: hzToast.fromError,
  });
  if (isLoading || !v) return <div className="p-3 text-xs text-muted-foreground">Loading…</div>;

  const editJson = async () => {
    const json = (s: string) => {
      try {
        JSON.parse(s);
        return null;
      } catch {
        return "Not valid JSON";
      }
    };
    const f = await hzForm({
      title: `Edit v${v.version}`,
      body: "Editing sends this version back to draft so it's re-approved.",
      confirmLabel: "Save draft",
      fields: [
        { name: "title", label: "Title", defaultValue: v.title, required: true, maxLength: 200 },
        {
          name: "content",
          label: "Shown to learners (JSON)",
          type: "textarea",
          defaultValue: JSON.stringify(v.content, null, 2),
          validate: json,
        },
        {
          name: "answer_key",
          label: "Answer key, never shown (JSON)",
          type: "textarea",
          defaultValue: JSON.stringify(v.answer_key ?? {}, null, 2),
          validate: json,
        },
      ],
    });
    if (f)
      edit.mutate({
        title: String(f.title).trim(),
        content: JSON.parse(String(f.content)),
        answer_key: JSON.parse(String(f.answer_key)),
      });
  };
  const retire = async () => {
    if (
      await hzConfirm({
        title: `Retire v${v.version}?`,
        body: "Learners won't be served it any more.",
        danger: true,
      })
    )
      onStatus("retired");
  };

  return (
    <div className="mx-2 mb-3 mt-1 flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
      {v.generation_brief && (
        <p className="text-xs text-muted-foreground">
          <b>Idea:</b> {v.generation_brief}
        </p>
      )}
      <Preview kind={v.kind} content={v.content ?? {}} keyData={v.answer_key ?? {}} />
      <div className="flex flex-wrap gap-2">
        {v.status !== "approved" && (
          <button
            disabled={busy}
            onClick={() => onStatus("approved")}
            className="btn-duo !py-1.5 !px-4 text-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
          </button>
        )}
        <button
          onClick={editJson}
          disabled={edit.isPending}
          className="btn-duo-outline !py-1.5 !px-4 text-xs"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        {v.status !== "retired" && (
          <button
            disabled={busy}
            onClick={retire}
            className="btn-duo-outline !py-1.5 !px-4 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" /> Retire
          </button>
        )}
      </div>
    </div>
  );
}

/** Readable preview of a test with its answer key, so a reviewer can check it without reading JSON. */
function Preview({ kind, content: c, keyData: k }: { kind: string; content: any; keyData: any }) {
  const intro = (
    <>
      {c.instructions && <p>{c.instructions}</p>}
      {c.context && <p className="text-xs text-muted-foreground">{c.context}</p>}
      {c.brief && (
        <p className="whitespace-pre-wrap rounded-lg bg-background p-3 text-xs">{c.brief}</p>
      )}
    </>
  );
  if (kind === "mcq" || kind === "sjt")
    return (
      <div className="flex flex-col gap-3">
        {intro}
        <ol className="flex list-decimal flex-col gap-3 pl-5">
          {(c.questions ?? []).map((q: any) => (
            <li key={q.id}>
              <p className="font-semibold">{q.prompt}</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                {q.options.map((o: any) => {
                  const right = kind === "mcq" && k.answers?.[q.id] === o.id;
                  const pts = kind === "sjt" ? k.scores?.[q.id]?.[o.id] : null;
                  return (
                    <li
                      key={o.id}
                      className={
                        right
                          ? "font-bold text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]"
                          : ""
                      }
                    >
                      {o.id}) {o.label} {right && "✓"}{" "}
                      {pts != null && <span className="text-muted-foreground">({pts} pts)</span>}
                    </li>
                  );
                })}
              </ul>
              {(k.explanations?.[q.id] || k.rationale?.[q.id]) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {k.explanations?.[q.id] ?? k.rationale?.[q.id]}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  if (kind === "ranking")
    return (
      <div className="flex flex-col gap-2">
        {intro}
        <p className="text-xs font-bold">Correct order</p>
        <ol className="list-decimal pl-5 text-xs">
          {(k.order ?? []).map((id: string) => {
            const it = (c.items ?? []).find((i: any) => i.id === id);
            return (
              <li key={id}>
                {it?.label ?? id} <span className="text-muted-foreground">· {it?.detail}</span>
              </li>
            );
          })}
        </ol>
        {k.rationale && <p className="text-xs text-muted-foreground">{k.rationale}</p>}
      </div>
    );
  if (kind === "numeric")
    return (
      <div className="flex flex-col gap-2">
        {intro}
        {c.data && (
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  {c.data.columns.map((h: string) => (
                    <th key={h} className="px-2 py-1 text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.data.rows.map((row: string[], i: number) => (
                  <tr key={i} className="border-t border-border">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Notice tone="warn">Check each answer against the table: the AI worked them out.</Notice>
        <ul className="flex flex-col gap-1 text-xs">
          {(c.questions ?? []).map((q: any) => (
            <li key={q.id}>
              {q.prompt} → <b>{k.answers?.[q.id]?.value}</b> {q.unit}
              {k.answers?.[q.id]?.explanation && (
                <span className="text-muted-foreground"> · {k.answers[q.id].explanation}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  if (kind === "seeded_issues") {
    const issues = new Map((k.issues ?? []).map((i: any) => [i.target, i.category]));
    return (
      <div className="flex flex-col gap-2">
        {intro}
        <ul className="flex flex-col gap-1 text-xs">
          {(c.material?.items ?? []).map((i: any) => (
            <li key={i.id}>
              <span className="font-mono">{i.id}</span> {i.text}{" "}
              {issues.has(i.id) && <Pill tone="gold">{String(issues.get(i.id))}</Pill>}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {intro}
      {k.checks && (
        <p className="text-xs text-muted-foreground">
          {k.checks.min_words ?? "?"}–{k.checks.max_words ?? "?"} words
          {k.checks.required_sections?.length
            ? ` · headings: ${k.checks.required_sections.join(", ")}`
            : ""}
          {c.allow_image ? " · image upload" : ""}
        </p>
      )}
    </div>
  );
}
