import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Camera,
  CheckCircle2,
  ImagePlus,
  LifeBuoy,
  MessageCircleQuestion,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { ErrorNote } from "./Feedback";
import { ButtonSpinner } from "./Loader";
import { ErrorBoundary } from "./ErrorBoundary";
import { fmtDateTime, inputCls, Pill } from "./ui";

export const CATEGORIES = [
  { id: "bug", label: "Something's broken" },
  { id: "payment", label: "Payment or billing" },
  { id: "account", label: "Account or sign-in" },
  { id: "tests", label: "Onboarding tests" },
  { id: "team", label: "My team or project" },
  { id: "grading", label: "A grade or appeal" },
  { id: "other", label: "Something else" },
] as const;

export type Ticket = {
  id: string;
  category: string;
  subject: string;
  status: string;
  unread_by_user: boolean;
  last_message_at: string;
  created_at: string;
};
export type SupportMessage = {
  id: string;
  sender_id: string | null;
  is_staff: boolean;
  body: string;
  attachment_url: string | null;
  created_at: string;
};

export const STATUS_TONE: Record<string, "gold" | "primary" | "green" | "muted"> = {
  open: "gold",
  awaiting_user: "primary",
  resolved: "green",
  closed: "muted",
};
export const STATUS_LABEL: Record<string, string> = {
  open: "Waiting for Huzzler",
  awaiting_user: "Huzzler replied",
  resolved: "Resolved",
  closed: "Closed",
};

const MAX_BYTES = 8 * 1024 * 1024;

/** Uploads a screenshot to the private bucket and returns its storage path. */
async function uploadScreenshot(blob: Blob, name = "screenshot.png") {
  const ext = (name.split(".").pop() || "png").toLowerCase().replace("jpeg", "jpg");
  if (!["png", "jpg", "webp", "gif"].includes(ext))
    throw new ApiError(400, "Screenshots must be PNG, JPG, WebP or GIF.");
  if (blob.size > MAX_BYTES)
    throw new ApiError(400, "That image is over 8 MB. Try a smaller screenshot.");
  const signed = await api<{ path: string; token: string }>("/support/upload-url", {
    body: { ext },
  });
  const { error } = await supabase()
    .storage.from("submissions")
    .uploadToSignedUrl(signed.path, signed.token, blob, {
      contentType: blob.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
    });
  if (error) throw new ApiError(400, error.message);
  return signed.path;
}

/** Captures the visible page (minus the help panel) as a PNG. Loaded only when used. */
async function capturePage(): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(document.body, {
    cacheBust: true,
    // Google Fonts' stylesheet is cross-origin and can't be read; skipping it avoids errors and a slow capture.
    skipFonts: true,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    width: window.innerWidth,
    height: window.innerHeight,
    style: { transform: `translateY(-${window.scrollY}px)` },
    filter: (node) => !(node instanceof HTMLElement && node.dataset.noCapture === "true"),
  });
  if (!blob) throw new Error("Couldn't capture the screen. Upload a screenshot instead.");
  return blob;
}

/** Screenshot picker: capture the page, upload a file, or paste from the clipboard. */
export function ScreenshotPicker({
  value,
  onChange,
  onBusy,
}: {
  value: { path: string; preview: string } | null;
  onChange: (v: { path: string; preview: string } | null) => void;
  onBusy?: (b: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const run = async (fn: () => Promise<Blob>, name?: string) => {
    setErr(null);
    setBusy(true);
    onBusy?.(true);
    try {
      const blob = await fn();
      const path = await uploadScreenshot(blob, name);
      onChange({ path, preview: URL.createObjectURL(blob) });
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) void run(async () => file, file.name || "pasted.png");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (value) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border">
        <img
          src={value.preview}
          alt="Attached screenshot"
          className="max-h-44 w-full object-cover object-top"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Remove screenshot"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(capturePage, "screen.png")}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {busy ? <ButtonSpinner /> : <Camera className="h-4 w-4" />} <span>Capture screen</span>
        </button>
        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold hover:border-primary hover:text-primary">
          <ImagePlus className="h-4 w-4" /> Upload image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run(async () => f, f.name);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Optional. You can also paste a screenshot (Ctrl/⌘ + V).
      </p>
      <ErrorNote error={err} />
    </div>
  );
}

/** The "Report an issue" form, used in the help widget and on the Support page. */
export function ReportForm({
  onDone,
  compact = false,
  initial,
}: {
  onDone?: (ticketId: string) => void;
  compact?: boolean;
  /** Pre-filled from the help bot when it couldn't answer. */
  initial?: { subject?: string; body?: string; category?: string };
}) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>(initial?.category ?? "bug");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [shot, setShot] = useState<{ path: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const m = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/support/tickets", {
        body: {
          category,
          subject,
          body,
          page_url: window.location.pathname,
          user_agent: navigator.userAgent.slice(0, 300),
          attachment_path: shot?.path,
        },
      }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["support"] });
      onDone?.(t.id);
    },
  });
  if (m.isSuccess) {
    return (
      <div className="hz-fade-up flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-[color:var(--brand-green)]" />
        <div className="font-display text-lg font-bold">Thanks — we've got it</div>
        <p className="text-sm text-muted-foreground">
          A person from the Huzzler team will reply here and by email, usually within one working
          day.
        </p>
        <Link
          to="/support"
          search={{ ticket: m.data.id }}
          onClick={() => onDone?.(m.data.id)}
          className="btn-duo !py-2 !px-4 text-sm"
        >
          View the conversation
        </Link>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">What's it about?</span>
        <select
          className={`${inputCls} !py-2.5`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Short summary</span>
        <input
          className={`${inputCls} !py-2.5`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={140}
          required
          minLength={3}
          placeholder="e.g. Test 3 won't submit"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">What happened?</span>
        <textarea
          className={inputCls}
          rows={compact ? 4 : 6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          required
          minLength={10}
          placeholder="What were you doing, what did you expect, and what happened instead?"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Screenshot</span>
        <ScreenshotPicker value={shot} onChange={setShot} onBusy={setUploading} />
      </div>
      <ErrorNote error={m.error} onRetry={() => m.mutate()} />
      <button
        disabled={m.isPending || uploading || subject.trim().length < 3 || body.trim().length < 10}
        className="btn-duo !py-2.5 disabled:opacity-50"
      >
        {m.isPending ? <ButtonSpinner /> : <Send className="h-4 w-4" />} <span>Send report</span>
      </button>
    </form>
  );
}

/** A support conversation with reply box (user side). */
export function TicketThread({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const { data, error, refetch } = useQuery({
    queryKey: ["support", "ticket", ticketId],
    queryFn: () =>
      api<{ ticket: Ticket; messages: SupportMessage[] }>(`/support/tickets/${ticketId}`),
    refetchInterval: 10_000,
  });
  const [body, setBody] = useState("");
  const [shot, setShot] = useState<{ path: string; preview: string } | null>(null);
  const [showShot, setShowShot] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Braces matter: newer browsers return a Promise from scroll methods, and React would call it as cleanup.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [data?.messages.length]);
  useEffect(() => {
    // Live updates when staff reply (RLS lets users read only their own tickets).
    const ch = supabase()
      .channel(`support-${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        () => refetch(),
      )
      .subscribe();
    return () => void supabase().removeChannel(ch);
  }, [ticketId, refetch]);
  const send = useMutation({
    mutationFn: () =>
      api(`/support/tickets/${ticketId}/messages`, { body: { body, attachment_path: shot?.path } }),
    onSuccess: () => {
      setBody("");
      setShot(null);
      setShowShot(false);
      qc.invalidateQueries({ queryKey: ["support"] });
    },
  });
  if (error) return <ErrorNote error={error} onRetry={() => refetch()} />;
  if (!data)
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-16" />
        ))}
      </div>
    );
  const closed = data.ticket.status === "closed";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-display text-lg font-bold">{data.ticket.subject}</div>
          <div className="text-xs text-muted-foreground">
            Opened {fmtDateTime(data.ticket.created_at)}
          </div>
        </div>
        <Pill tone={STATUS_TONE[data.ticket.status]}>{STATUS_LABEL[data.ticket.status]}</Pill>
      </div>
      <ol className="flex flex-col gap-3" aria-label="Conversation">
        {data.messages.map((m) => (
          <li key={m.id} className={`flex flex-col ${m.is_staff ? "items-start" : "items-end"}`}>
            <span className="mb-1 text-[11px] font-semibold text-muted-foreground">
              {m.is_staff ? "Huzzler support" : "You"} · {fmtDateTime(m.created_at)}
            </span>
            <div
              className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.is_staff ? "border border-primary/30 bg-primary/5" : "bg-primary text-primary-foreground"}`}
            >
              {m.body}
              {m.attachment_url && (
                <a
                  href={m.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block overflow-hidden rounded-lg border border-border/50"
                >
                  <img
                    src={m.attachment_url}
                    alt="Attached screenshot"
                    className="max-h-56 w-full object-cover object-top"
                  />
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div ref={endRef} />
      {closed ? (
        <p className="rounded-xl bg-muted p-3 text-center text-sm text-muted-foreground">
          This report is closed. Open a new report if you still need help.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) send.mutate();
          }}
          className="flex flex-col gap-2 rounded-2xl border border-border p-3"
        >
          <textarea
            aria-label="Your reply"
            rows={3}
            className={`${inputCls} !border-0 !p-1 focus:!ring-0`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            placeholder="Write a reply…"
          />
          {showShot && <ScreenshotPicker value={shot} onChange={setShot} />}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowShot((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary"
            >
              <ImagePlus className="h-4 w-4" /> Screenshot
            </button>
            <button
              disabled={send.isPending || !body.trim()}
              className="btn-duo !py-2 !px-4 text-sm disabled:opacity-50"
            >
              {send.isPending ? <ButtonSpinner /> : <Send className="h-4 w-4" />} Send
            </button>
          </div>
          <ErrorNote error={send.error} onRetry={() => send.mutate()} />
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating help widget: help bot (RAG over the FAQ) + report an issue
// ---------------------------------------------------------------------------
type BotMsg = {
  from: "user" | "bot";
  text: string;
  id?: string | null;
  related?: string[];
  source?: string;
  rated?: boolean;
  /** The question this reply answers, used to pre-fill a report. */
  question?: string;
  failed?: boolean;
  /** Set when the bot isn't getting them there: shows a "Talk to a person" card. */
  handoff?: string | null;
};

/** The floating help bubble. A crash inside it stays inside the panel instead of taking down the page. */
export function HelpWidget() {
  return (
    <ErrorBoundary
      where="help_widget"
      fallback={(reset) => (
        <div
          role="alert"
          className="fixed bottom-[88px] right-4 z-50 w-[300px] rounded-2xl border border-border bg-background p-4 shadow-2xl md:bottom-6 md:right-6"
        >
          <div className="font-display text-sm font-bold">Help hit a snag</div>
          <p className="mt-1 text-xs text-muted-foreground">
            We've logged it. Reopen help, or report the problem from the Help &amp; support page.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={reset} className="btn-duo !py-1.5 !px-3 text-xs">
              Reopen help
            </button>
            <Link
              to="/support"
              search={{ new: true }}
              onClick={reset}
              className="btn-duo-outline !py-1.5 !px-3 text-xs"
            >
              Help &amp; support
            </Link>
          </div>
        </div>
      )}
    >
      <HelpWidgetPanel />
    </ErrorBoundary>
  );
}

function HelpWidgetPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ask" | "report" | "reports">("ask");
  const [prefill, setPrefill] = useState<{ subject?: string; body?: string; category?: string }>();
  const navigate = useNavigate();
  const unread = useQuery({
    queryKey: ["support", "unread"],
    queryFn: () => api<{ unread: number }>("/support/unread"),
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const openReport = () => {
      setOpen(true);
      setPrefill(undefined);
      setTab("report");
    };
    window.addEventListener("huzzler:report-issue", openReport);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("huzzler:report-issue", openReport);
    };
  }, []);
  const count = unread.data?.unread ?? 0;

  return (
    <div data-no-capture="true">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={`Help and support${count ? `, ${count} unread replies` : ""}`}
          className="group fixed bottom-[88px] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_30px_-8px_var(--primary)] transition-transform hover:scale-105 active:scale-95 md:bottom-6 md:right-6"
        >
          <MessageCircleQuestion className="h-6 w-6" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[color:var(--fire)] px-1 text-[10px] font-bold text-white">
              {count}
            </span>
          )}
          <span className="pointer-events-none absolute right-16 hidden whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1 text-xs font-semibold text-background opacity-0 transition-opacity group-hover:opacity-100 md:block">
            Need help?
          </span>
        </button>
      )}
      {open && (
        <section
          role="dialog"
          aria-label="Help and support"
          className="hz-fade-up fixed inset-x-2 bottom-2 top-16 z-50 flex flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:h-[620px] sm:max-h-[calc(100vh-6rem)] sm:w-[400px]"
        >
          <header className="flex items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20">
                <Bot className="h-5 w-5" />
              </span>
              <div>
                <div className="font-display text-sm font-bold">Huzzler help</div>
                <div className="text-[11px] opacity-80">
                  Answers in seconds · a person if you need one
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close help"
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"
            >
              <X className="h-5 w-5" />
            </button>
          </header>
          <nav className="grid grid-cols-3 border-b border-border text-sm font-bold" role="tablist">
            {(
              [
                ["ask", "Ask"],
                ["report", "Report an issue"],
                ["reports", `My reports${count ? ` (${count})` : ""}`],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`min-h-11 px-2 text-xs sm:text-sm ${tab === k ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
              >
                {l}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "ask" && (
              <HelpBot
                onReport={(asked) => {
                  const last = asked.at(-1);
                  setPrefill(
                    last
                      ? {
                          category: "other",
                          subject: last.slice(0, 140),
                          body: `What I asked the help bot:\n${asked
                            .slice(-5)
                            .map((a) => `- ${a}`)
                            .join("\n")}\n\nWhat I still need help with: `,
                        }
                      : undefined,
                  );
                  setTab("report");
                }}
              />
            )}
            {tab === "report" && (
              <ReportForm
                key={prefill?.subject ?? "blank"}
                initial={prefill}
                compact
                onDone={(id) => {
                  setOpen(false);
                  navigate({ to: "/support", search: { ticket: id } });
                }}
              />
            )}
            {tab === "reports" && <MyReportsList onPick={() => setOpen(false)} />}
          </div>
        </section>
      )}
    </div>
  );
}

function HelpBot({ onReport }: { onReport: (asked: string[]) => void }) {
  const [msgs, setMsgs] = useState<BotMsg[]>([
    {
      from: "bot",
      text: "Hi! Ask me anything about Huzzler: payments, tests, your squad, certificates. If I can't help, I'll get you to a person.",
    },
  ]);
  const [q, setQ] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const sugg = useQuery({
    queryKey: ["help", "suggestions"],
    queryFn: () => api<string[]>("/help/suggestions"),
    staleTime: 300_000,
  });
  const ask = useMutation({
    mutationFn: ({ question, history }: { question: string; history: BotMsg[] }) =>
      api<{
        id: string | null;
        answer: string;
        source: string;
        related: string[];
        handoff: string | null;
      }>("/help/ask", {
        // Earlier turns (not the greeting) so follow-ups like "what about monthly?" make sense.
        body: {
          question,
          history: history
            .slice(1, -1)
            .slice(-8)
            .map(({ from, text }) => ({ from, text })),
        },
      }),
    onSuccess: (r, { question }) =>
      setMsgs((m) => [
        ...m,
        {
          from: "bot",
          text: r.answer,
          id: r.id,
          related: r.related,
          source: r.source,
          question,
          handoff: r.handoff,
        },
      ]),
    onError: (e, { question }) =>
      setMsgs((m) => [
        ...m,
        {
          from: "bot",
          text:
            e instanceof ApiError && e.status !== 0 && e.status < 500
              ? e.message
              : "I couldn't reach Huzzler just now. Try again, or report it and a person will help.",
          question,
          failed: true,
        },
      ]),
  });
  const rate = useMutation({
    mutationFn: ({ id, helpful }: { id: string; helpful: boolean }) =>
      api("/help/feedback", { body: { id, helpful } }),
  });
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, ask.isPending]);
  const asked = msgs.filter((m) => m.from === "user").map((m) => m.text);
  const submit = (text: string) => {
    const t = text.trim();
    if (t.length < 2 || ask.isPending) return;
    const next: BotMsg[] = [...msgs, { from: "user", text: t }];
    setMsgs(next);
    setQ("");
    ask.mutate({ question: t, history: next });
  };
  return (
    <div className="flex h-full flex-col gap-3">
      <div ref={listRef} className="flex flex-1 flex-col gap-3" aria-live="polite">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col ${m.from === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${m.from === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              {m.text}
            </div>
            {m.from === "bot" && m.id && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {m.source === "faq" && <span>From the Huzzler FAQ</span>}
                {m.source === "ai" && <span>Huzzler AI</span>}
                {!m.rated ? (
                  <span className="flex items-center gap-1">
                    Helpful?
                    <button
                      aria-label="Helpful"
                      onClick={() => {
                        rate.mutate({ id: m.id!, helpful: true });
                        setMsgs((x) => x.map((y, j) => (j === i ? { ...y, rated: true } : y)));
                      }}
                      className="rounded p-1 hover:text-primary"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      aria-label="Not helpful"
                      onClick={() => {
                        rate.mutate({ id: m.id!, helpful: false });
                        setMsgs((x) =>
                          x.map((y, j) =>
                            j === i
                              ? {
                                  ...y,
                                  rated: true,
                                  handoff:
                                    y.handoff ??
                                    "Sorry that didn't help. A person from the Huzzler team can take a look.",
                                }
                              : y,
                          ),
                        );
                      }}
                      className="rounded p-1 hover:text-red-500"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : (
                  <span>Thanks for the feedback</span>
                )}
              </div>
            )}
            {m.from === "bot" && (m.handoff || m.failed) && (
              <div className="mt-2 w-full max-w-[90%] rounded-2xl border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm">
                  {m.handoff ?? "A person from the Huzzler team can help with this."}
                </p>
                <button
                  onClick={() => onReport(asked)}
                  className="btn-duo mt-2.5 !px-3 !py-1.5 text-xs"
                >
                  <LifeBuoy className="h-3.5 w-3.5" /> Talk to a person
                </button>
              </div>
            )}
            {m.related && m.related.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.related.map((r) => (
                  <button
                    key={r}
                    onClick={() => submit(r)}
                    className="rounded-full border border-border px-2.5 py-1 text-left text-xs hover:border-primary hover:text-primary"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {ask.isPending && (
          <div className="flex gap-1 self-start rounded-2xl bg-muted px-4 py-3" aria-label="Typing">
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
                style={{ animationDelay: `${d * 120}ms` }}
              />
            ))}
          </div>
        )}
        {msgs.length === 1 && (sugg.data ?? []).length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Popular questions
            </span>
            {sugg.data!.map((s) => (
              <button
                key={s}
                onClick={() => submit(s)}
                className="rounded-xl border border-border px-3 py-2 text-left text-sm hover:border-primary hover:text-primary"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className="sticky bottom-0 flex gap-2 bg-background pt-1"
      >
        <input
          aria-label="Ask a question"
          className={`${inputCls} !py-2.5`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={500}
          placeholder="Ask a question…"
        />
        <button
          disabled={ask.isPending || q.trim().length < 2}
          aria-label="Send"
          className="btn-duo !px-3 !py-2 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <button
        onClick={() => onReport(asked)}
        className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        <LifeBuoy className="h-3.5 w-3.5" /> Talk to a person instead
      </button>
    </div>
  );
}

function MyReportsList({ onPick }: { onPick: () => void }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["support", "list"],
    queryFn: () => api<Ticket[]>("/support/tickets"),
  });
  if (isLoading)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-14" />
        ))}
      </div>
    );
  if (error) return <ErrorNote error={error} onRetry={() => refetch()} />;
  if (!data?.length)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No reports yet. If something's not working, tell us in “Report an issue”.
      </p>
    );
  return (
    <ul className="flex flex-col gap-2">
      {data.map((t) => (
        <li key={t.id}>
          <Link
            to="/support"
            search={{ ticket: t.id }}
            onClick={onPick}
            className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 hover:border-primary"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 truncate font-semibold">
                {t.unread_by_user && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--fire)]"
                    aria-label="New reply"
                  />
                )}
                {t.subject}
              </span>
              <span className="text-xs text-muted-foreground">
                {fmtDateTime(t.last_message_at)}
              </span>
            </span>
            <Pill tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Pill>
          </Link>
        </li>
      ))}
    </ul>
  );
}
