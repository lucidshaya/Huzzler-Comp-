import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Plus, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { roleName } from "@/lib/journey";
import { Card, CardTitle, ErrorNote, fmtDate, inputCls, Notice, Pill } from "./ui";
import { hzToast } from "./Toast";

type Change =
  | {
      kind: "add_task";
      role_id: string;
      title: string;
      description: string;
      due_at: string;
      reason: string;
    }
  | {
      kind: "update_task";
      task_id: string;
      before: { title: string; description: string; due_at: string | null };
      title?: string;
      description?: string;
      due_at?: string;
      reason: string;
    };
type Meeting = {
  id: string;
  title: string;
  held_at: string;
  source: string;
  status: "processing" | "proposed" | "applied" | "dismissed" | "no_changes" | "failed";
  proposal: {
    summary: string;
    decisions: string[];
    action_items: Array<{ role_id: string | null; text: string }>;
    changes: Change[];
  } | null;
  accepted: number[] | null;
  decided_at: string | null;
  author: { full_name: string | null } | null;
  decider: { full_name: string | null } | null;
};

const STATUS: Record<
  Meeting["status"],
  { label: string; tone: "muted" | "primary" | "gold" | "green" | "red" }
> = {
  processing: { label: "AI PM reading", tone: "primary" },
  proposed: { label: "Needs approval", tone: "gold" },
  applied: { label: "Applied", tone: "green" },
  dismissed: { label: "Dismissed", tone: "muted" },
  no_changes: { label: "No changes", tone: "muted" },
  failed: { label: "Saved", tone: "muted" },
};

const first = (p: { full_name: string | null } | null) =>
  (p?.full_name ?? "A teammate").split(" ")[0];

/** Strips cue numbers and timestamps from .vtt / .srt transcripts so only what was said is left. */
function cleanTranscript(text: string) {
  return text
    .split(/\r?\n/)
    .filter((l) => !/^WEBVTT/.test(l) && !/^\d+$/.test(l.trim()) && !/-->/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Meeting notes → AI PM: teams share notes, the AI PM proposes board changes, the PM approves. */
export function Meetings({ readOnly }: { readOnly: boolean }) {
  const { data, error } = useQuery({
    queryKey: ["team", "meetings"],
    queryFn: () => api<{ meetings: Meeting[]; canDecide: boolean }>("/team/meetings"),
    refetchInterval: (q) =>
      q.state.data?.meetings.some((m) => m.status === "processing") ? 4000 : false,
  });
  const [adding, setAdding] = useState(false);
  const meetings = data?.meetings ?? [];

  return (
    <Card>
      <CardTitle
        icon={FileText}
        aside={
          !readOnly &&
          !adding && (
            <button onClick={() => setAdding(true)} className="btn-duo !py-1.5 !px-3 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add meeting notes
            </button>
          )
        }
      >
        Meetings
      </CardTitle>
      <p className="text-sm text-muted-foreground">
        After a meeting, paste the notes or upload the transcript (Google Meet or Gemini notes,
        Zoom, anything you can save as text). The AI PM summarises it and proposes changes to the
        board. Nothing changes until your PM approves.
      </p>
      {adding && <AddMeeting onDone={() => setAdding(false)} />}
      <ErrorNote error={error} />
      <div className="mt-4 flex flex-col gap-3">
        {meetings.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No meetings shared yet.</p>
        )}
        {meetings.map((m) => (
          // Keyed by status so the change checkboxes reset once the proposal arrives.
          <MeetingItem
            key={`${m.id}-${m.status}`}
            m={m}
            canDecide={Boolean(data?.canDecide) && !readOnly}
          />
        ))}
      </div>
    </Card>
  );
}

function AddMeeting({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<"paste" | "upload">("paste");
  const save = useMutation({
    mutationFn: () =>
      api("/team/meetings", {
        body: { title, notes, source, held_at: new Date(`${date}T12:00:00`).toISOString() },
      }),
    onSuccess: () => {
      hzToast.success("Notes shared", "The AI PM is reading them now.");
      void qc.invalidateQueries({ queryKey: ["team", "meetings"] });
      onDone();
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="mt-4 flex flex-col gap-2 rounded-xl border border-border p-3"
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          aria-label="Meeting title"
          className={`${inputCls} !py-2`}
          placeholder="Meeting title, e.g. Sprint planning"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
        />
        <input
          aria-label="Meeting date"
          type="date"
          className={`${inputCls} !py-2`}
          value={date}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <textarea
        aria-label="Meeting notes"
        rows={8}
        className={inputCls}
        placeholder="Paste the notes or transcript here"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSource("paste");
        }}
        minLength={20}
        maxLength={60_000}
        required
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="btn-duo-outline cursor-pointer !py-1.5 !px-3 text-xs">
          <Upload className="h-3.5 w-3.5" /> Upload transcript (.txt, .md, .vtt, .srt)
          <input
            type="file"
            accept=".txt,.md,.vtt,.srt,text/plain,text/markdown,text/vtt"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 2_000_000)
                return hzToast.error(
                  "That file is too large",
                  "Upload a text transcript under 2 MB.",
                );
              const text = /\.(vtt|srt)$/i.test(file.name)
                ? cleanTranscript(await file.text())
                : (await file.text()).trim();
              setNotes(text.slice(0, 60_000));
              setSource("upload");
              if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 160));
              if (text.length > 60_000)
                hzToast.info("Transcript trimmed", "Only the first 60,000 characters are kept.");
            }}
          />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={onDone} className="btn-duo-outline !py-1.5 !px-3 text-xs">
            Cancel
          </button>
          <button
            disabled={save.isPending || notes.trim().length < 20 || !title.trim()}
            className="btn-duo !py-1.5 !px-3 text-xs disabled:opacity-50"
          >
            Share with AI PM
          </button>
        </div>
      </div>
      <ErrorNote error={save.error} />
    </form>
  );
}

function ChangeLine({ c }: { c: Change }) {
  if (c.kind === "add_task")
    return (
      <>
        <div className="font-semibold">
          New task: {c.title}{" "}
          <span className="font-normal text-muted-foreground">
            · {roleName(c.role_id)} · due {fmtDate(c.due_at)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">{c.description}</div>
      </>
    );
  return (
    <>
      <div className="font-semibold">Change task: {c.before.title}</div>
      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        {c.title && <span>Title → {c.title}</span>}
        {c.due_at && (
          <span>
            Due {fmtDate(c.before.due_at)} → {fmtDate(c.due_at)}
          </span>
        )}
        {c.description && <span>Scope → {c.description}</span>}
      </div>
    </>
  );
}

function MeetingItem({ m, canDecide }: { m: Meeting; canDecide: boolean }) {
  const qc = useQueryClient();
  const changes = m.proposal?.changes ?? [];
  const [picked, setPicked] = useState<Set<number>>(() => new Set(changes.map((_, i) => i)));
  const [showNotes, setShowNotes] = useState(false);
  const notes = useQuery({
    queryKey: ["team", "meetings", m.id, "notes"],
    queryFn: () => api<{ notes: string }>(`/team/meetings/${m.id}/notes`),
    enabled: showNotes,
  });
  const decide = useMutation({
    mutationFn: (accept: number[]) =>
      api<{ applied: number }>(`/team/meetings/${m.id}/decision`, { body: { accept } }),
    onSuccess: (r) => {
      hzToast.success(r.applied ? `Board updated (${r.applied})` : "Proposal dismissed");
      void qc.invalidateQueries({ queryKey: ["team", "meetings"] });
      void qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
  const s = STATUS[m.status];
  const accepted = new Set(m.accepted ?? []);

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-sm font-bold">{m.title}</div>
          <div className="text-xs text-muted-foreground">
            {fmtDate(m.held_at)} · shared by {first(m.author)}
            {m.source === "upload" ? " · transcript" : ""}
          </div>
        </div>
        <Pill tone={s.tone}>{s.label}</Pill>
      </div>

      {m.status === "processing" && (
        <p className="mt-2 text-sm text-muted-foreground">The AI PM is reading the notes…</p>
      )}
      {m.status === "failed" && (
        <p className="mt-2 text-sm text-muted-foreground">
          Huzzler AI couldn't read these notes, so the plan is unchanged. The notes are kept here
          for the team.
        </p>
      )}
      {m.proposal && (
        <div className="mt-2 flex flex-col gap-2 text-sm">
          <p>{m.proposal.summary}</p>
          {m.proposal.decisions.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Decisions
              </div>
              <ul className="ml-4 list-disc text-muted-foreground">
                {m.proposal.decisions.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {m.proposal.action_items.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Action items
              </div>
              <ul className="ml-4 list-disc text-muted-foreground">
                {m.proposal.action_items.map((a, i) => (
                  <li key={i}>
                    {a.role_id && <b className="text-foreground">{roleName(a.role_id)}: </b>}
                    {a.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {changes.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Proposed board changes
              </div>
              <ul className="mt-1 flex flex-col gap-2">
                {changes.map((c, i) => (
                  <li key={i} className="flex gap-2 rounded-lg bg-muted/50 p-2">
                    {m.status === "proposed" && canDecide ? (
                      <input
                        type="checkbox"
                        aria-label={`Apply change ${i + 1}`}
                        className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--primary)]"
                        checked={picked.has(i)}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(i);
                          else next.delete(i);
                          setPicked(next);
                        }}
                      />
                    ) : m.status === "applied" && accepted.has(i) ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]" />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <ChangeLine c={c} />
                      <div className="mt-0.5 text-[11px] italic text-muted-foreground">
                        Why: {c.reason}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {m.status === "proposed" &&
        (canDecide ? (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              disabled={decide.isPending}
              onClick={() => decide.mutate([])}
              className="btn-duo-outline !py-1.5 !px-3 text-xs"
            >
              Dismiss all
            </button>
            <button
              disabled={decide.isPending || picked.size === 0}
              onClick={() => decide.mutate([...picked])}
              className="btn-duo !py-1.5 !px-3 text-xs disabled:opacity-50"
            >
              Apply {picked.size} of {changes.length}
            </button>
          </div>
        ) : (
          <Notice>Waiting for your PM to approve these changes.</Notice>
        ))}
      {(m.status === "applied" || m.status === "dismissed") && m.decided_at && (
        <p className="mt-2 text-xs text-muted-foreground">
          {m.status === "applied" ? "Applied" : "Dismissed"} by {first(m.decider)} on{" "}
          {fmtDate(m.decided_at)}
        </p>
      )}
      <ErrorNote error={decide.error} />

      <button
        onClick={() => setShowNotes((v) => !v)}
        className="mt-2 text-xs font-bold text-primary"
      >
        {showNotes ? "Hide notes" : "View notes"}
      </button>
      {showNotes && (
        <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-2 font-sans text-xs text-muted-foreground">
          {notes.data?.notes ?? "Loading…"}
        </pre>
      )}
    </div>
  );
}
