import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, HelpCircle, X } from "lucide-react";
import { inputCls } from "./ui";

// ---------------------------------------------------------------------------
// Huzzler dialogs: promise-based replacements for window.prompt / confirm / alert.
//   const reason = await hzPrompt({ title: "Refund reason" });         // string | null
//   if (await hzConfirm({ title: "Submit this test?", danger: true }))  // boolean
//   const v = await hzForm({ title, fields: [...] });                    // values | null
// <DialogHost /> is mounted once in the root layout.
// ---------------------------------------------------------------------------

export type HzField =
  | { name: string; label: string; type?: "text" | "textarea" | "number"; placeholder?: string; defaultValue?: string; required?: boolean; minLength?: number; maxLength?: number; min?: number; max?: number; hint?: string; validate?: (v: string) => string | null }
  | { name: string; label: string; type: "checkbox"; defaultValue?: boolean; hint?: string };

type FormValues = Record<string, string | boolean>;
type Request = {
  title: string;
  body?: ReactNode;
  fields: HzField[];
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (v: FormValues | null) => void;
};

let push: ((r: Request) => void) | null = null;
const queue: Request[] = [];

export function hzForm(opts: { title: string; body?: ReactNode; fields: HzField[]; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<FormValues | null> {
  return new Promise((resolve) => {
    const req: Request = { confirmLabel: "Continue", cancelLabel: "Cancel", danger: false, ...opts, resolve };
    if (push) push(req);
    else queue.push(req);
  });
}

export async function hzPrompt(opts: Omit<Extract<HzField, { type?: "text" | "textarea" | "number" }>, "name" | "label"> & { title: string; body?: ReactNode; label?: string; confirmLabel?: string; danger?: boolean }): Promise<string | null> {
  const { title, body, label, confirmLabel, danger, ...field } = opts;
  const v = await hzForm({ title, body, confirmLabel, danger, fields: [{ required: true, ...field, name: "value", label: label ?? title }] });
  return v ? String(v.value).trim() : null;
}

export async function hzConfirm(opts: { title: string; body?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
  return (await hzForm({ ...opts, fields: [] })) !== null;
}

export function DialogHost() {
  const [current, setCurrent] = useState<Request | null>(null);
  const currentRef = useRef<Request | null>(null);
  const pending = useRef<Request[]>([]);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    const show = (r: Request) => {
      if (currentRef.current) return void pending.current.push(r);
      currentRef.current = r;
      setCurrent(r);
      setSeq((n) => n + 1);
    };
    push = show;
    queue.splice(0).forEach(show);
    return () => {
      push = null;
    };
  }, []);

  const close = (v: FormValues | null) => {
    currentRef.current?.resolve(v);
    const next = pending.current.shift() ?? null;
    currentRef.current = next;
    setCurrent(next);
    if (next) setSeq((n) => n + 1);
  };
  if (!current) return null;
  return <HzDialog key={seq} req={current} onClose={close} />;
}

function HzDialog({ req, onClose }: { req: Request; onClose: (v: FormValues | null) => void }) {
  const [values, setValues] = useState<FormValues>(() =>
    Object.fromEntries(req.fields.map((f) => [f.name, f.type === "checkbox" ? Boolean(f.defaultValue) : (f.defaultValue ?? "")])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const firstRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (firstRef.current ?? confirmRef.current)?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of req.fields) {
      if (f.type === "checkbox") continue;
      const v = String(values[f.name] ?? "").trim();
      if (f.required && !v) errs[f.name] = "This is required.";
      else if (v && f.minLength && v.length < f.minLength) errs[f.name] = `Use at least ${f.minLength} characters.`;
      else if (v && f.type === "number" && (Number.isNaN(Number(v)) || (f.min !== undefined && Number(v) < f.min) || (f.max !== undefined && Number(v) > f.max)))
        errs[f.name] = `Enter a number${f.min !== undefined && f.max !== undefined ? ` from ${f.min} to ${f.max}` : ""}.`;
      else if (f.validate) {
        const msg = f.validate(v);
        if (msg) errs[f.name] = msg;
      }
    }
    setErrors(errs);
    if (!Object.keys(errs).length) onClose(values);
  };

  const Icon = req.danger ? AlertTriangle : HelpCircle;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose(null)}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hz-dialog-title"
        className="hz-fade-up card-duo relative flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto p-6"
      >
        <button type="button" onClick={() => onClose(null)} aria-label="Close" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3 pr-8">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-4 ${req.danger ? "bg-red-500/10 text-red-500 ring-red-500/5" : "bg-primary/10 text-primary ring-primary/5"}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 pt-1">
            <h2 id="hz-dialog-title" className="font-display text-lg font-bold leading-snug">{req.title}</h2>
            {req.body && <div className="mt-1 text-sm text-muted-foreground">{req.body}</div>}
          </div>
        </div>

        {req.fields.map((f, i) =>
          f.type === "checkbox" ? (
            <label key={f.name} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <input
                type="checkbox"
                checked={Boolean(values[f.name])}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-[color:var(--primary)]"
              />
              <span>
                <span className="font-semibold">{f.label}</span>
                {f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}
              </span>
            </label>
          ) : (
            <label key={f.name} className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">{f.label}</span>
              {f.type === "textarea" ? (
                <textarea
                  ref={i === 0 ? firstRef : undefined}
                  rows={4}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                  className={`${inputCls} resize-y text-sm`}
                />
              ) : (
                <input
                  ref={i === 0 ? firstRef : undefined}
                  type={f.type === "number" ? "number" : "text"}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  min={f.min}
                  max={f.max}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                  className={`${inputCls} !py-2.5 text-sm`}
                />
              )}
              {errors[f.name] ? <span className="text-xs font-semibold text-red-500">{errors[f.name]}</span> : f.hint && <span className="text-xs text-muted-foreground">{f.hint}</span>}
            </label>
          ),
        )}

        <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onClose(null)} className="btn-duo-outline !py-2 !px-4 text-sm">{req.cancelLabel}</button>
          <button
            ref={confirmRef}
            type="submit"
            className={req.danger ? "inline-flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-2 text-sm font-bold text-white shadow-[0_4px_0_0_rgb(185_28_28)] transition-transform hover:brightness-110 active:translate-y-0.5 active:shadow-none" : "btn-duo !py-2 !px-4 text-sm"}
          >
            {req.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
