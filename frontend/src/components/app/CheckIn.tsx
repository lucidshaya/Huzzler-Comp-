import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CheckCircle2, X } from "lucide-react";
import { api } from "@/lib/api";
import { Card, ErrorNote, inputCls } from "@/components/app/ui";

/**
 * Daily check-in: a button that opens a short form in a pop-up. Once it's sent the card shows
 * "You've checked in for today". Check-ins feed the 5pm team summary and the reliability score.
 */
export function CheckIn({ checkedIn, compact }: { checkedIn: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  if (compact)
    return (
      <>
        {checkedIn ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--brand-green)]/40 bg-[color:var(--brand-green)]/10 px-3 py-2 text-sm font-bold text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]">
            <CheckCircle2 className="h-4 w-4" /> Checked in today
          </span>
        ) : (
          <button onClick={() => setOpen(true)} className="btn-duo-outline !px-4 !py-2 text-sm">
            <CalendarCheck className="h-4 w-4" /> Check in
          </button>
        )}
        {open && <CheckInDialog onClose={() => setOpen(false)} />}
      </>
    );
  return (
    <Card>
      {checkedIn ? (
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color:var(--brand-green)]/15 text-[color:var(--brand-green-deep)] dark:text-[color:var(--brand-green)]">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <div>
            <div className="font-display text-base font-bold">You've checked in for today</div>
            <p className="text-sm text-muted-foreground">
              It's in the team summary at 5pm WAT. Come back tomorrow.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 font-display text-base font-bold">
            <CalendarCheck className="h-4 w-4 text-primary" /> Daily check-in
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Three quick questions so your squad knows where you are. It takes a minute.
          </p>
          <button onClick={() => setOpen(true)} className="btn-duo mt-3 w-full !py-2.5 text-sm">
            Check in for today
          </button>
        </>
      )}
      {open && <CheckInDialog onClose={() => setOpen(false)} />}
    </Card>
  );
}

function CheckInDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ yesterday: "", today: "", blockers: "" });
  const m = useMutation({
    mutationFn: () => api("/checkins", { body: { ...f, blockers: f.blockers || undefined } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspace"] });
      void qc.invalidateQueries({ queryKey: ["team", "checkins"] });
      onClose();
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.classList.add("overflow-hidden");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("overflow-hidden");
    };
  }, [onClose]);

  const fields = [
    {
      k: "yesterday",
      label: "What did you get done since your last check-in?",
      ph: "e.g. Finished the spec draft and shared it in chat",
      required: true,
    },
    {
      k: "today",
      label: "What will you work on today?",
      ph: "e.g. Answer the engineer's questions and add acceptance criteria",
      required: true,
    },
    {
      k: "blockers",
      label: "Anything blocking you? (optional)",
      ph: "e.g. Waiting on the designs from Ada",
      required: false,
    },
  ] as const;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Daily check-in"
        onClick={(e) => e.stopPropagation()}
        className="hz-fade-up flex max-h-full w-full max-w-lg flex-col overflow-y-auto rounded-3xl border border-border bg-background p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-primary">
              Daily check-in
            </span>
            <h2 className="mt-1 font-display text-xl font-bold">How's it going today?</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:border-primary hover:text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
          className="mt-4 flex flex-col gap-4"
        >
          {fields.map((x, i) => (
            <label key={x.k} className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">{x.label}</span>
              <textarea
                autoFocus={i === 0}
                rows={2}
                maxLength={1000}
                className={inputCls}
                placeholder={x.ph}
                value={f[x.k]}
                onChange={(e) => setF({ ...f, [x.k]: e.target.value })}
                required={x.required}
              />
            </label>
          ))}
          <ErrorNote error={m.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-duo-outline !px-4 !py-2 text-sm">
              Cancel
            </button>
            <button disabled={m.isPending} className="btn-duo !px-5 !py-2 text-sm">
              {m.isPending ? "Sending…" : "Check in"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
