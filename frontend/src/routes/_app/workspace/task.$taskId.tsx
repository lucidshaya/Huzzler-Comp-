import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, KeyRound, Lightbulb, Lock, Paperclip, Send, Upload } from "lucide-react";
import { api, uploadFile } from "@/lib/api";
import { roleName, useMe } from "@/lib/journey";
import {
  Card,
  CardTitle,
  ErrorNote,
  fmtDate,
  fmtDateTime,
  inputCls,
  Notice,
  PageHeader,
  Pill,
  ScoreBadge,
  Spinner,
} from "@/components/app/ui";
import { Appeal } from "@/components/app/Appeal";
import { HzSelect } from "@/components/app/HzSelect";
import { DetailSkeleton } from "@/components/app/Skeleton";

export const Route = createFileRoute("/_app/workspace/task/$taskId")({
  head: () => ({ meta: [{ title: "Task · Huzzler" }] }),
  component: TaskPage,
});

type Detail = {
  task: {
    id: string;
    title: string;
    description: string;
    role_id: string;
    assignee_id: string | null;
    status: string;
    due_at: string | null;
    project: { level: number; status: string };
  };
  hints: Array<{ index: number; text?: string; locked?: boolean }>;
  mentorOpen: boolean;
  deliverables: Array<{
    id: string;
    content: string;
    links: string[];
    status: string;
    score: number | null;
    submitted_at: string;
    standin_member_id?: string | null;
    grade: {
      id?: string;
      score: number;
      criteria: Record<string, { score: number; note: string }>;
      strengths: string;
      gaps: string;
      next_steps: string[];
      feedback: string;
    } | null;
  }>;
};

const STATUS_OPTIONS = [
  { v: "todo", l: "To do" },
  { v: "in_progress", l: "In progress" },
  { v: "blocked", l: "Blocked" },
];

function TaskPage() {
  const { taskId } = Route.useParams();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api<Detail>(`/tasks/${taskId}`),
    refetchInterval: (q) =>
      q.state.data?.deliverables.some((d) => d.status === "grading") ? 8000 : false,
  });
  const setStatus = useMutation({
    mutationFn: (status: string) => api(`/tasks/${taskId}`, { method: "PATCH", body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task", taskId] }),
  });
  const hint = useMutation({
    mutationFn: () => api(`/tasks/${taskId}/hints`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task", taskId] }),
  });

  // "Upload" links land on #submit before the task has loaded: scroll once the form exists.
  const loaded = Boolean(data && me);
  useEffect(() => {
    if (loaded && window.location.hash === "#submit")
      document.getElementById("submit")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loaded]);

  if (isLoading || !me) return <DetailSkeleton label="Loading task" />;
  if (error || !data) return <ErrorNote error={error} onRetry={() => refetch()} />;
  const { task } = data;
  const mine = task.assignee_id === me.user.id;
  const readOnly = me.journey.status === "LAPSED" || task.project.status !== "active";

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/workspace"
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Workspace
      </Link>
      <PageHeader
        chip={`${roleName(task.role_id)} · Project ${task.project.level}`}
        title={task.title}
        body={task.due_at ? `Due ${fmtDate(task.due_at)}` : undefined}
        actions={
          mine && !readOnly && task.status !== "done" && task.status !== "review" ? (
            <div className="flex flex-wrap items-center gap-2">
              <a href="#submit" className="btn-duo !px-4 !py-2 text-sm">
                <Upload className="h-4 w-4" /> Upload your work
              </a>
              <div className="w-44">
                <HzSelect
                  label="Task status"
                  value={task.status}
                  onChange={(v) => setStatus.mutate(v)}
                  disabled={setStatus.isPending}
                  options={STATUS_OPTIONS.map((o) => ({ value: o.v, label: o.l }))}
                />
              </div>
            </div>
          ) : (
            <Pill tone={task.status === "done" ? "green" : "primary"}>
              {task.status.replace("_", " ")}
            </Pill>
          )
        }
      />
      <ErrorNote error={setStatus.error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardTitle>Task brief</CardTitle>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{task.description}</p>
          </Card>
          {mine && !readOnly && task.status !== "done" && <SubmitDeliverable taskId={taskId} />}
          {data.deliverables.map((d) => (
            <Card key={d.id}>
              <CardTitle
                aside={
                  d.standin_member_id ? (
                    <Pill tone="muted">AI stand-in · not graded</Pill>
                  ) : d.status === "graded" ? (
                    <ScoreBadge score={d.score} />
                  ) : (
                    <Pill tone="gold">
                      {d.status === "awaiting_ai"
                        ? "Queued for grading"
                        : d.status.replace("_", " ")}
                    </Pill>
                  )
                }
              >
                {d.standin_member_id ? "Huzzler AI stand-in" : "Submission"} ·{" "}
                {fmtDateTime(d.submitted_at)}
              </CardTitle>
              <p
                className={`whitespace-pre-wrap text-sm text-muted-foreground ${d.standin_member_id ? "max-h-96 overflow-y-auto" : "line-clamp-6"}`}
              >
                {d.content}
              </p>
              {d.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.links.map((l) => (
                    <a
                      key={l}
                      href={l}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                    >
                      {l}
                    </a>
                  ))}
                </div>
              )}
              {d.grade && (
                <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 text-sm">
                  <p>{d.grade.feedback}</p>
                  {d.grade.strengths && (
                    <p>
                      <b className="text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]">
                        Strengths:
                      </b>{" "}
                      <span className="text-muted-foreground">{d.grade.strengths}</span>
                    </p>
                  )}
                  {d.grade.gaps && (
                    <p>
                      <b className="text-[color:var(--gold)]">Gaps:</b>{" "}
                      <span className="text-muted-foreground">{d.grade.gaps}</span>
                    </p>
                  )}
                  {d.grade.next_steps?.length > 0 && (
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {d.grade.next_steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                  {d.grade.id && mine && <Appeal gradeId={d.grade.id} appeal={null} />}
                </div>
              )}
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle icon={Lightbulb}>Hints</CardTitle>
            <ol className="flex flex-col gap-2">
              {data.hints.map((h) => (
                <li
                  key={h.index}
                  className={`rounded-lg border p-3 text-sm ${h.locked ? "border-dashed border-border text-muted-foreground" : "border-primary/30 bg-primary/5"}`}
                >
                  <span className="mr-1 font-bold">Hint {h.index + 1}:</span>
                  {h.locked ? (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" /> locked
                    </span>
                  ) : (
                    h.text
                  )}
                </li>
              ))}
            </ol>
            {data.hints.some((h) => h.locked) && !readOnly && (
              <button
                onClick={() => hint.mutate()}
                disabled={hint.isPending}
                className="btn-duo-outline mt-3 w-full !py-2 text-sm"
              >
                <KeyRound className="h-4 w-4" /> Unlock next hint
              </button>
            )}
            <ErrorNote error={hint.error} />
          </Card>
          <Mentor taskId={taskId} open={data.mentorOpen} readOnly={readOnly} />
        </div>
      </div>
    </div>
  );
}

const MAX_FILES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
type Attached = { key: string; name: string; path?: string; error?: string };

function SubmitDeliverable({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [links, setLinks] = useState("");
  const [files, setFiles] = useState<Attached[]>([]);
  const [declared, setDeclared] = useState(false);
  const [dragging, setDragging] = useState(false);
  const uploading = files.some((f) => !f.path && !f.error);
  const m = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/deliverables`, {
        body: {
          content,
          links: links.split(/\s+/).filter((l) => /^https?:\/\//.test(l)),
          file_paths: files.flatMap((f) => (f.path ? [f.path] : [])),
          ai_declaration: declared,
        },
      }),
    onSuccess: () => {
      setContent("");
      setLinks("");
      setFiles([]);
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []).slice(0, Math.max(0, MAX_FILES - files.length));
    for (const f of picked) {
      const key = `${f.name}-${f.size}-${Math.random()}`;
      if (f.size > MAX_BYTES) {
        setFiles((x) => [...x, { key, name: f.name, error: "Over 10 MB" }]);
        continue;
      }
      setFiles((x) => [...x, { key, name: f.name }]);
      uploadFile(f)
        .then((path) => setFiles((x) => x.map((y) => (y.key === key ? { ...y, path } : y))))
        .catch((e) =>
          setFiles((x) =>
            x.map((y) =>
              y.key === key ? { ...y, error: e instanceof Error ? e.message : "Upload failed" } : y,
            ),
          ),
        );
    }
  };
  return (
    <section id="submit" className="card-duo scroll-mt-24 p-5 ring-2 ring-primary/30 md:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Upload className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold">Submit your work</h2>
          <p className="text-sm text-muted-foreground">
            Upload your files, add any links and say what you did. It's graded against this task's
            rubric.
          </p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="flex flex-col gap-5"
      >
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${dragging ? "border-primary bg-primary/10" : "border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10"}`}
        >
          <Upload className="h-7 w-7 text-primary" />
          <span className="font-display text-base font-bold">
            Drag files here or <span className="text-primary underline">browse</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Up to {MAX_FILES} files, 10 MB each: documents, designs, images, exports or a zip
          </span>
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {files.length > 0 && (
          <ul className="flex flex-col gap-2">
            {files.map((f) => (
              <li
                key={f.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-semibold">{f.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs">
                  {f.error ? (
                    <span className="font-semibold text-red-500">{f.error}</span>
                  ) : f.path ? (
                    <span className="font-semibold text-primary">Uploaded</span>
                  ) : (
                    <span className="text-muted-foreground">Uploading…</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiles((x) => x.filter((y) => y.key !== f.key))}
                    className="font-semibold text-muted-foreground hover:text-red-500"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Links</span>
          <input
            className={inputCls}
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            placeholder="Figma, Google Doc, GitHub PR… separate with spaces"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">What did you do?</span>
          <textarea
            rows={7}
            className={inputCls}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Summarise your work, the decisions you made and where to find everything (20+ characters)"
            required
            minLength={20}
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[color:var(--primary)]"
            checked={declared}
            onChange={(e) => setDeclared(e.target.checked)}
          />
          This is my own work.
        </label>
        <ErrorNote error={m.error} />
        <button
          disabled={m.isPending || uploading || !declared || content.length < 20}
          className="btn-duo self-end !px-5 !py-2.5 disabled:opacity-50"
        >
          {uploading ? "Waiting for uploads…" : m.isPending ? "Submitting…" : "Submit for grading"}
        </button>
      </form>
    </section>
  );
}

function Mentor({ taskId, open, readOnly }: { taskId: string; open: boolean; readOnly: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["mentor", taskId],
    queryFn: () =>
      api<{
        messages: Array<{ role: string; content: string; source: string | null }>;
        remainingToday: number;
        limit: number;
      }>(`/mentor/${taskId}`),
    enabled: open,
  });
  const [q, setQ] = useState("");
  const m = useMutation({
    mutationFn: () => api(`/mentor/${taskId}`, { body: { question: q } }),
    onSuccess: () => {
      setQ("");
      qc.invalidateQueries({ queryKey: ["mentor", taskId] });
    },
  });
  return (
    <Card>
      <CardTitle
        icon={Bot}
        aside={
          open && data ? (
            <span className="text-xs text-muted-foreground">
              {data.remainingToday}/{data.limit} today
            </span>
          ) : undefined
        }
      >
        Huzzler AI mentor
      </CardTitle>
      {!open ? (
        <p className="text-sm text-muted-foreground">
          Unlock all three hints first. The mentor then helps you take the next step — it won't do
          the task for you.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto">
            {(data?.messages ?? []).map((msg, i) => (
              <div
                key={i}
                className={`rounded-xl px-3 py-2 text-sm ${msg.role === "user" ? "self-end bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.source === "faq" && (
                  <span className="mt-1 block text-[10px] uppercase tracking-wider opacity-70">
                    From the FAQ
                  </span>
                )}
              </div>
            ))}
          </div>
          {!readOnly && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                m.mutate();
              }}
              className="flex gap-2"
            >
              <input
                aria-label="Ask the mentor"
                className={`${inputCls} !py-2 text-sm`}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ask a specific question"
                maxLength={1500}
              />
              <button
                disabled={m.isPending || q.trim().length < 3 || data?.remainingToday === 0}
                aria-label="Send"
                className="btn-duo !px-3 !py-2"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          )}
          <ErrorNote error={m.error} />
          {data?.remainingToday === 0 && (
            <Notice tone="warn">You've used today's mentor messages. Ask your team in chat.</Notice>
          )}
        </div>
      )}
    </Card>
  );
}
